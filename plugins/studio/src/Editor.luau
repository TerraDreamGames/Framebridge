-- Serializable Studio edits. The original delivery stays intact for receipts/reimport.
local Editor = {}
local MODES = { scale = true, offset = true, source = true }
local GUI = {
	Frame = true,
	CanvasGroup = true,
	ScrollingFrame = true,
	ViewportFrame = true,
	TextLabel = true,
	TextButton = true,
	TextBox = true,
	ImageLabel = true,
	ImageButton = true,
}
local MODIFIERS = {
	UIListLayout = true,
	UIFlexItem = true,
	UIGridLayout = true,
	UIPadding = true,
	UICorner = true,
	UIStroke = true,
	UIScale = true,
	UIAspectRatioConstraint = true,
	UISizeConstraint = true,
	UITextSizeConstraint = true,
}
local function clone(value)
	if type(value) ~= "table" then
		return value
	end
	local result = {}
	for key, item in pairs(value) do
		result[key] = clone(item)
	end
	return result
end
local function finite(value)
	return type(value) == "number" and value == value and math.abs(value) < 1000000000
end
local function typed(kind, values)
	return { type = kind, value = values }
end
local function vector(value, kind, count)
	if type(value) ~= "table" or value.type ~= kind or type(value.value) ~= "table" or #value.value ~= count then
		return false
	end
	for _, number in ipairs(value.value) do
		if not finite(number) then
			return false
		end
	end
	return true
end
local function dimensions(value, width, height)
	if not vector(value, "UDim2", 4) then
		return width, height
	end
	local v = value.value
	return v[1] * width + v[2], v[3] * height + v[4]
end
local function contentBounds(node, width, height)
	for _, child in ipairs(node.children) do
		if child.className == "UIPadding" then
			local function pixels(key, reference)
				local value = child.properties[key]
				if not vector(value, "UDim", 2) then
					return 0
				end
				return value.value[1] * reference + value.value[2]
			end
			return math.max(0, width - pixels("PaddingLeft", width) - pixels("PaddingRight", width)),
				math.max(0, height - pixels("PaddingTop", height) - pixels("PaddingBottom", height))
		end
	end
	return width, height
end
local function boxSize(node, grid, width, height)
	local ownWidth, ownHeight = dimensions(node.properties.Size, width, height)
	if node.referenceSize and node.layoutSizing then
		if ownWidth <= 0 then ownWidth = node.referenceSize[1] end
		if ownHeight <= 0 then ownHeight = node.referenceSize[2] end
	end
	if GUI[node.className] then
		if grid then
			ownWidth, ownHeight = dimensions(grid.properties.CellSize, width, height)
		end
		for _, child in ipairs(node.children) do
			local properties = child.properties
			if
				child.className == "UIAspectRatioConstraint"
				and finite(properties.AspectRatio)
				and properties.AspectRatio > 0
			then
				local ratio = properties.AspectRatio
				local function enumName(value, default)
					return type(value) == "table"
							and value.type == "Enum"
							and type(value.value) == "table"
							and value.value[2]
						or default
				end
				local aspectType = enumName(properties.AspectType, "FitWithinMaxSize")
				local dominant = enumName(properties.DominantAxis, "Width")
				if aspectType == "FitWithinMaxSize" then
					ownWidth = math.min(ownWidth, ownHeight * ratio)
					ownHeight = ownWidth / ratio
				elseif dominant == "Height" then
					ownWidth = ownHeight * ratio
				else
					ownHeight = ownWidth / ratio
				end
			elseif child.className == "UISizeConstraint" then
				local min = vector(properties.MinSize, "Vector2", 2) and properties.MinSize.value or { 0, 0 }
				local max = vector(properties.MaxSize, "Vector2", 2) and properties.MaxSize.value or { 100000, 100000 }
				ownWidth = math.clamp(ownWidth, min[1], math.max(min[1], max[1]))
				ownHeight = math.clamp(ownHeight, min[2], math.max(min[2], max[2]))
			end
		end
	end
	return ownWidth, ownHeight
end
function Editor.find(package, id)
	local function visit(node, parent)
		if node.id == id then
			return node, parent
		end
		for _, child in ipairs(node.children) do
			local found, owner = visit(child, node)
			if found then
				return found, owner
			end
		end
	end
	for _, root in ipairs(package.roots) do
		local found, owner = visit(root)
		if found then
			return found, owner
		end
	end
