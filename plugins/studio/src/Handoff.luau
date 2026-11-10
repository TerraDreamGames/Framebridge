-- Independent design-code requests never clear or replace live pairing tokens.
local Handoff = {}
function Handoff.new(url,http,now)
    now=now or function() return DateTime.now().UnixTimestampMillis end
    local self={attempt=nil,pending=nil,receipts={},flushing=false,error=nil}
    local function request(method,path,token,body,beta)
        self.lastStatus=nil
        if url=="" then error("This build needs the private Framebridge backend.",0) end
        local headers={["Content-Type"]="application/json"}
        if token then headers.Authorization="Bearer "..token end
        if beta and beta~="" then headers["X-Framebridge-Beta"]=beta end
        local options={Url=url..path,Method=method,Headers=headers}
        if body then options.Body=http:JSONEncode(body) end
        local ok,response=pcall(function() return http:RequestAsync(options) end)
        self.lastStatus=nil
        if not ok then error("Could not reach Framebridge. Retry the design code after checking network permissions.",0) end
        local parsed,data=pcall(function() return http:JSONDecode(response.Body) end)
        if not response.Success then
            self.lastStatus=response.StatusCode
            error(parsed and data.error or "Design code request failed.",0)
        end
        if not parsed or type(data)~="table" then error("Invalid design code response.",0) end
        return data
    end
    local function queue(record,status,message)
        self.receipts[record.token]={token=record.token,expiresAt=record.expiresAt,status=status,message=message and tostring(message):sub(1,500)}
    end
    function self:open(value,beta)
        local code=tostring(value):gsub("[%s%-]",""):upper()
        if #code~=26 or code:sub(1,2)~="FB" or not code:sub(3):match("^[A-F0-9]+$") then error("Enter a design code starting with FB. Pairing codes go in Figma connection.",0) end
        local count=0;for _ in pairs(self.receipts) do count+=1 end
        if count>=32 then error("Waiting for earlier delivery receipts. Retry shortly.",0) end
        if not self.attempt or self.attempt.code~=code then
            local token=(http:GenerateGUID(false)..http:GenerateGUID(false)):gsub("%-",""):lower()
            assert(#token==64 and token:match("^[a-f0-9]+$"),"Could not create private receipt access.")
            self.attempt={code=code,token=token}
        end
        local data=request("POST","/v1/handoffs/open",nil,{code=code,receiptToken=self.attempt.token},beta)
        if type(data.expiresAt)~="number" or data.expiresAt<=now() or type(data.package)~="table" then error("This design code is expired or invalid.",0) end
        data.receiptToken=self.attempt.token
        return data
    end
    function self:accept(data,identity)
        self:cancel("This design was replaced by another code.")
        self.pending={token=data.receiptToken,expiresAt=data.expiresAt,package=identity}
        self.attempt=nil;queue(self.pending,"ready")
    end
    function self:reject(data,message)
        self.attempt=nil
        queue({token=data.receiptToken,expiresAt=data.expiresAt},"failed",message)
    end
    function self:cancel(message)
        if self.pending then queue(self.pending,"failed",message);self.pending=nil end
    end
    function self:complete(identity,ok,message)
        if not self.pending then return end
        if self.pending.package~=identity then self:cancel("The reviewed design was replaced.");return end
        queue(self.pending,ok and "imported" or "failed",message);self.pending=nil
    end
    function self:flush()
        if self.flushing then return end
        self.flushing=true
        for token,receipt in pairs(self.receipts) do
            if receipt.expiresAt<=now() then self.receipts[token]=nil
            else
                local ok,message=pcall(function() request("POST","/v1/handoff-receipt",token,{status=receipt.status,message=receipt.message}) end)
                if ok or self.lastStatus==401 or self.lastStatus==404 or self.lastStatus==409 then
                    if self.receipts[token]==receipt then self.receipts[token]=nil end
                    self.error=not ok and "The design is loaded, but its delivery receipt is no longer available." or nil
                else self.error="Delivery receipt pending. It will retry while the plugin stays open.";break end
            end
        end
        self.flushing=false
    end
    return self
end
return Handoff
