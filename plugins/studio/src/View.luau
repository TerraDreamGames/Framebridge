-- A focused React Roblox importer and selection utilities panel.
-- General editing belongs to Studio's Explorer and Properties windows.
local React = require(script.Parent.ReactLua.React)
local ReactRoblox = require(script.Parent.ReactLua.ReactRoblox)
local UI = require(script.Parent.Components)
local Brand = require(script.Parent.Brand)
local Lifetime = require(script.Parent.ConnectionLifetime)
local e = React.createElement
local View = {}
local MODES = {
	{ Value = "scale", Label = "Scale" },
	{ Value = "offset", Label = "Pixels" },
	{ Value = "source", Label = "Source" },
}
local function Expiry(props)
    local C = UI.useTheme()
    local now, setNow = React.useState(DateTime.now().UnixTimestampMillis)
    React.useEffect(function()
        local alive = true
        local thread = task.spawn(function()
            while alive do
                setNow(DateTime.now().UnixTimestampMillis)
                task.wait(1)
            end
        end)
        return function() alive=false; task.cancel(thread) end
    end, {props.ExpiresAt})
    local remaining = Lifetime.read(props.ExpiresAt or 0, now)
    if props.Header then
        return e(UI.Button, {
            Name="Connect", Text="Connected · " .. remaining.label,
            Color=remaining.soon and C.warning or C.linked,
            Position=UDim2.new(1,-164,0,9), Size=UDim2.fromOffset(148,26),
            Quiet=true, Regular=true, TextSize=12,
            Disabled=props.Disabled, OnClick=props.OnClick,
        })
    end
    return e(UI.Note, {Text=(props.Label or "Connection") .. " · " .. remaining.label, Color=remaining.soon and C.warning or C.muted})
end
local function note(text, color)
	return e(UI.Note, { Text = text, Color = color })
end
local function button(text, callback, disabled, primary)
	return e(UI.Button, { Text = text, OnClick = callback, Disabled = disabled, Primary = primary })
end
local function section(title, items)
	return e(UI.Section, { Title = title, Items = items })
end
local function Documentation(props)
    local topic, setTopic = React.useState(props.Topic or "studio-import")
    return e(UI.Accordion, {Title="Guides & documentation", LayoutOrder=props.LayoutOrder, Items={
        note("Search how-tos for every feature. Click the link to copy it, then open it in your browser."),
        e(UI.Choices, {Name="DocumentationTopic", Options={
            {Value="studio-import",Label="Import"}, {Value="studio-tools",Label="UI tools"}, {Value="",Label="All guides"},
        }, Value=topic, OnChange=setTopic}),
        e(UI.CopyInput, {Name="DocumentationLink",Value="https://framebridge.terradream.games/#docs" .. (topic~="" and "/" .. topic or "")}),
    }})