end
function Editor.layout(parent)
	for _, child in ipairs(parent and parent.children or {}) do
		if child.className == "UIListLayout" or child.className == "UIGridLayout" then
			return child.className
		end
	end
end
function Editor.isGui(node)
	return GUI[node.className] == true
end
function Editor.isEditable(node)
	return GUI[node.className] == true or MODIFIERS[node.className] == true
end
local function validProperty(node, key, value)
	if MODIFIERS[node.className] then
		local class = node.className
		if class == "UIGridLayout" and (key == "CellSize" or key == "CellPadding") then
			return vector(value, "UDim2", 4)
		end
		if
			(class == "UIListLayout" and key == "Padding")
			or (class == "UIPadding" and ({
				PaddingTop = true,
				PaddingBottom = true,
				PaddingLeft = true,
				PaddingRight = true,
			})[key])
			or (class == "UICorner" and key == "CornerRadius")
		then
			return vector(value, "UDim", 2) and value.value[1] >= 0 and value.value[2] >= 0
		end
		if class == "UISizeConstraint" and (key == "MinSize" or key == "MaxSize") then
			return vector(value, "Vector2", 2) and value.value[1] >= 0 and value.value[2] >= 0
		end
		if (class == "UIAspectRatioConstraint" and key == "AspectRatio") or (class == "UIScale" and key == "Scale") then
			return finite(value) and value > 0
		end
		if class == "UITextSizeConstraint" and (key == "MinTextSize" or key == "MaxTextSize") then
			return finite(value) and value >= 1 and value <= 100
		end
		if class == "UIStroke" then
			if key == "StrokeSizingMode" then
				return type(value)=="table" and value.type=="Enum" and type(value.value)=="table" and value.value[1]=="StrokeSizingMode" and ({FixedSize=true,ScaledSize=true})[value.value[2]]==true
			end
			if key == "Thickness" then
				return finite(value) and value >= 0 and value <= 100
			end
			if key == "Transparency" then
				return finite(value) and value >= 0 and value <= 1
			end
		end
		if (class == "UIListLayout" or class == "UIGridLayout") and key == "FillDirection" then
			return type(value) == "table"
				and value.type == "Enum"
				and type(value.value) == "table"
				and value.value[1] == "FillDirection"
				and (value.value[2] == "Horizontal" or value.value[2] == "Vertical")
		end
		return false
	end
	if not GUI[node.className] then
		return false
	end
	if key == "Size" or key == "Position" or (key == "CanvasSize" and node.className == "ScrollingFrame") then
		return vector(value, "UDim2", 4)
	end
	if key == "AnchorPoint" then
		return vector(value, "Vector2", 2)
			and value.value[1] >= 0
			and value.value[1] <= 1
			and value.value[2] >= 0
			and value.value[2] <= 1
	end
	if key == "Visible" or key == "ClipsDescendants" then
		return type(value) == "boolean"
	end
	if key == "Rotation" then
		return finite(value)
	end
	if key == "BackgroundTransparency" then
		return finite(value) and value >= 0 and value <= 1
	end
	if node.className:sub(1, 4) == "Text" then
		if key == "Text" or (key == "PlaceholderText" and node.className == "TextBox") then
			return type(value) == "string" and #value <= 1000000
		end
		if key == "TextSize" then
			return finite(value) and value >= 1 and value <= 100
		end
		if key == "TextScaled" or key == "TextWrapped" then
			return type(value) == "boolean"
		end
	end
	if node.className == "ScrollingFrame" then
		if key == "ScrollBarThickness" then
			return finite(value) and value >= 0 and value <= 100
		end
		if key == "AutomaticCanvasSize" then
			return type(value) == "table"
				and value.type == "Enum"
				and type(value.value) == "table"
				and value.value[1] == "AutomaticSize"
				and ({ None = true, X = true, Y = true, XY = true })[value.value[2]] == true
		end
	end
	return false
