-- The retained Edit DataModel's RunService stays stopped during a Play test.
-- StudioTestService also reports tests running in the separate Client/Server
-- DataModels, including paused tests. Missing or unreadable state fails closed.
local EditMode = {}
function EditMode.new(runService, getTestService)
    local available, testService = pcall(getTestService)
    return function()
        if not available or not runService:IsEdit() then return false end
        local readable, idle = pcall(function() return testService.EditModeActive end)
        return readable and idle == true
    end
end
return EditMode