end
local function Images(props)
    local C = UI.useTheme()
    local state, actions = props.State, props.Actions
    local search, setSearch = React.useState("")
    local items = {note(actions.missing() == 0 and "All images are linked. Owner permissions and moderation still apply." or "Upload in Figma, scan inserted artwork, or enter an image ID.", actions.missing() == 0 and C.linked or C.warning)}
    for _, asset in ipairs(props.Package.assets) do
        local id = props.Importer.assetId(state.bindings[asset.id]) or props.Importer.assetId(asset.robloxId)
        table.insert(items, e("Frame", {
            Name = "ImageLink:" .. asset.id, Size = UDim2.new(1,0,0,72), BackgroundTransparency = 1, Active = true,
            [React.Event.MouseEnter] = function() if actions.dropGallery then actions.dropGallery(asset.id) end end,
            [React.Event.MouseLeave] = function() if actions.dropGallery then actions.dropGallery(nil) end end,
        }, {
            Thumbnail = e("ImageLabel", {Image=id or "", BackgroundColor3=C.raised, BorderSizePixel=0, Size=UDim2.fromOffset(36,36), ScaleType=Enum.ScaleType.Fit}),
            Target = e(UI.Button, {Name="ChooseImage:" .. asset.id, Text=asset.name, Quiet=true, Selected=state.galleryTarget==asset.id, Position=UDim2.fromOffset(44,0), Size=UDim2.new(1,-110,0,28), OnClick=function() if actions.galleryTarget then actions.galleryTarget(asset.id) end end, Disabled=state.busy}),
            Input = e(UI.Input, {Name="AssetId", Value=state.bindings[asset.id] or asset.robloxId or "", Placeholder="Roblox image asset ID", Position=UDim2.fromOffset(44,32), Size=UDim2.new(1,-44,0,30), Disabled=state.busy, OnCommit=function(value) actions.bind(asset.id,value,props.Package.sourceId) end}),
            Uses = e(UI.Button, {Text="Locate", Quiet=true, Position=UDim2.new(1,-62,0,0), Size=UDim2.fromOffset(62,28), Disabled=state.busy or not id, OnClick=function() if actions.showUses then actions.showUses(asset.id) end end}),
        }))
    end
    local gallery = {
        note("Insert uploaded artwork through Asset Manager, then scan. Only unique exact identity or filename matches fill empty links. Drag a thumbnail onto a link, or choose its target above and click Assign."),
        button("Scan inserted images",actions.scanAssets,state.busy),
        e(UI.Input,{Name="GallerySearch", Value=search, Placeholder="Search inserted images", OnChange=setSearch}),
    }
    for _, entry in ipairs(state.gallery or {}) do
        if search == "" or string.find(string.lower(entry.name),string.lower(search),1,true) then
            table.insert(gallery,e("Frame",{Name="GalleryImage:" .. entry.id, Size=UDim2.new(1,0,0,42),BackgroundTransparency=1},{
                Thumbnail=e("ImageButton",{Name="DragImage",Image=entry.id,Size=UDim2.fromOffset(36,36),ScaleType=Enum.ScaleType.Fit,BackgroundColor3=C.raised,BorderSizePixel=0,Active=not state.busy,
                    [React.Event.MouseButton1Down]=function() if actions.dragGallery then actions.dragGallery(entry.id) end end,
                    [React.Event.InputEnded]=function(_,input) if input.UserInputType==Enum.UserInputType.MouseButton1 and actions.finishGalleryDrag then actions.finishGalleryDrag() end end}),
                Name=e(UI.Label,{Text=entry.name,Position=UDim2.fromOffset(44,0),Size=UDim2.new(1,-120,1,0)}),
                Assign=e(UI.Button,{Text="Assign",Position=UDim2.new(1,-68,0,4),Size=UDim2.fromOffset(68,30),Disabled=state.busy or not state.galleryTarget,OnClick=function() actions.assignGallery(entry.id) end}),
            }))
        end
    end
    if #(state.gallery or {}) == 0 then table.insert(gallery,note("No inserted images scanned yet.")) end
    table.insert(items,e(UI.Accordion,{Title="Inserted image gallery",Items=gallery}))
    return e(UI.Stack,{Items=items})
end
local function RecentImports(props)
    local C = UI.useTheme()
    local state, actions = props.State, props.Actions
    local items = {note("Saved on this device. Reopen a design to review it; importing still uses validation and Undo.")}
    if state.historyError then
        table.insert(items,note(state.historyError,C.warning)); table.insert(items,button("Retry recent imports",actions.retryHistory,state.busy))
    end
    for index, entry in ipairs(state.recent or {}) do
        table.insert(items,button(entry.name .. " · " .. entry.mode, function() actions.restoreImport(index) end,state.busy))
    end
    if #(state.recent or {}) == 0 then table.insert(items,note("Your successful imports will appear here."))
    else table.insert(items,button("Clear recent imports",actions.clearHistory,state.busy)) end
    return e(UI.Accordion,{Title="Recent imports",Items=items,LayoutOrder=props.LayoutOrder})
end
local function Connection(props)
	local C = UI.useTheme()
	local state, actions = props.State, props.Actions
	local items = {
		button(
			state.disconnecting and "Disconnecting…"
				or state.connecting and "Connecting…"
				or state.paired and "Connected to Figma"
				or state.code and "Generate a new code"
				or "Connect to Figma",
			actions.connect,
			state.busy or state.connecting or state.paired,
			not state.paired
		),
	}
	if state.privateBeta and not state.paired then
        table.insert(items, 1, e(UI.Input, {
            Name = "BetaAccess", Value = state.betaAccess or "",
            Secret = true,
            Placeholder = "Private beta access code", Disabled = state.busy or state.connecting,
            OnCommit = actions.betaAccess,
        }))
        table.insert(items, 2, note("Private beta · use your tester access code. Kept while this plugin is open."))
    end
	if state.code and not state.paired then
		table.insert(items, note("Enter this Studio code in Connect Studio in Figma. Pair within 10 minutes."))
		table.insert(
			items,
			e(UI.CopyInput, {
				Name = "PairingCode",
				Value = state.code:sub(1, 6) .. " " .. state.code:sub(7),
				Disabled = state.busy or state.connecting,
				TextSize = 20,
			})
		)
	elseif state.paired then
		table.insert(items, note("Your connection is reusable. Send another design from Figma without entering a new code."))
		table.insert(items, e(Expiry, {ExpiresAt=state.expiresAt}))
	else
		table.insert(items, note("Get a Studio code, then enter it in Figma’s Connect Studio panel."))
	end
	if state.paired or state.code then
        if state.connectionStorageError then
            table.insert(items, note("This connection works while Studio is open, but Studio could not save it for reopening."))
        elseif state.connectionMemoryOnly then
            table.insert(items, note("Save this place to Roblox to remember its connection after reopening Studio."))
        end
    end
	table.insert(items, e(UI.Toggle, {
		Text = "Auto-import designs",
		Value = state.autoImport,
		Disabled = state.busy,
		OnChange = actions.autoImport,
	}))
	table.insert(items, note("Received designs wait for review when auto-import is off."))
	if state.code or state.paired then
		table.insert(items, button("Disconnect Figma", actions.disconnect, state.busy or state.connecting))
	end
	return e(UI.Stack, {Name="Direct connection",Items=items})