end
local function cleanEdit(node, edit)
	local result = { properties = {} }
	if type(edit) ~= "table" then
		return result
	end
	for _, key in ipairs({ "sizeMode", "positionMode" }) do
		if MODES[edit[key]] then
			result[key] = edit[key]
		end
	end
	for key, value in pairs(type(edit.properties) == "table" and edit.properties or {}) do
		if validProperty(node, key, value) then
			result.properties[key] = clone(value)
		end
	end
	if finite(edit.aspectRatio) and edit.aspectRatio > 0 then
		result.aspectRatio = edit.aspectRatio
	end
	if vector(edit.minSize, "Vector2", 2) and vector(edit.maxSize, "Vector2", 2) then
		local min, max = edit.minSize.value, edit.maxSize.value
		if min[1] >= 0 and min[2] >= 0 and max[1] >= min[1] and max[2] >= min[2] then
			result.minSize = clone(edit.minSize)
			result.maxSize = clone(edit.maxSize)
		end
	end
	if
		node.className:sub(1, 4) == "Text"
		and finite(edit.minText)
		and finite(edit.maxText)
		and edit.minText >= 1
		and edit.maxText >= edit.minText
		and edit.maxText <= 100
	then
		result.minText = edit.minText
		result.maxText = edit.maxText
	end
	return result
end
function Editor.restore(package, saved)
	local config = { mode = "scale", layers = {} }
	if type(saved) ~= "table" then
		return config
	end
	if MODES[saved.mode] then
		config.mode = saved.mode
	end
	local nodes = {}
	local function index(node)
		nodes[node.id] = node
		for _, child in ipairs(node.children) do
			index(child)
		end
	end
	for _, root in ipairs(package.roots) do
		index(root)
	end
	for id, edit in pairs(type(saved.layers) == "table" and saved.layers or {}) do
		local node = nodes[id]
		if node and Editor.isEditable(node) then
			config.layers[id] = cleanEdit(node, edit)
		end
	end
	return config
end
local function automaticCanvasAxes(parent)
	if not parent or parent.className ~= "ScrollingFrame" then return false, false end
	local automatic = parent.properties.AutomaticCanvasSize
	local axis = type(automatic) == "table" and automatic.type == "Enum" and automatic.value[2] or "None"
	return axis == "X" or axis == "XY", axis == "Y" or axis == "XY"
end
local function convert(value, mode, width, height, parent)
	if not vector(value, "UDim2", 4) or mode == "source" then
		return clone(value)
	end
	local v = value.value
	if mode == "offset" then
		return typed("UDim2", { 0, v[1] * width + v[2], 0, v[3] * height + v[4] })
	end
	-- Existing scale and offset components both contribute to the authored bounds.
	-- Automatic canvases need a stable content extent. Converting the scrolling
	-- axis to percentages can leave the final row/card outside the computed canvas.
	-- Scale the viewport and cross-axis; resolve content along automatic axes to pixels.
	local autoX, autoY = automaticCanvasAxes(parent)
	local converted = typed("UDim2", {
		autoX and 0 or v[1] + v[2] / width,
		autoX and v[1] * width + v[2] or 0,
		autoY and 0 or v[3] + v[4] / height,
		autoY and v[3] * height + v[4] or 0,
	})
	-- A Hug parent changes with content, rather than the viewport. Keep authored
	-- constraints on its automatic axes so an absolute overlay cannot drift.
	if parent and parent.layoutSizing then
		for axis, sizing in ipairs(parent.layoutSizing) do
			if sizing == "HUG" then
				local first = axis == 1 and 1 or 3
				converted.value[first], converted.value[first + 1] = v[first], v[first + 1]
			end
		end
	end
	return converted
end
local function modifier(node, className, suffix, properties)
	for _, child in ipairs(node.children) do
		if child.className == className then
			for key, value in pairs(properties) do
				child.properties[key] = clone(value)
			end
			return
		end
	end
	local id = node.id .. "/studio-" .. suffix
	-- IDs can originate outside our compiler. Do not collide with one of them.
	while node._ids[id] do
		id = id .. "-"
	end
	node._ids[id] = true
	table.insert(
		node.children,
		{ id = id, name = className, className = className, properties = clone(properties), children = {} }
	)
end
local function convertSized(node, value, mode, width, height, parent)
	-- Native layout semantics own these sizes in every import mode. Fixed/Hug
	-- retain their basis; Fill retains both its proportion and fixed gap correction.
	-- The unit preference still converts surrounding measured geometry.
	if node.layoutSizing then return clone(value) end
	return convert(value, mode, width, height, parent)
