-- Delivery orchestration is independent of the place and of the widget.
local Receiver = {}
function Receiver.new(callbacks)
    local self={revision=0,pending=nil,reviewed=nil,receipt=nil,flushing=false}
    local generation=0
    local receiptSequence=0
    function self:flush()
        if self.flushing or not self.receipt then return end
        self.flushing=true
        local receipt=self.receipt
        if receipt and pcall(callbacks.ack,receipt.revision,receipt.status,receipt.message) then
            if self.receipt==receipt then self.receipt=nil end
        end
        self.flushing=false
    end
    local function acknowledge(revision,status,message)
        receiptSequence+=1
        local sequence=receiptSequence
        self.receipt={revision=revision,status=status,message=message}
        self:flush()
        return sequence==receiptSequence
    end
    function self:reset()
        generation+=1
        self.pending=nil; self.reviewed=nil; self.receipt=nil; self.revision=0
    end
    function self:cancel(message)
        local delivery=self.pending or self.reviewed
        generation+=1
        self.pending=nil; self.reviewed=nil
        if delivery then acknowledge(delivery.revision,"failed",message) end
    end
    -- Capture the delivery before import work can yield; a newer design/session
    -- must never receive the outcome of the previous manual import.
    function self:beginManual(package)
        local delivery=self.pending or self.reviewed
        if delivery and delivery.package==package and delivery.generation==generation then return delivery end
        return nil
    end
    function self:completeManual(delivery,ok,message)
        if not delivery or delivery.generation~=generation
            or (delivery~=self.pending and delivery~=self.reviewed) then return false end
        self.pending=nil; self.reviewed=nil
        if callbacks.current()~=delivery.package then
            acknowledge(delivery.revision,"failed","The received design was replaced locally.")
            return false
        end
        -- A failed import may be retried manually; it must not become an
        -- automatic queue when the user later enables Auto-import.
        if not ok then self.reviewed=delivery end
        acknowledge(delivery.revision,ok and "imported" or "failed",message)
        return ok
    end
    local function finish()
        local pending=self.pending; self.pending=nil -- clear before any yielding import
        if callbacks.current()~=pending.package then
            acknowledge(pending.revision,"failed","The received design was replaced locally.")
            return
        end
        local ok,message=callbacks.import()
        if pending.generation~=generation then return end
        if not ok and callbacks.current()==pending.package then self.reviewed=pending end
        acknowledge(pending.revision,ok and "imported" or "failed",message)
    end
    function self:receive(revision,package)
        if revision<=self.revision then return end
        generation+=1
        local attempt=generation
        self.revision=revision; self.pending=nil; self.reviewed=nil; self.receipt=nil
        local ok,message=callbacks.load(package)
        if attempt~=generation then return end
        if not ok then acknowledge(revision,"failed",message); return end
        local delivery={revision=revision,package=callbacks.current(),generation=attempt}
        if not callbacks.autoImport() then
            self.reviewed=delivery
            local latest=acknowledge(revision,"ready")
            if latest and attempt==generation then callbacks.tell("Received from Figma · review and click Import.") end
        else
            self.pending=delivery
            if callbacks.running() then
                local latest=acknowledge(revision,"queued")
                if latest and attempt==generation then callbacks.tell("Design received · stop the play test to finish importing.") end
            else finish() end
        end
    end
    function self:tick()
        self:flush()
        if self.pending and not callbacks.busy() and not callbacks.running() then
            if callbacks.autoImport() then finish()
            else
                local pending=self.pending; self.pending=nil
                self.reviewed=pending
                local latest=acknowledge(pending.revision,"ready")
                if latest and pending.generation==generation then callbacks.tell("Received from Figma · review and click Import.") end
            end
        end
    end
    return self
end
return Receiver