end

local function ImportOptions(props)
	local C = UI.useTheme()
	local state, actions = props.State, props.Actions
	local items = {
		e(UI.Accordion, {
			key = "Connection" .. tostring(state.connectionOpen or 0) .. tostring(state.code ~= nil and not state.paired),
			Title = "Figma connection",
			DefaultOpen = not state.package or (state.code ~= nil and not state.paired) or (state.connectionOpen or 0) > 0,
			Items = { e(Connection, { State = state, Actions = actions }) },
		}),
	}
    local codeItems={
        note("Open a snapshot shared from Figma. This code is independent of a live connection and may be imported repeatedly until expiry or revocation."),
        e(UI.Input,{Name="HandoffCode",Value=state.handoffCode or "",Placeholder="FB-XXXXXX-XXXXXX-XXXXXX-XXXXXX",Disabled=state.busy,OnCommit=actions.handoffCode}),
    }
    if state.privateBeta then table.insert(codeItems,e(UI.Input,{Name="HandoffBetaAccess",Value=state.betaAccess or "",Secret=true,Placeholder="Your private beta tester access code",Disabled=state.busy or state.connecting,OnCommit=actions.betaAccess})) end
    table.insert(codeItems,e(UI.Button,{Name="OpenHandoff",Text=state.handoffLoading and "Opening…" or "Open design code",Disabled=state.busy or state.connecting or not state.handoffCode or state.handoffCode=="",OnClick=actions.openHandoff}))
    if state.handoffExpiresAt then
        table.insert(codeItems,e(Expiry,{ExpiresAt=state.handoffExpiresAt,Label="Design code expires"}))
        table.insert(codeItems,note("A loaded snapshot remains editable after its code expires. Roblox artwork permissions still apply."))
    end
    if state.handoffReceiptError then table.insert(codeItems,note(state.handoffReceiptError,C.warning)) end
    table.insert(items,e(UI.Accordion,{Title="Import a design code",Items=codeItems}))
	if state.package then
		local package = state.package
		table.insert(
			items,
			e(UI.Stack, {
				Items = {
					e("Frame", { Size = UDim2.new(1, 0, 0, 30), BackgroundTransparency = 1 }, {
						Name = e(UI.Label, { Text = package.name, Bold = true, Size = UDim2.new(1, -110, 1, 0) }),
						Open = e(UI.Button, {
							Name = "OpenPackage",
							Text = "Open package",
							Quiet = true,
							Position = UDim2.new(1, -104, 0, 0),
							Size = UDim2.fromOffset(104, 30),
							OnClick = actions.open,
							Disabled = state.busy,
						}),
					}),
					note(
						string.format(
							"%d %s · %d instances · %d images",
							#package.roots,
							#package.roots == 1 and "screen" or "screens",
							package.instanceCount,
							#package.assets
						)
					),
				},
			})
		)
		table.insert(
			items,
			section("Import sizing", {
				e(UI.Choices, {
					Name = "ImportSizing",
					Options = MODES,
					Value = state.editor.mode,
					Disabled = state.busy,
					OnChange = actions.geometry,
				}),
				note(
					state.editor.mode == "scale"
							and "Containers follow the parent. Content keeps pixel sizes along automatic scroll axes. Existing constraints are retained."
						or state.editor.mode == "offset" and "Sizes and positions use fixed pixels."
						or "Keep the sizing and constraints from the exported package."
				),
			})
		)
		if next(state.editor.layers) then
			table.insert(
				items,
				section("Saved overrides", {
					note("This design has overrides from the previous Studio editor."),
					button("Clear saved overrides", actions.resetEdits, state.busy),
				})
			)
		end
		table.insert(
			items,
			section("Import mode", {
				e(UI.Choices, {
					Name = "ImportMode",
					Options = { { Value = "new", Label = "New copy" }, { Value = "update", Label = "Update existing" } },
					Value = state.update and "update" or "new",
					Disabled = state.busy,
					OnChange = function(value)
						actions.mode(value == "update")
					end,
				}),
				note(
					state.update and "Update matching UI and keep attached scripts."
						or "Create new screens in StarterGui."
				),
			})
		)
		if #package.assets > 0 then
			table.insert(
				items,
				e(UI.Accordion, {
					key = "Assets" .. tostring(actions.missing() > 0),
					Title = "Image links",
					DefaultOpen = actions.missing() > 0,
					Items = {
						e(Images, { Package = package, State = state, Actions = actions, Importer = props.Importer }),
					},
				})
			)
		end
		local features = state.scriptFeatures or (props.Importer and props.Importer.scriptFeatures and props.Importer.scriptFeatures(package))
			or {total=0,interactions=0,visuals=0,worlds=0}
		table.insert(items, section("Generated scripts", {
			e(UI.Toggle, {Name="AddGeneratedScripts", Text="Add generated scripts", Value=state.addScripts == true,
				Disabled=state.busy, OnChange=actions.addScripts}),
			note(features.total > 0
				and string.format("%d interaction, %d visual and %d world UI features use scripts.", features.interactions, features.visuals, features.worlds)
				or "This design needs no generated scripts. Native buttons work with your own game code."),
			note(state.addScripts
				and "Only configured features add a script. This choice is saved for this design."
				or "Off by default. Imports contain no generated code. Interactions, themes, particles and live visual adjustments need this enabled in-game."),
		}))
		local notes = {}
		for _, value in ipairs(state.editorNotices or {}) do
			if #notes < 25 then
				table.insert(notes, note(value, C.warning))
			end
		end
		local grouped, order = {}, {}
		for _, issue in ipairs(package.issues) do
			if issue.severity ~= "info" and not actions.resolved(issue) then
				local key = (issue.code or "") .. "\0" .. issue.message
				if grouped[key] then
					grouped[key].count += 1
				else
					local group = { issue = issue, count = 1 }
					grouped[key] = group
					table.insert(order, group)
				end
			end
		end
		for _, group in ipairs(order) do
			if #notes < 25 then
				table.insert(
					notes,
					note(
						(group.count > 1 and group.count .. " layers" or group.issue.nodeName or "Layer")
							.. ": "
							.. group.issue.message,
						C.warning
					)
				)
			end
		end
		if #notes > 0 then
			table.insert(items, e(UI.Accordion, { Title = "Conversion notes", Items = notes }))
		end
		table.insert(
			items,
			e(UI.Accordion, {
				Title = "Import options",
				Items = {
					e(UI.Toggle, {
						Text = "Allow image placeholders",
						Value = state.placeholders,
						Disabled = state.busy,
						OnChange = actions.placeholders,
					}),
					note(
						"Import first, then use Roblox Explorer and Properties to finish your UI. UI tools adds sizing and constraints to your Studio selection."
					),
				},
			})
		)
	else
		table.insert(
			items,
			section("Bring your Figma UI into Studio", {
				note(
					"Send a design from Figma or open an exported package. Import as normal Roblox instances, then edit them in Studio."
				),
				button("Open package", actions.open, state.busy),
			})
		)
	end
	table.insert(items,e(RecentImports,{State=state,Actions=actions}))
	table.insert(
		items,
		e(UI.Accordion, {
			key = "Transfer" .. tostring(state.transfer),
			Title = "Paste a package",
			DefaultOpen = state.transfer,
			Items = {
				e(UI.Input, {
					Name = "PackageJson",
					Value = state.paste or "",
					Placeholder = "Paste Framebridge package JSON…",
					Multiline = true,
					Disabled = state.busy,
					OnChange = actions.draft,
				}),
				button("Review pasted package", function()
					actions.load(state.paste or "")
				end, state.busy),
			},
		})
	)
    table.insert(items,e(Documentation,{Topic="studio-import"}))
	return e(UI.Stack, { Name = "ImportContent", Items = items, Gap = 12 })