end
function Editor.prepare(package, config)
	config = Editor.restore(package, config)
	local result = clone(package)
	local notices, ids, layouts, grids = {}, {}, {}, {}
	local function index(node)
		ids[node.id] = true
		layouts[node] = Editor.layout(node)
		for _, child in ipairs(node.children) do
			if child.className == "UIGridLayout" then
				grids[node] = child
				break
			end
		end
		for _, child in ipairs(node.children) do
			index(child)
		end
	end
	for _, root in ipairs(result.roots) do
		index(root)
	end
	local function visit(node, parent, width, height)
		local original = node.properties
		local ownWidth, ownHeight = boxSize(node, grids[parent], width, height)
		local contentWidth, contentHeight = contentBounds(node, ownWidth, ownHeight)
		-- The world runtime scales this authored canvas once. Converting its size
		-- to viewport scale would multiply the camera-dependent billboard size twice.
		local worldCanvas = parent and parent.worldUI and node.id == parent.id .. '/world-canvas'
		if GUI[node.className] and not worldCanvas then
			local edit = config.layers[node.id] or { properties = {} }
			local sizeMode = edit.sizeMode or config.mode
			local positionMode = edit.positionMode or config.mode
			if width > 0 and height > 0 then
				if original.Size then
					original.Size = convertSized(node, original.Size, sizeMode, width, height, parent)
				end
				-- A native list/grid controls position and anchor; don't invent offsets.
				if not layouts[parent] and original.Position then
					original.Position = convert(original.Position, positionMode, width, height, parent)
				end
			elseif sizeMode ~= "source" or positionMode ~= "source" then
				table.insert(notices, node.name .. ": zero or unknown parent bounds; kept source geometry.")
			end
			for key, value in pairs(edit.properties) do
				if not layouts[parent] or (key ~= "Position" and key ~= "AnchorPoint") then
					original[key] = clone(value)
				end
			end
			node._ids = ids
			if edit.aspectRatio then
				modifier(node, "UIAspectRatioConstraint", "aspect", { AspectRatio = edit.aspectRatio })
			end
			if edit.minSize then
				modifier(node, "UISizeConstraint", "bounds", { MinSize = edit.minSize, MaxSize = edit.maxSize })
			end
			if edit.minText then
				modifier(
					node,
					"UITextSizeConstraint",
					"text",
					{ MinTextSize = edit.minText, MaxTextSize = edit.maxText }
				)
			end
			node._ids = nil
		elseif MODIFIERS[node.className] then
			if node.className == "UIGridLayout" and width > 0 and height > 0 then
				for _, key in ipairs({ "CellSize", "CellPadding" }) do
					if original[key] then
						original[key] = key == "CellSize" and convertSized(node, original[key], config.mode, width, height, parent)
							or (node.layoutSizing and clone(original[key]) or convert(original[key], config.mode, width, height, parent))
					end
				end
			end
			for key, value in pairs(config.layers[node.id] and config.layers[node.id].properties or {}) do
				original[key] = clone(value)
			end
		end
		for _, child in ipairs(node.children) do
			visit(child, node, contentWidth, contentHeight)
		end
	end
	for _, root in ipairs(result.roots) do
		local width, height = 0, 0
		if root.referenceSize then
			width = root.referenceSize[1]
			height = root.referenceSize[2]
		else
			-- Legacy packages can omit referenceSize. Only infer an explicit pixel canvas.
			for _, child in ipairs(root.children) do
				if vector(child.properties.Size, "UDim2", 4) then
					local v = child.properties.Size.value
					if v[1] == 0 and v[3] == 0 and v[2] > 0 and v[4] > 0 then
						width = v[2]
						height = v[4]
						break
					end
				end
			end
		end
		if width > 0 and height > 0 and not root.referenceSize then
			root.referenceSize = { width, height }
		end
		for _, child in ipairs(root.children) do
			visit(child, root, width, height)
		end
	end
	local count = 0
	local function countNode(node)
		count += 1
		for _, child in ipairs(node.children) do
			countNode(child)
		end
	end
	for _, root in ipairs(result.roots) do
		countNode(root)
	end
	result.instanceCount = count
	return result, notices
