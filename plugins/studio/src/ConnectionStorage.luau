-- Device-local receiver capabilities. Settings keys must not contain URL periods.
local Storage = {}
function Storage.new(plugin, origin, placeId, now)
    now = now or function() return DateTime.now().UnixTimestampMillis end
    local encoded = origin:gsub(".", function(character) return string.format("%02x", string.byte(character)) end)
    local self = {}
    local legacyReads, legacyRecords = {}, {}
    function self.scope()
        local id = placeId()
        return type(id)=="number" and id>0 and id<=9007199254740991 and id%1==0 and id or 0
    end
    local function key(id)
        return "FramebridgeConnectionV2_" .. encoded .. "_" .. string.format("%.0f", id)
    end
    local function valid(record)
        if type(record)~="table" or record.origin~=origin or type(record.receiverToken)~="string"
            or #record.receiverToken~=64 or not record.receiverToken:match("^[a-f0-9]+$")
            or type(record.expiresAt)~="number" or record.expiresAt<=now() or record.expiresAt>=math.huge
            or record.expiresAt~=record.expiresAt then return false end
        local count=0
        for field in pairs(record) do
            if field~="origin" and field~="receiverToken" and field~="expiresAt" then return false end
            count+=1
        end
        return count==3
    end
    function self.load(expectedScope)
        local id=self.scope()
        if id==0 then return nil end
        if expectedScope~=nil and id~=expectedScope then return nil end
        local record=plugin:GetSetting(key(id))
        if self.scope()~=id then return nil end
        -- A V2 tombstone must prevent an old capability being resurrected.
        if record~=nil then return record~=false and record or nil end
        if not legacyReads[id] then
            legacyReads[id]=true
            local ok, legacy=pcall(function()
                return plugin:GetSetting("FramebridgeConnection:" .. origin .. ":" .. tostring(id))
            end)
            if ok and valid(legacy) then
                legacyRecords[id]={origin=origin,receiverToken=legacy.receiverToken,expiresAt=legacy.expiresAt}
            end
        end
        -- Read the unsafe legacy key only; Relay validates the server before saving V2.
        return self.scope()==id and valid(legacyRecords[id]) and legacyRecords[id] or nil
    end
    function self.save(record, expectedScope)
        local id=self.scope()
        if expectedScope~=nil and id~=expectedScope then error("The place changed before saving its connection.",0) end
        -- Unsaved places deliberately keep their session in memory.
        if id==0 then return false end
        if record~=nil and not valid(record) then error("Invalid saved connection.",0) end
        local value=record and {origin=origin,receiverToken=record.receiverToken,expiresAt=record.expiresAt} or false
        local settingKey=key(id)
        plugin:SetSetting(settingKey,value)
        local readback=plugin:GetSetting(settingKey)
        if self.scope()~=id then error("The place changed before verifying its connection.",0) end
        local matches=value==false and readback==false or type(readback)=="table" and value~=false
            and readback.origin==value.origin and readback.receiverToken==value.receiverToken and readback.expiresAt==value.expiresAt
        if not matches then error("Studio could not remember this connection for reopening.",0) end
        legacyReads[id]=true; legacyRecords[id]=nil
        return true
    end
    return self
end
return Storage
