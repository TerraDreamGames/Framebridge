-- Reusable receiver capabilities are device-local; never include them in a place or export.
local Relay = {}
function Relay.new(url, http, storage, now)
    now = now or function() return DateTime.now().UnixTimestampMillis end
    local self = { token=nil, code=nil, paired=false, revision=0, expiresAt=0, betaAccess="", pollAfter=2, scopeVersion=0, scopeResetVersion=0 }
    local scope=storage and storage.scope and storage.scope() or nil
    local function save()
        if not storage then return end
        local record = self.token and {origin=url,receiverToken=self.token,expiresAt=self.expiresAt} or nil
        local ok, persisted = pcall(function() return storage.save(record,scope) end)
        self.storageError = not ok
        self.storagePersistent = ok and persisted~=false
    end
    local function clearMemory()
        self.token=nil; self.code=nil; self.paired=false; self.revision=0; self.expiresAt=0
        self.storageError=nil; self.storagePersistent=nil
    end
    local function clear()
        clearMemory()
        save()
    end
    function self:syncScope()
        if not storage or not storage.scope then return false end
        local current=storage.scope()
        if current==scope then return false end
        local previous=scope
        scope=current
        self.scopeVersion+=1
        if previous==0 and current~=0 and self.token then
            save()
            return "promoted"
        end
        -- Changing published places must not copy, revoke or clear the old place's capability.
        self.scopeResetVersion=self.scopeVersion
        clearMemory()
        return "changed"
    end
    local function request(method,path,body,capability)
        self.lastStatus=nil
        if url=="" then error("This build needs a deployed transfer service. See docs/RELEASE.md.",0) end
        local headers={ ["Content-Type"]="application/json" }
        local requestToken=capability or self.token
        local requestVersion=self.scopeVersion
        if requestToken then headers.Authorization="Bearer " .. requestToken end
        if path=="/v1/sessions" and self.betaAccess~="" then headers["X-Framebridge-Beta"]=self.betaAccess end
        local options={Url=url .. path,Method=method,Headers=headers}
        if body then options.Body=http:JSONEncode(body) end
        local ok,response=pcall(function() return http:RequestAsync(options) end)
        if not ok then error("Could not reach Framebridge. Check your connection and the plugin's network permission.",0) end
        self:syncScope()
        if requestVersion~=self.scopeVersion then
            error("The place changed. Connect Figma in this place to continue.",0)
        end
        local parsed,data=pcall(function() return http:JSONDecode(response.Body) end)
        if not response.Success then
            self.lastStatus=response.StatusCode
            if response.StatusCode==401 and self.token==requestToken then clear() end
            error(parsed and data.error or "Transfer service returned HTTP " .. tostring(response.StatusCode),0)
        end
        if not parsed then error("The transfer service returned an invalid response.",0) end
        return data
    end
    function self:restore()
        self:syncScope()
        if not storage then return nil end
        local version=self.scopeVersion
        local record = storage.load(scope)
        if not record then return nil end
        if storage.scope and storage.scope()~=scope then self:syncScope(); return nil end
        if type(record)~="table" or record.origin~=url or type(record.receiverToken)~="string"
            or #record.receiverToken~=64 or not record.receiverToken:match("^[a-f0-9]+$")
            or type(record.expiresAt)~="number" or record.expiresAt<=now() or record.expiresAt>=math.huge
            or record.expiresAt~=record.expiresAt then
            clear(); return nil
        end
        self.token=record.receiverToken
        local token=self.token
        local ok,data=pcall(function() return request("GET","/v1/session") end)
        if version~=self.scopeVersion or self.token~=token then return nil end
        if not ok then
            -- A network outage must not erase the saved connection or trigger a new session.
            self.token=nil; self.code=nil
            if self.lastStatus==401 then return nil end
            error(data,0)
        end
        if data.role~="receiver" or type(data.expiresAt)~="number" or data.expiresAt<=now() or data.expiresAt>=math.huge
            or data.expiresAt~=data.expiresAt then
            clear(); return nil
        end
        self.expiresAt=data.expiresAt; self.paired=data.paired==true; self.code=data.code
        -- Already imported designs must not auto-import again after reloading the plugin.
        self.revision=math.max(0,tonumber(data.importedRevision) or 0)
        self.pollAfter=0.1
        save()
        return data
    end
    function self:connect()
        self:syncScope()
        local version=self.scopeVersion
        -- Reopening connection settings while paired must not revoke both roles.
        if self.token and self.paired then return self.code end
        if not self.token and storage then
            local restored=self:restore()
            if version~=self.scopeVersion then error("The place changed. Connect Figma in this place to continue.",0) end
            if restored and (self.paired or self.code) then return self.code end
        end
        if self.token then pcall(function() request("DELETE","/v1/session") end) end
        if version~=self.scopeVersion then error("The place changed. Connect Figma in this place to continue.",0) end
        clear()
        local data=request("POST","/v1/sessions",{})
        assert(type(data.receiverToken)=="string" and type(data.code)=="string","Invalid pairing response")
        self.token=data.receiverToken; self.code=data.code; self.expiresAt=data.expiresAt
        self.pollAfter=0.1
        save()
        return self.code
    end
    function self:poll()
        self:syncScope()
        if not self.token then return nil end
        local token=self.token
        local version=self.scopeVersion
        local ok,data=pcall(function()
            return request("GET","/v1/inbox?after=" .. tostring(self.revision) .. "&paired=" .. tostring(self.paired) .. "&wait=15000")
        end)
        -- A fifteen-second wait may finish after disconnecting or replacing the link.
        if version~=self.scopeVersion then return nil end
        if self.token~=token and (ok or self.token~=nil) then return nil end
        if not ok then error(data,0) end
        self.paired=data.paired==true
        self.pollAfter=data.longPoll and 0.1 or math.clamp(tonumber(data.pollAfterMs) and data.pollAfterMs/1000 or 2, 1, 30)
        return data
    end
    function self:ack(revision,status,message)
        self:syncScope()
        if not self.token then error("Connect Figma in this place to continue.",0) end
        return request("POST","/v1/receipt",{revision=revision,status=status,message=message})
    end
    function self:disconnect()
        self:syncScope()
        local token=self.token
        -- End local delivery immediately. Revoking over HTTP may yield while
        -- Play stops; neither queued imports nor late inbox replies may survive.
        clear()
        if token then pcall(function() request("DELETE","/v1/session",nil,token) end) end
    end
    return self
end
return Relay
