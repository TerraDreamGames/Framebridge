local package = Importer.decode(fixture)
local result = Importer.stage(package, {}, false)
local ok, why = pcall(function()
    local buy, close = result.byId["buy-control"].instance, result.byId["close-control"].instance
    assert(buy:IsA("TextButton") and buy.Active and buy.Selectable)
    assert(result.byId["buy-label"].instance:IsA("TextLabel"))
    assert(result.byId["buy-label"].instance.Parent == buy)
    assert(close:IsA("ImageButton") and close.Active and close.Selectable and close.Image == "")
    assert(result.byId["close-icon"].instance:IsA("ImageLabel"))
    assert(result.byId["close-icon"].instance.Parent == close)
    assert(result.byId["button-container"].instance:IsA("Frame"))
end)
Importer.destroy(result)
return {passed=ok and 1 or 0,failed=ok and 0 or 1,failures=ok and {} or {tostring(why)},scope="Native classes and single button targets; detached instances"}