end
local function SelectionPanel(props)
	local C = UI.useTheme()
	local state, actions = props.State, props.Actions
	local descendants, setDescendants = React.useState(false)
	local scope, setScope = React.useState("both")
	local minimum, setMinimum = React.useState({ 0, 0 })
	local maximum, setMaximum = React.useState({ 100000, 100000 })
	local textLimits, setTextLimits = React.useState({ 12, 32 })
	local keepPosition, setKeepPosition = React.useState(true)
	local worldCanvas, setWorldCanvas = React.useState({ 1920, 1080 })
	local worldFace, setWorldFace = React.useState("Front")
	local world = state.worldSelection or {}
	local classPreview = state.classPreview or {count=0,losses={}}
	local cleanup = state.cleanup or {roots=0,attributes=0,scripts=0,bytes=0,skipped={}}
	local cleanupItems = {
		e(UI.Choices, {Name="CleanupMode", Options={{Value="unused",Label="Unused data"},{Value="detach",Label="Detach import"}},
			Value=state.cleanupMode or "unused", Disabled=state.busy, OnChange=actions.cleanupMode}),
		note(state.cleanupMode == "detach"
			and "Removes Framebridge attributes and untouched generated scripts from the selected screens. Stops sync, generated interactions, themes and live visual adjustments. Keeps your UI, scripts and custom attributes."
			or "Cleans stale behavior data and unnecessary generated scripts. Keeps sync identities and metadata used by active visual features."),
		note(string.format("%d screens · %d attributes · %d scripts · %.1f KB of attribute data", cleanup.roots, cleanup.attributes, cleanup.scripts, cleanup.bytes / 1024)),
	}
	if cleanup.error then table.insert(cleanupItems,note(cleanup.error,C.warning)) end
	for index,reason in ipairs(cleanup.skipped) do if index<=3 then table.insert(cleanupItems,note("Skipped: " .. reason,C.warning)) end end
	table.insert(cleanupItems, e(UI.Button, {Name="CleanFramebridgeData",
		Text=state.cleanupMode == "detach" and "Detach UI from Framebridge" or "Clean unused Framebridge data",
		Disabled=state.busy or (cleanup.attributes==0 and cleanup.scripts==0), OnClick=actions.cleanup}))
	table.insert(cleanupItems,note("Select a screen or one of its layers. Cleanup covers that screen and supports Undo. Edited generated scripts and their screens are skipped."))
	local classItems = {
		note("Selected instances only; children keep their types. Name, compatible properties, attributes, tags and existing children/scripts are retained."),
		note("Conversion replaces the instance. Update external references and reconnect its event listeners. Properties specific to the old class are discarded."),
	}
	table.insert(classItems,e(UI.Select,{Name="ClassTarget",Options={
		{Value="Frame",Label="Frame"},{Value="CanvasGroup",Label="CanvasGroup"},{Value="ScrollingFrame",Label="ScrollingFrame"},
		{Value="TextLabel",Label="TextLabel"},{Value="TextButton",Label="TextButton"},{Value="TextBox",Label="TextBox"},
		{Value="ImageLabel",Label="ImageLabel"},{Value="ImageButton",Label="ImageButton"},
	},Value=state.classTarget,Disabled=state.busy,OnChange=actions.classTarget}))
	if classPreview.error then table.insert(classItems,note(classPreview.error,C.warning)) end
	for index, loss in ipairs(classPreview.losses) do
		if index<=3 then table.insert(classItems,note("Discarded: "..loss,C.warning)) end
	end
	if #classPreview.losses>3 then table.insert(classItems,note(string.format("%d more instances lose class-specific properties.",#classPreview.losses-3),C.warning)) end
	table.insert(classItems,note("New buttons accept input without automatic color changes. New text inputs keep the authored text on focus. Match the Figma instance type before reimporting converted UI."))
	table.insert(classItems,e(UI.Button,{Name="ConvertClass",Text=string.format("Convert %d to %s",classPreview.count,state.classTarget or "chosen class"),Disabled=state.busy or classPreview.count==0 or classPreview.error~=nil,OnClick=actions.convertClass}))
	React.useEffect(function()
		if world.canvas then setWorldCanvas(world.canvas) end
	end, { world.rootName or "", world.rootClass or "", world.canvas and table.concat(world.canvas,",") or "" })
	local selection = state.selection or { count = 0, descendants = 0, total = 0 }
	local count = descendants and selection.descendants or selection.count
	local disabled = state.busy or count == 0
	local function run(operation, options)
		options = options or {}
		options.descendants = descendants
		return actions.tool(operation, options)
	end
	local anchorRows = {}
	local labels = {
		{ "Top left", "Top", "Top right" },
		{ "Left", "Center", "Right" },
		{ "Bottom left", "Bottom", "Bottom right" },
	}
	for y = 1, 3 do
		local options = {}
		for x = 1, 3 do
			table.insert(options, { Value = tostring(x), Label = labels[y][x] })
		end
		table.insert(
			anchorRows,
			e(UI.Choices, {
				Name = "AnchorRow" .. y,
				Options = options,
				Disabled = disabled,
				OnChange = function(value)
					run(
						"anchor",
						{ anchor = Vector2.new((tonumber(value) - 1) / 2, (y - 1) / 2), keepPosition = keepPosition }
					)
				end,
			})
		)
	end
	local items = {
		section("Studio selection", {
			e(UI.Button, { Name = "OpenCommands", Text = "Search UI commands…", OnClick = actions.openCommands }),
			e(UI.Label, {
				Name = "SelectionSummary",
				Text = count > 0 and string.format(
					"%d UI %s · %s",
					count,
					count == 1 and "element" or "elements",
					selection.name or "selected"
				) or "Select UI in Roblox Explorer",
				Bold = true,
				Wrap = true,
			}),
			note(
				count > 0 and "These tools modify the selected Studio instances. Every action supports Undo."
					or "Select a Frame, image or text layer in Explorer. Include descendants to process a ScreenGui."
			),
			e(UI.Toggle, { Text = "Include descendants", Value = descendants, OnChange = setDescendants }),
		}),
		e(UI.Accordion, {Title="Framebridge cleanup", Items=cleanupItems, DefaultOpen=true}),
		section("Convert sizing", {
			e(UI.Choices, {
				Name = "GeometryScope",
				Options = {
					{ Value = "size", Label = "Size" },
					{ Value = "position", Label = "Position" },
					{ Value = "both", Label = "Both" },
				},
				Value = scope,
				OnChange = setScope,
				Disabled = state.busy,
			}),
			e(UI.Choices, {
				Name = "ConvertUnits",
				Options = {
					{ Value = "scale", Label = "Convert to scale" },
					{ Value = "offset", Label = "Convert to pixels" },
				},
				Disabled = disabled,
				OnChange = function(units)
					run("geometry", { units = units, scope = scope })
				end,
			}),
			note("Keeps the current geometry. Layout-controlled and automatic sizes are skipped."),
		}),
		e(UI.Accordion,{Title="Change instance type",Items=classItems}),
		e(UI.Accordion, {
			Title = "Constraints",
			DefaultOpen = true,
			Items = {
				button("Keep current aspect ratio", function()
					run("aspect")
				end, disabled),
				e(UI.Accordion, {
					Title = "Minimum and maximum size",
					Items = {
						e(UI.Vector, {
							Title = "Minimum size",
							Values = minimum,
							Labels = { "Width px", "Height px" },
							OnChange = setMinimum,
							Disabled = state.busy,
						}),
						e(UI.Vector, {
							Title = "Maximum size",
							Values = maximum,
							Labels = { "Width px", "Height px" },
							OnChange = setMaximum,
							Disabled = state.busy,
						}),
						button("Apply size limits", function()
							run("sizeLimits", {
								minimum = Vector2.new(minimum[1], minimum[2]),
								maximum = Vector2.new(maximum[1], maximum[2]),
							})
						end, disabled),
					},
				}),
				e(UI.Accordion, {
					Title = "Responsive text",
					Items = {
						e(UI.Vector, {
							Title = "Text size limits",
							Values = textLimits,
							Labels = { "Minimum px", "Maximum px" },
							OnChange = setTextLimits,
							Disabled = state.busy,
						}),
						button("Scale text with element", function()
							run("text", { minimum = textLimits[1], maximum = textLimits[2] })
						end, disabled),
						note("Enables TextScaled and adds or updates a UITextSizeConstraint."),
					},
				}),
			},
		}),
		e(UI.Accordion, {
			Title = "Anchor and fit",
			Items = {
				e(UI.Toggle, {
					Text = "Keep visual position",
					Value = keepPosition,
					OnChange = setKeepPosition,
					Disabled = state.busy,
				}),
				e(UI.Stack, { Items = anchorRows, Gap = 4 }),
				button("Fit element to parent", function()
					run("fill")
				end, disabled),
			},
		}),
	}
	table.insert(items, e(UI.Accordion, {
		Title = "World UI",
		Items = {
			note(world.available and (world.rootName.." · "..world.rootClass) or "Select a ScreenGui, SurfaceGui or BillboardGui, or one of its layers."),
			note("To bind or place UI on a surface, Ctrl/Cmd-select the UI and one Part or Attachment in Workspace."),
			note(world.targetName and ("World target: "..world.targetName) or "No world target selected."),
			button("Bind world target", function() actions.worldTool("bind") end, state.busy or not world.canBind or not world.targetName),
			e(UI.Accordion, {
				Title = "Screen / surface conversion",
				Items = {
					e(UI.Vector, {Title="Original canvas",Values=worldCanvas,Labels={"Width px","Height px"},OnChange=setWorldCanvas,Disabled=state.busy}),
					e(UI.Select, {Name="WorldFace",Options={{Value="Front",Label="Front"},{Value="Back",Label="Back"},{Value="Left",Label="Left"},{Value="Right",Label="Right"},{Value="Top",Label="Top"},{Value="Bottom",Label="Bottom"}},Value=worldFace,OnChange=setWorldFace,Disabled=state.busy}),
					button("ScreenGui to Part surface", function() actions.worldTool("surface",{canvas=worldCanvas,face=worldFace}) end, state.busy or not world.canSurface or not world.targetName),
					button("SurfaceGui to player screen", function() actions.worldTool("screen",{canvas=worldCanvas}) end, state.busy or not world.canScreen),
					note("Conversion replaces the root, preserves child instances and scripts, and supports Undo. Update any game references to the old root. Match Figma's Output location before reimporting."),
				},
			}),
		},
	}))
    table.insert(items,e(Documentation,{Topic="studio-tools"}))
	return e(UI.Stack, { Name = "SelectionTools", Items = items, Gap = 12 })
