-- ClassName is immutable. Stage replacement objects, then move existing children in one recording.
-- Only references inside the converted selection's subtrees can be remapped automatically.
local Tools = {}
local Http = game:GetService("HttpService")
local Run = game:GetService("RunService")
Tools.classes =
	{ "Frame", "CanvasGroup", "ScrollingFrame", "TextLabel", "TextButton", "TextBox", "ImageLabel", "ImageButton" }
local allowed, metadata = {}, {}
for _, class in ipairs(Tools.classes) do
	allowed[class] = true
end
local extra =
	{ Archivable = true, InputSink = true, ImageContent = true, HoverImageContent = true, PressedImageContent = true }
local function properties(class)
	if metadata[class] then
		return metadata[class]
	end
	local ok, list = pcall(function()
		return game:GetService("ReflectionService"):GetPropertiesOfClass(class)
	end)
	assert(
		ok and type(list) == "table",
		"Update Roblox Studio to enable class conversion; engine property reflection is unavailable."
	)
	local result = {}
	for _, property in ipairs(list) do
		local permits = property.Permits or {}
		if
			permits.Read
			and permits.Write
			and (property.Serialized or extra[property.Name])
			and (property.Owner ~= "Instance" or property.Name == "Name" or property.Name == "Archivable")
			and not (property.Display and property.Display.DeprecationMessage ~= nil)
		then
			result[property.Name] = property
		end
	end
	metadata[class] = result
	return result
end
local function compatible(a, b)
	if not a or not b then
		return false
	end
	for _, key in ipairs({ "EngineType", "ScriptType", "EnumType", "ClassName" }) do
		if a.Type[key] ~= b.Type[key] then
			return false
		end
	end
	return true
end
function Tools.describe(selection)
	local count, invalid, seen, family = 0, 0, {}, nil
	for _, source in ipairs(selection) do
		if not seen[source] then
			seen[source] = true
			if allowed[source.ClassName] and source.Parent then
				count += 1
				local kind = source.ClassName:sub(1, 5) == "Image" and "image"
					or source.ClassName:sub(1, 4) == "Text" and "text"
					or "frame"
				family = family and (family == kind and kind or "mixed") or kind
			else
				invalid += 1
			end
		end
	end
	return { count = count, invalid = invalid, preferred = family == "image" and "ImageButton" or "TextButton" }
