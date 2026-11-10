-- Pure Luau checks plus compilation of React test-fixture adapters.
-- Native widget/import tests must run in Studio; fixtures builds those scripts.
local fs = require("@lune/fs")
local serde = require("@lune/serde")
assert(loadstring(fs.readFile("tests/studio-clipboard.test.luau")))()
assert(loadstring(fs.readFile("tests/studio-cleanup.test.luau")))()
local decorationChecks, decorationWhy = loadstring(fs.readFile("tests/studio-decoration-assets.test.luau"))
assert(decorationChecks, decorationWhy)
decorationChecks()
local inputChecks, inputWhy = loadstring(fs.readFile("tests/studio-input.test.luau"))
assert(inputChecks, inputWhy)
inputChecks()
local connectionChecks, connectionWhy = loadstring(fs.readFile("tests/studio-connection-focus.test.luau"))
assert(connectionChecks, connectionWhy)
connectionChecks()
local storageChecks, storageWhy = loadstring(fs.readFile("tests/studio-connection-storage.test.luau"))
assert(storageChecks, storageWhy)
storageChecks()
local editModeChecks, editModeWhy = loadstring(fs.readFile("tests/studio-edit-mode.test.luau"))
assert(editModeChecks, editModeWhy)
editModeChecks()
local playConnectionChecks,playConnectionWhy=loadstring(fs.readFile("tests/studio-play-connection.test.luau"))
assert(playConnectionChecks,playConnectionWhy)
playConnectionChecks()
local run, why = loadstring(fs.readFile(".artifacts/studio-responsive-tests.luau"))
assert(run, why)
local report = run()
print(serde.encode("json", report))
assert(report.failed == 0, "Responsive Studio configuration tests failed")
for _,path in ipairs({".artifacts/studio-group-coordinate-tests.luau",".artifacts/studio-lifetime-tests.luau",".artifacts/studio-edit-mode-bundle-tests.luau",".artifacts/studio-receiver-tests.luau",".artifacts/studio-history-tests.luau",".artifacts/studio-handoff-tests.luau"}) do
    local check, problem=loadstring(fs.readFile(path))
    assert(check,problem)
    local result=check()
    print(serde.encode("json",result))
    assert(result.failed==0,path .. ": checks failed")
end
for _, path in ipairs({
	"tests/studio-cleanup-native.test.luau",
	".artifacts/studio-view-tests.luau",
    ".artifacts/studio-handoff-controller-tests.luau",
    ".artifacts/studio-handoff-http-tests.luau",
	".artifacts/studio-selection-tests.luau",
	".artifacts/class-tools/native.luau",
	".artifacts/class-tools/undo-job.luau",
	".artifacts/class-tools/ui.luau",
}) do
	local compiled, problem = loadstring(fs.readFile(path))
	assert(compiled, path .. ": " .. tostring(problem))
end
print("Studio plugin and React widget test bundles compile.")
assert(loadstring(fs.readFile("scripts/test-studio-package.luau")))()
