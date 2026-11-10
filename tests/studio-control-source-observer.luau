-- QA-only observer. Runtime/controller logic and exported files remain unchanged.
-- All four real renderer mounts receive identical deterministic data/time/random
-- input, and expose their actual mounted controllers to the comparison harness.
local observedControlControllers = setmetatable({}, { __mode = "k" })
local observedControlMounts = setmetatable({}, { __mode = "k" })
local observedControlRuntimes = setmetatable({}, { __mode = "k" })
local activeControlPlayer
local function observeControlRuntime(runtime)
    if observedControlRuntimes[runtime] then return end
    observedControlRuntimes[runtime] = true
    local mount = runtime.mount
    runtime.mount = function(root, options)
        local inputs = table.clone(options or {})
        inputs.player = activeControlPlayer
        inputs.manualControls = true
        inputs.controlRandom = function(count) return math.min(4, count) end
        local controller = mount(root, inputs)
        observedControlControllers[root] = controller
        observedControlMounts[root] = (observedControlMounts[root] or 0) + 1
        return controller
    end
end
