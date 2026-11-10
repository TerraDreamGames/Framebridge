assert(game.PlaceId == 0 and _G.FramebridgeRepeatQA, "Run owned client repeat setup and click the middle copied button")
local entries = _G.FramebridgeRepeatQA.interactive
assert(entries["details/repeat:repeat:1"].instance.Visible, "Middle button did not open its own copied panel")
assert(not entries["details"].instance.Visible and not entries["details/repeat:repeat:2"].instance.Visible, "Copied button changed another card")
assert(entries["hover/repeat:repeat:1"].instance.Visible, "Copied hover state did not activate")
assert(not entries["hover"].instance.Visible and not entries["hover/repeat:repeat:2"].instance.Visible, "Hover state changed another card")
return {passed = 2, failed = 0, scope = "Actual pointer activation and hover remain scoped to the middle repeated card"}
