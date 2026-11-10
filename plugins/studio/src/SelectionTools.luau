-- Small, undoable utilities for Roblox's own Explorer selection.
-- Plan every change against current native bounds before opening a history recording.
local Tools = {}
local function finite(value)
	return type(value) == "number" and value == value and math.abs(value) < 1000000000
end
local function scaleAt(instance)
	local scale = 1
	while instance do
		if instance:IsA("GuiObject") then
			local modifier = instance:FindFirstChildWhichIsA("UIScale")
			if modifier then
				scale *= modifier.Scale
			end
		end
		instance = instance.Parent
	end
	return scale
end
local function bounds(instance)
	local parent = instance.Parent
	if not parent or not parent:IsA("GuiBase2d") then
		return nil
	end
	local scale = scaleAt(parent)
	if scale <= 0 then
		return nil
	end
	local size = parent.AbsoluteSize / scale
	local padding = parent:FindFirstChildWhichIsA("UIPadding")
	if padding then
		size = Vector2.new(
			size.X * (1 - padding.PaddingLeft.Scale - padding.PaddingRight.Scale)
				- padding.PaddingLeft.Offset
				- padding.PaddingRight.Offset,
			size.Y * (1 - padding.PaddingTop.Scale - padding.PaddingBottom.Scale)
				- padding.PaddingTop.Offset
				- padding.PaddingBottom.Offset
		)
	end
	if size.X <= 0 or size.Y <= 0 then
		return nil
	end
	return size, scale
end
local function layout(instance)
	local parent = instance.Parent
	if not parent then
		return nil
	end
	for _, child in ipairs(parent:GetChildren()) do
		if child:IsA("UIGridStyleLayout") then
			return child.ClassName
		end
	end
	return nil
end
function Tools.collect(selection, descendants)
	local instances, seen = {}, {}
	local function add(instance)
		if instance:IsA("GuiObject") and not seen[instance] then
			seen[instance] = true
			table.insert(instances, instance)
		end
	end
	for _, selected in ipairs(selection) do
		add(selected)
		if descendants then
			for _, child in ipairs(selected:GetDescendants()) do
				add(child)
			end
		end
	end
	return instances
end
function Tools.describe(selection)
	local direct, all = Tools.collect(selection, false), Tools.collect(selection, true)
	return {
		count = #direct,
		descendants = #all,
		total = #selection,
		name = #selection == 1 and selection[1].Name or (#selection .. " selected instances"),
	}