end
local function selectionEntries(selection, target)
	assert(allowed[target], "Choose a supported Roblox UI class.")
	assert(#selection > 0 and #selection <= 200, "Select from 1 to 200 UI instances in Explorer.")
	local entries, seen = {}, {}
	for _, source in ipairs(selection) do
		if not seen[source] then
			seen[source] = true
			assert(
				allowed[source.ClassName] and source.Parent,
				"Select only attached Frames, CanvasGroups, ScrollingFrames, text or image instances. Children keep their own types."
			)
			if source.ClassName ~= target then
				table.insert(entries, { source = source, parent = source.Parent, children = source:GetChildren() })
			end
		end
	end
	return entries
end
local function inspect(entries, target)
	local targetProperties, defaults, losses = properties(target), {}, {}
	local ok, why = pcall(function()
		for _, entry in ipairs(entries) do
			local source, names, dropped = entry.source, {}, {}
			local sourceProperties = properties(source.ClassName)
			if not defaults[source.ClassName] then
				defaults[source.ClassName] = Instance.new(source.ClassName)
			end
			for name, property in pairs(sourceProperties) do
				if compatible(property, targetProperties[name]) then
					table.insert(names, name)
				elseif source[name] ~= defaults[source.ClassName][name] then
					table.insert(dropped, name)
				end
			end
			table.sort(names)
			table.sort(dropped)
			entry.names = names
			if #dropped > 0 then
				table.insert(losses, source.Name .. ": " .. table.concat(dropped, ", "))
			end
		end
	end)
	for _, instance in pairs(defaults) do
		instance:Destroy()
	end
	if not ok then
		error(why, 0)
	end
	return losses
end
function Tools.review(selection, target)
	local ok, result = pcall(function()
		local entries = selectionEntries(selection, target)
		return { count = #entries, losses = inspect(entries, target) }
	end)
	return ok and result or { count = 0, losses = {}, error = tostring(result) }
end
local function cleanup(plan)
	for _, entry in ipairs(plan.entries) do
		if entry.replacement then
			entry.replacement:Destroy()
		end
	end
end
function Tools.plan(selection, target)
	assert(not Run:IsRunning(), "Stop the play test before converting UI.")
	local entries = selectionEntries(selection, target)
	local plan = {
		entries = entries,
		target = target,
		selection = table.clone(selection),
		mapping = {},
		references = {},
		losses = inspect(entries, target),
	}
	if #entries == 0 then
		return plan
	end
	local ok, why = pcall(function()
		local scope, seen = {}, {}
		local function include(instance)
			if not seen[instance] then
				seen[instance] = true
				table.insert(scope, instance)
				assert(#scope <= 10000, "Select a smaller UI subtree; class conversion is limited to 10,000 instances.")
			end
		end
		for _, source in ipairs(selection) do
			if not seen[source] then
				include(source)
				for _, instance in ipairs(source:GetDescendants()) do
					include(instance)
				end
			end
		end
		for _, entry in ipairs(entries) do
			local source, replacement = entry.source, Instance.new(target)
			entry.replacement = replacement
			plan.mapping[source] = replacement
			for _, name in ipairs(entry.names) do
				replacement[name] = source[name]
			end
			replacement.Archivable = source.Archivable
			if replacement:IsA("GuiButton") and not source:IsA("GuiButton") then
				replacement.Active = true
				replacement.Selectable = true
				replacement.AutoButtonColor = false
			end
			if target:sub(1, 4) == "Text" and source.ClassName:sub(1, 4) ~= "Text" then
				replacement.Text = ""
			end
			if target == "TextBox" and not source:IsA("TextBox") then
				replacement.ClearTextOnFocus = false
			end
			for name, value in pairs(source:GetAttributes()) do
				replacement:SetAttribute(name, value)
			end
			for _, tag in ipairs(source:GetTags()) do
				replacement:AddTag(tag)
			end
			if target:sub(1, 5) ~= "Image" then
				replacement:SetAttribute("FramebridgeAsset", nil)
			end
			if target ~= "ScrollingFrame" then
				for _, key in ipairs({ "TopImage", "MidImage", "BottomImage" }) do
					replacement:SetAttribute("FramebridgeAsset_" .. key, nil)
				end
			end
			local raw = source:GetAttribute("FramebridgeProperties")
			if raw then
				local keys = Http:JSONDecode(raw)
				assert(type(keys) == "table", "Invalid imported property metadata.")
				local kept = {}
				for _, key in ipairs(keys) do
					if type(key) == "string" and table.find(entry.names, key) then
						table.insert(kept, key)
					end
				end
				replacement:SetAttribute("FramebridgeProperties", Http:JSONEncode(kept))
			end
		end
		for _, entry in ipairs(entries) do
			for _, name in ipairs(entry.names) do
				local value = entry.replacement[name]
				if typeof(value) == "Instance" and plan.mapping[value] then
					entry.replacement[name] = plan.mapping[value]
				end
			end
		end
		for _, instance in ipairs(scope) do
			if not plan.mapping[instance] then
				for name, property in pairs(properties(instance.ClassName)) do
					if property.Type.ScriptType == "Instance" then
						local value = instance[name]
						if value and plan.mapping[value] then
							table.insert(
								plan.references,
								{ instance = instance, property = name, before = value, value = plan.mapping[value] }
							)
						end
					end
				end
			end
		end
	end)
	if not ok then
		cleanup(plan)
		error(why, 0)
	end
	return plan
end
function Tools.apply(plan, history)
	assert(not plan.applied, "This class conversion was already applied.")
	local valid, problem = pcall(function()
		assert(not Run:IsRunning(), "Stop the play test before converting UI.")
		for _, entry in ipairs(plan.entries) do
			assert(entry.source.Parent == entry.parent, "The selection moved; review it again before converting.")
			local children = entry.source:GetChildren()
			assert(#children == #entry.children, "The selection's children changed; review it again.")
			for _, child in ipairs(entry.children) do
				assert(child.Parent == entry.source, "The selection's children changed; review it again.")
			end
		end
		for _, ref in ipairs(plan.references) do
			assert(ref.instance[ref.property] == ref.before, "A child reference changed; review the selection again.")
		end
	end)
	if not valid then
		cleanup(plan)
		error(problem, 0)
	end
	if #plan.entries == 0 then
		return { count = 0, selection = plan.selection, losses = plan.losses }
	end
	local begun, recording = pcall(function()
		return history:TryBeginRecording("FramebridgeClass", "Convert selected UI class")
	end)
	if not begun or not recording then
		cleanup(plan)
		error(begun and "Another Studio operation is recording. Try again." or tostring(recording), 0)
	end
	local journal = {}
	local function set(instance, key, value)
		table.insert(journal, { instance = instance, key = key, value = instance[key] })
		instance[key] = value
	end
	local ok, why = pcall(function()
		for _, entry in ipairs(plan.entries) do
			set(entry.replacement, "Parent", plan.mapping[entry.parent] or entry.parent)
		end
		for _, entry in ipairs(plan.entries) do
			for _, child in ipairs(entry.children) do
				if not plan.mapping[child] then
					set(child, "Parent", entry.replacement)
				end
			end
		end
		for _, ref in ipairs(plan.references) do
			set(ref.instance, ref.property, ref.value)
		end
		for _, entry in ipairs(plan.entries) do
			set(entry.source, "Parent", nil)
		end
		history:FinishRecording(recording, Enum.FinishRecordingOperation.Commit)
	end)
	if not ok then
		local failures = {}
		for i = #journal, 1, -1 do
			local old = journal[i]
			local restored, errorMessage = pcall(function()
				old.instance[old.key] = old.value
			end)
			if not restored then
				table.insert(failures, tostring(errorMessage))
			end
		end
		if #failures == 0 then
			cleanup(plan)
		end
		pcall(function()
			history:FinishRecording(recording, Enum.FinishRecordingOperation.Cancel)
		end)
		error(
			tostring(why) .. (#failures > 0 and "; rollback could not restore every change: " .. failures[1] or ""),
			0
		)
	end
	plan.applied = true
	local selected = {}
	for _, source in ipairs(plan.selection) do
		table.insert(selected, plan.mapping[source] or source)
	end
	return { count = #plan.entries, selection = selected, losses = plan.losses, mapping = plan.mapping }
end
function Tools.run(selection, target, history)
	return Tools.apply(Tools.plan(selection, target), history)
end
return Tools