end
local function App(props)
	local C = UI.useTheme()
	local state, actions = props.State, props.Actions
	local tab, setTab = React.useState("Import")
	local workspaceRef, revealedConnection = React.useRef(nil), React.useRef(0)
	React.useEffect(function()
		if props.Tab then
			setTab(props.Tab)
		end
	end, { props.Tab, props.TabRevision })
	React.useEffect(function()
		local request = state.connectionOpen or 0
		local workspace = workspaceRef.current
		if tab ~= "Import" or request <= revealedConnection.current or not workspace then return end
		revealedConnection.current = request
		workspace.CanvasPosition = Vector2.new()
		local input = workspace:FindFirstChild("PairingCode", true) or workspace:FindFirstChild("BetaAccess", true)
		if input and not state.busy and not state.connecting then input:CaptureFocus() end
	end, { state.connectionOpen or 0, tab })
	local missing = actions.missing()
	local enabled = state.package ~= nil and not state.busy and (missing == 0 or state.placeholders)
	local status = state.status or "Open a package to get started."
	if tab == "Import" and state.package and missing > 0 and not state.placeholders and not state.failed then
		status = missing .. " images need links. Open Image links below."
	end
	return e(
		"Frame",
		{ Name = "Framebridge", Size = UDim2.fromScale(1, 1), BackgroundColor3 = C.bg, BorderSizePixel = 0 },
		{
			Header = e(
				"Frame",
				{ Name = "Header", Size = UDim2.new(1, 0, 0, 44), BackgroundColor3 = C.panel, BorderSizePixel = 0 },
				{
					Logo = e("ImageLabel", {
						Name = "FramebridgeLogo",
						Image = Brand.Image,
						ImageRectOffset = Brand.RectOffset,
						ImageRectSize = Brand.RectSize,
						BackgroundTransparency = 1,
						BorderSizePixel = 0,
						Position = UDim2.fromOffset(16, 12),
						Size = UDim2.fromOffset(20, 20),
						ScaleType = Enum.ScaleType.Fit,
					}),
					Brand = e(UI.Label, {
						Text = "Framebridge",
						TextSize = 15,
						Bold = true,
						Position = UDim2.fromOffset(44, 10),
						Size = UDim2.new(1, state.paired and -212 or -168, 0, 24),
					}),
					Connect = state.paired and e(Expiry, {Header=true,ExpiresAt=state.expiresAt,Disabled=state.busy or state.connecting,OnClick=actions.showConnection}) or e(UI.Button, {
						Name = "Connect",
						Text = state.paired and "Connected" or state.code and "Pairing code" or "Connect Figma",
						Color = state.paired and C.linked or C.text,
						Position = UDim2.new(1, -120, 0, 9),
						Size = UDim2.fromOffset(104, 26),
						Quiet = true,
						Regular = true,
						TextSize = 12,
						Disabled = state.busy or state.connecting,
						OnClick = actions.showConnection,
					}),
				}
			),
			Tabs = e(UI.Tabs, {Name="Tabs",Position=UDim2.fromOffset(0,44),Size=UDim2.new(1,0,0,36),
				Options={{Value="Import",Label="Import"},{Value="Tools",Label="UI tools"}},Value=tab,OnChange=function(value)
					setTab(value)
					if workspaceRef.current then workspaceRef.current.CanvasPosition=Vector2.new() end
				end}),
			Workspace = e("ScrollingFrame", {
				Name = "Workspace",
				ref = workspaceRef,
				Position = UDim2.fromOffset(0, 92),
				Size = UDim2.new(1, 0, 1, tab == "Import" and -192 or -156),
				BackgroundTransparency = 1,
				BorderSizePixel = 0,
				CanvasSize = UDim2.new(),
				AutomaticCanvasSize = Enum.AutomaticSize.Y,
				ScrollBarThickness = 5,
				ScrollBarImageColor3 = C.muted,
				ScrollingDirection = Enum.ScrollingDirection.Y,
			}, {
				Content = e("Frame", {
					Name = "Content",
					AnchorPoint = Vector2.new(0.5, 0),
					Position = UDim2.fromScale(0.5, 0),
					Size = UDim2.new(1, -32, 0, 0),
					AutomaticSize = Enum.AutomaticSize.Y,
					BackgroundTransparency = 1,
				}, {
					Limit = e("UISizeConstraint", { MaxSize = Vector2.new(560, 100000) }),
					Import = e("Frame", {
						Name = "ImportPanel",
						Visible = tab == "Import",
						Size = UDim2.new(1, 0, 0, 0),
						AutomaticSize = tab == "Import" and Enum.AutomaticSize.Y or Enum.AutomaticSize.None,
						BackgroundTransparency = 1,
					}, {
						Content = e(ImportOptions, { State = state, Actions = actions, Importer = props.Importer }),
					}),
					Tools = e("Frame", {
						Name = "ToolsPanel",
						Visible = tab == "Tools",
						Size = UDim2.new(1, 0, 0, 0),
						AutomaticSize = tab == "Tools" and Enum.AutomaticSize.Y or Enum.AutomaticSize.None,
						BackgroundTransparency = 1,
					}, {
						Content = e(SelectionPanel, { State = state, Actions = actions }),
					}),
				}),
			}),
			Footer = e("Frame", {
				Name = "Footer",
				Position = UDim2.new(0, 0, 1, tab == "Import" and -88 or -52),
				Size = UDim2.new(1, 0, 0, tab == "Import" and 88 or 52),
				BackgroundColor3 = C.panel,
				BorderSizePixel = 0,
			}, {
				Divider=e("Frame",{Size=UDim2.new(1,0,0,1),BackgroundColor3=C.line,BorderSizePixel=0}),
				Status = e(UI.Label, {
					Name = "Status",
					Text = status,
					Color = state.failed and C.warning or C.muted,
					Wrap = true,
					FixedHeight = true,
					Position = UDim2.fromOffset(16, 4),
					Size = UDim2.new(1, -32, 0, 36),
				}),
				Import = e(UI.Button, {
					Name = "ImportButton",
					Text = state.busy and "Importing…"
						or state.update and "Update in StarterGui"
						or "Import to StarterGui",
					Primary = true,
					Visible = tab == "Import",
					Disabled = not enabled,
					Position = UDim2.fromOffset(16, 44),
					Size = UDim2.new(1, -32, 0, 32),
					OnClick = actions.import,
				}),
			}),
		}
	)
end
function View.mount(widget, Importer, actions)
	local root = ReactRoblox.createRoot(widget)
	local state, tabRevision, requestedTab = nil, 0, nil
	local destroyed = false
	local api = {}
	local function render()
		if destroyed or not state then
			return
		end
		root:render(e(UI.ThemeProvider, nil, e(App, {
			State = table.clone(state),
			Actions = actions,
			Importer = Importer,
			Tab = requestedTab,
			TabRevision = tabRevision,
		})))
	end
	function api.render(nextState)
		state = nextState
		render()
	end
	function api.selectTab(name)
		assert(name == "Import" or name == "Tools", "Unknown plugin tab")
		requestedTab = name
		tabRevision += 1
		render()
	end
	function api.status()
		render()
	end
	function api.refreshImages()
		render()
	end
	function api.destroy()
		destroyed = true
		root:unmount()
	end
	return api
end

return View