end
function Tools.plan(selection, operation, options)
	options = options or {}
	local targets = Tools.collect(selection, options.descendants == true)
	assert(#targets > 0, "Select UI in Roblox Explorer. Enable descendants to process a ScreenGui.")
	local plan = { changes = {}, created = {}, count = 0, skipped = {}, operation = operation }
	local function set(instance, property, value)
		if instance[property] ~= value then
			table.insert(plan.changes, { instance = instance, property = property, value = value })
		end
	end
	local function skip(instance, reason)
		table.insert(plan.skipped, instance.Name .. ": " .. reason)
	end
	local function constraint(instance, class)
		local modifier = instance:FindFirstChildWhichIsA(class)
		if not modifier then
			modifier = Instance.new(class)
			modifier.Name = class
			table.insert(plan.created, modifier)
			set(modifier, "Parent", instance)
		end
		return modifier
	end
	local ok, why = pcall(function()
		assert(
			operation == "geometry"
				or operation == "aspect"
				or operation == "sizeLimits"
				or operation == "text"
				or operation == "anchor"
				or operation == "fill",
			"Unknown selection utility."
		)
		if operation == "geometry" then
			assert(options.units == "scale" or options.units == "offset", "Choose Scale or Pixels.")
			assert(
				options.scope == "size" or options.scope == "position" or options.scope == "both",
				"Choose Size, Position or Both."
			)
		elseif operation == "sizeLimits" then
			assert(
				typeof(options.minimum) == "Vector2" and typeof(options.maximum) == "Vector2",
				"Enter both size limits."
			)
			for _, pair in ipairs({ { options.minimum.X, options.maximum.X }, { options.minimum.Y, options.maximum.Y } }) do
				assert(
					finite(pair[1]) and finite(pair[2]) and pair[1] >= 0 and pair[2] >= pair[1],
					"Maximum size must be at least the minimum; use nonnegative pixels."
				)
			end
		elseif operation == "text" then
			assert(
				finite(options.minimum)
					and finite(options.maximum)
					and options.minimum >= 1
					and options.maximum <= 100
					and options.maximum >= options.minimum,
				"Text limits must be between 1 and 100, with maximum at least minimum."
			)
		elseif operation == "anchor" then
			assert(
				typeof(options.anchor) == "Vector2"
					and finite(options.anchor.X)
					and finite(options.anchor.Y)
					and options.anchor.X >= 0
					and options.anchor.X <= 1
					and options.anchor.Y >= 0
					and options.anchor.Y <= 1,
				"Anchor coordinates must be between 0 and 1."
			)
		end
		for _, instance in ipairs(targets) do
			local before = #plan.changes
			local controlled = layout(instance)
			if operation == "geometry" then
				local reference = bounds(instance)
				if not reference then
					skip(instance, "parent bounds are unavailable or zero")
				else
					for _, property in
						ipairs(
							options.scope == "both" and { "Size", "Position" }
								or { options.scope == "size" and "Size" or "Position" }
						)
					do
						if controlled and (property == "Position" or controlled ~= "UIListLayout") then
							skip(instance, controlled .. " controls " .. property)
						elseif property == "Size" and instance.AutomaticSize ~= Enum.AutomaticSize.None then
							skip(instance, "AutomaticSize controls Size")
						else
							local value = instance[property]
							if options.units == "scale" then
								set(
									instance,
									property,
									UDim2.fromScale(
										value.X.Scale + value.X.Offset / reference.X,
										value.Y.Scale + value.Y.Offset / reference.Y
									)
								)
							else
								set(
									instance,
									property,
									UDim2.fromOffset(
										value.X.Scale * reference.X + value.X.Offset,
										value.Y.Scale * reference.Y + value.Y.Offset
									)
								)
							end
						end
					end
				end
			elseif operation == "aspect" then
				local size = instance.AbsoluteSize
				if controlled and controlled ~= "UIListLayout" then
					skip(instance, controlled .. " controls Size")
				elseif size.X <= 0 or size.Y <= 0 then
					skip(instance, "visible size is zero")
				else
					set(constraint(instance, "UIAspectRatioConstraint"), "AspectRatio", size.X / size.Y)
				end
			elseif operation == "sizeLimits" then
				local modifier = constraint(instance, "UISizeConstraint")
				-- Write a permissive max first so updating existing limits never crosses transient invalid bounds.
				set(
					modifier,
					"MaxSize",
					Vector2.new(
						math.max(modifier.MaxSize.X, options.maximum.X, options.minimum.X),
						math.max(modifier.MaxSize.Y, options.maximum.Y, options.minimum.Y)
					)
				)
				set(modifier, "MinSize", options.minimum)
				-- Keep the final write even if it equals the original: an earlier write may change it.
				table.insert(plan.changes, { instance = modifier, property = "MaxSize", value = options.maximum })
			elseif operation == "text" then
				if instance:IsA("TextLabel") or instance:IsA("TextButton") or instance:IsA("TextBox") then
					local modifier = constraint(instance, "UITextSizeConstraint")
					set(modifier, "MaxTextSize", math.max(modifier.MaxTextSize, options.maximum, options.minimum))
					set(modifier, "MinTextSize", options.minimum)
					table.insert(
						plan.changes,
						{ instance = modifier, property = "MaxTextSize", value = options.maximum }
					)
					set(instance, "TextScaled", true)
				else
					skip(instance, "select a text label, button or box")
				end
			elseif operation == "fill" then
				if controlled then
					skip(instance, controlled .. " owns the layout")
				elseif instance.AutomaticSize ~= Enum.AutomaticSize.None then
					skip(instance, "AutomaticSize controls Size")
				else
					set(instance, "AnchorPoint", Vector2.zero)
					set(instance, "Position", UDim2.new())
					set(instance, "Size", UDim2.fromScale(1, 1))
				end
			elseif operation == "anchor" then
				if controlled then
					skip(instance, controlled .. " controls Position")
				elseif options.keepPosition ~= false then
					local reference, scale = bounds(instance)
					local rotated, ancestor = false, instance
					while ancestor do
						if ancestor:IsA("GuiObject") and ancestor.Rotation % 360 ~= 0 then
							rotated = true
							break
						end
						ancestor = ancestor.Parent
					end
					if not reference then
						skip(instance, "parent bounds are unavailable or zero")
					elseif rotated then
						skip(instance, "keep-position anchors require unrotated UI")
					else
						local delta = (options.anchor - instance.AnchorPoint) * instance.AbsoluteSize / scale
						set(
							instance,
							"Position",
							instance.Position + UDim2.fromScale(delta.X / reference.X, delta.Y / reference.Y)
						)
						set(instance, "AnchorPoint", options.anchor)
					end
				else
					set(instance, "AnchorPoint", options.anchor)
				end
			end
			if #plan.changes > before then
				plan.count += 1
			end
		end
	end)
	if not ok then
		for _, instance in ipairs(plan.created) do
			instance:Destroy()
		end
		error(why, 0)
	end
	return plan
end
function Tools.apply(plan, history)
	local function cleanup()
		for _, instance in ipairs(plan.created) do
			instance:Destroy()
		end
	end
	if #plan.changes == 0 then
		cleanup()
		return { count = 0, skipped = plan.skipped }
	end
	local ok, recording = pcall(function()
		return history:TryBeginRecording("FramebridgeSelection", "Prepare selected UI")
	end)
	if not ok or not recording then
		cleanup()
		error(ok and "Another Studio operation is recording. Try again." or tostring(recording), 0)
	end
	local journal = {}
	local applied, why = pcall(function()
		for _, change in ipairs(plan.changes) do
			table.insert(journal, { change.instance, change.property, change.instance[change.property] })
			change.instance[change.property] = change.value
		end
		history:FinishRecording(recording, Enum.FinishRecordingOperation.Commit)
	end)
	if not applied then
		for index = #journal, 1, -1 do
			local old = journal[index]
			pcall(function()
				old[1][old[2]] = old[3]
			end)
		end
		cleanup()
		pcall(function()
			history:FinishRecording(recording, Enum.FinishRecordingOperation.Cancel)
		end)
		error(why, 0)
	end
	return { count = plan.count, skipped = plan.skipped }
end
function Tools.run(selection, operation, options, history)
	return Tools.apply(Tools.plan(selection, operation, options), history)
end
return Tools