end
function Editor.bounds(package, id)
	local result = { 0, 0 }
	local function visit(node, grid, width, height)
		if node.id == id then
			result = { width, height }
			return
		end
		local ownWidth, ownHeight = boxSize(node, grid, width, height)
		local contentWidth, contentHeight = contentBounds(node, ownWidth, ownHeight)
		local ownGrid
		for _, child in ipairs(node.children) do
			if child.className == "UIGridLayout" then
				ownGrid = child
				break
			end
		end
		for _, child in ipairs(node.children) do
			visit(child, ownGrid, contentWidth, contentHeight)
		end
	end
	for _, root in ipairs(package.roots) do
		local reference = root.referenceSize or { 0, 0 }
		for _, child in ipairs(root.children) do
			visit(child, nil, reference[1], reference[2])
		end
	end
	return result
end
function Editor.change(package, config, id, key, value)
	local result = Editor.restore(package, config)
	local node, parent = Editor.find(package, id)
	assert(node and Editor.isEditable(node), "Select a UI layer or modifier to edit.")
	local edit = result.layers[id] or { properties = {} }
	result.layers[id] = edit
	if key == "reset" then
		result.layers[id] = nil
	elseif key == "sizeMode" or key == "positionMode" then
		assert(MODES[value], "Choose scale, pixels, or source sizing.")
		assert(
			not Editor.layout(parent) or (key == "sizeMode" and Editor.layout(parent) ~= "UIGridLayout"),
			"The parent layout controls this dimension."
		)
		edit[key] = value
		edit.properties[key == "sizeMode" and "Size" or "Position"] = nil
	elseif key == "aspectRatio" then
		assert(value == false or (finite(value) and value > 0), "Aspect ratio must be positive.")
		edit.aspectRatio = value or nil
	elseif key == "sizeBounds" then
		if value == false then
			edit.minSize = nil
			edit.maxSize = nil
		else
			assert(
				type(value) == "table" and vector(value.min, "Vector2", 2) and vector(value.max, "Vector2", 2),
				"Enter width and height limits."
			)
			for i = 1, 2 do
				assert(
					value.min.value[i] >= 0 and value.max.value[i] >= value.min.value[i],
					"Maximum size must be at least the minimum size."
				)
			end
			edit.minSize = clone(value.min)
			edit.maxSize = clone(value.max)
		end
	elseif key == "textBounds" then
		if value == false then
			edit.minText = nil
			edit.maxText = nil
		else
			assert(
				type(value) == "table"
					and finite(value.min)
					and finite(value.max)
					and value.min >= 1
					and value.max >= value.min
					and value.max <= 100,
				"Text limits must be between 1 and 100, with minimum ≤ maximum."
			)
			edit.minText = value.min
			edit.maxText = value.max
		end
	else
		assert(validProperty(node, key, value), "Invalid " .. key .. " value.")
		assert(
			not Editor.layout(parent) or (key ~= "Position" and key ~= "AnchorPoint"),
			"The parent layout controls position and anchor."
		)
		assert(key ~= "Size" or Editor.layout(parent) ~= "UIGridLayout", "The parent grid controls size.")
		if node.className == "UISizeConstraint" and (key == "MinSize" or key == "MaxSize") then
			local other = key == "MinSize" and "MaxSize" or "MinSize"
			local limit = edit.properties[other]
				or node.properties[other]
				or typed("Vector2", other == "MinSize" and { 0, 0 } or { 100000, 100000 })
			for i = 1, 2 do
				assert(
					key == "MinSize" and value.value[i] <= limit.value[i]
						or key == "MaxSize" and value.value[i] >= limit.value[i],
					"Maximum size must be at least the minimum size."
				)
			end
		elseif node.className == "UITextSizeConstraint" and (key == "MinTextSize" or key == "MaxTextSize") then
			local other = key == "MinTextSize" and "MaxTextSize" or "MinTextSize"
			local limit = edit.properties[other] or node.properties[other] or (other == "MinTextSize" and 1 or 100)
			assert(
				key == "MinTextSize" and value <= limit or key == "MaxTextSize" and value >= limit,
				"Maximum text size must be at least the minimum."
			)
		end
		edit.properties[key] = clone(value)
	end
	return result
end
return Editor
