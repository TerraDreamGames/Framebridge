widget.Title = "Framebridge · Class conversion QA"
widget.Enabled = true
view.selectTab("Tools")
task.wait(0.2)
qa:SetAttribute("ControllerStatus", "Not run")
local function controllerChecks()
	assert(game.PlaceId == 0, "Blank QA only")
	local passed, failures = 0, {}
	local function test(name, body)
		local ok, why = pcall(body)
		if ok then
			passed += 1
		else
			table.insert(failures, name .. ": " .. tostring(why))
		end
	end
	test("class conversion starts collapsed in the actual Tools panel", function()
		local found = false
		for _, instance in ipairs(widget:GetDescendants()) do
			if instance:IsA("TextButton") and instance.Text == "Change instance type" then
				found = true
			end
		end
		assert(found and not widget:FindFirstChild("ConvertClass", true))
	end)
	test("target review reports image loss without mutating selection or children", function()
		assert(actions.classTarget("Frame"))
		assert(state.classPreview.count == 1 and #state.classPreview.losses == 1)
		assert(state.classPreview.losses[1]:find("Image", 1, true))
		assert(
			Selection:Get()[1] == artwork
				and artwork.Parent == screen
				and corner.Parent == artwork
				and app.Parent == artwork
		)
	end)
	test("unsupported target does not replace the previous choice", function()
		assert(not actions.classTarget("Part") and state.classTarget == "Frame")
	end)
	test("actual conversion action selects the replacement and retains owned content", function()
		assert(actions.classTarget("ImageButton") and actions.convertClass(), state.status)
		task.wait(0.2)
		local button = Selection:Get()[1]
		assert(button.ClassName == "ImageButton" and button.Parent == screen and artwork.Parent == nil)
		assert(
			button.Image == artwork.Image
				and button.SliceCenter == artwork.SliceCenter
				and corner.Parent == button
				and app.Parent == button
		)
		assert(button:HasTag("ClassToolsQA") and button:GetAttribute("GameValue") == 42)
		assert(not state.failed and state.classPreview.count == 0 and state.classTarget == "ImageButton")
	end)
	test("reverse conversion keeps the explicit target after selection notifications", function()
		assert(actions.classTarget("ImageLabel") and actions.convertClass(), state.status)
		task.wait(0.2)
		local image = Selection:Get()[1]
		assert(
			image.ClassName == "ImageLabel"
				and image.Parent == screen
				and corner.Parent == image
				and app.Parent == image
		)
		assert(
			image.Image == artwork.Image
				and not state.failed
				and state.classTarget == "ImageLabel"
				and state.classPreview.count == 0
		)
	end)
	test("mixed unsupported selection fails atomically through the controller", function()
		local image = screen:FindFirstChild("Inventory icon")
		Selection:Set({ image, screen })
		task.wait(0.2)
		assert(actions.classTarget("TextButton"))
		assert(state.classPreview.error and state.classPreview.count == 0)
		assert(
			not actions.convertClass()
				and state.failed
				and image.Parent == screen
				and corner.Parent == image
				and #screen:GetChildren() == 1
		)
	end)
	test("empty selection cannot convert", function()
		Selection:Set({})
		task.wait(0.2)
		assert(state.classPreview.error and not actions.convertClass() and state.failed and #screen:GetChildren() == 1)
	end)
	test("busy controller rejects conversion and target changes", function()
		local image = screen:FindFirstChild("Inventory icon")
		Selection:Set({ image })
		task.wait(0.2)
		assert(actions.classTarget("ImageButton"))
		state.busy = true
		assert(not actions.classTarget("Frame") and not actions.convertClass())
		state.busy = false
		assert(Selection:Get()[1] == image and image.ClassName == "ImageLabel" and corner.Parent == image)
	end)
	state.busy = false
	Selection:Set({ screen:FindFirstChild("Inventory icon") })
	task.wait(0.2)
	actions.classTarget("ImageButton")
	tell("Class conversion QA ready. Select ImageButton and convert the selected icon.")
	view.render(state)
	return {
		passed = passed,
		failed = #failures,
		failures = failures,
		scope = "Actual Studio controller and native React panel; automated action calls, no pointer claim; settings and network isolated",
	}
end
local command = Instance.new("BindableFunction")
command.Name = "Command"
command.Parent = qa
command.OnInvoke = function(operation)
	assert(game.PlaceId == 0, "Blank QA only")
	if operation == "checks" then
		assert(
			qa:GetAttribute("ControllerStatus") == "Not run",
			"Inspect the existing controller report before scheduling another"
		)
		qa:SetAttribute("ControllerStatus", "Running")
		task.delay(0.5, function()
			assert(game.PlaceId == 0, "Blank QA only")
			if not qa.Parent then
				return
			end
			local ok, report = pcall(controllerChecks)
			if not ok then
				report = { passed = 0, failed = 1, failures = { tostring(report) } }
			end
			qa:SetAttribute("ControllerReport", Http:JSONEncode(report))
			qa:SetAttribute("ControllerStatus", ok and report.failed == 0 and "Completed" or "Failed")
		end)
		return "Scheduled actual controller checks after the outer command recording ends"
	end
	if operation == "cleanup" then
		local owned = true
		for _, instance in ipairs(Selection:Get()) do
			if not instance:IsDescendantOf(screen) then
				owned = false
			end
		end
		if owned then
			local restore = {}
			for _, instance in ipairs(previousSelection) do
				if instance.Parent then
					table.insert(restore, instance)
				end
			end
			Selection:Set(restore)
		end
		unloading:Fire()
		task.wait(0.3)
		screen:Destroy()
		artwork:Destroy()
		unloading:Destroy()
		native:Destroy()
		qa:Destroy()
		return "Class conversion UI QA cleaned up"
	end
	assert(operation == "status")
	local selected = Selection:Get()[1]
	local buttons = {}
	for _, instance in ipairs(widget:GetDescendants()) do
		if
			instance:IsA("TextButton")
			and (
				instance.Name == "ConvertClass"
				or instance.Name == "ImageLabel"
				or instance.Name == "ImageButton"
				or instance.Text == "Change instance type"
			)
		then
			table.insert(
				buttons,
				{
					name = instance.Name,
					text = instance.Text,
					active = instance.Active,
					position = { instance.AbsolutePosition.X, instance.AbsolutePosition.Y },
					size = { instance.AbsoluteSize.X, instance.AbsoluteSize.Y },
				}
			)
		end
	end
	return Http:JSONEncode({
		class = selected and selected.ClassName,
		target = state.classTarget,
		count = state.classPreview.count,
		status = state.status,
		failed = state.failed,
		childIdentity = selected and corner.Parent == selected and app.Parent == selected,
		image = selected and (selected:IsA("ImageLabel") or selected:IsA("ImageButton")) and selected.Image,
		tag = selected and selected:HasTag("ClassToolsQA"),
		attribute = selected and selected:GetAttribute("GameValue"),
		buttons = buttons,
		controllerStatus = qa:GetAttribute("ControllerStatus"),
		controllerReport = qa:GetAttribute("ControllerReport"),
	})
end
return "Native class conversion QA panel ready; settings and network are isolated"
