-- Data-only importer. No package content is ever evaluated as Luau.
local Importer = {}
local HttpService = game:GetService("HttpService")
local MAX_NODES, MAX_DEPTH = 15000, 128
local GUI = "Position Size AnchorPoint Rotation Visible BorderSizePixel BackgroundTransparency BackgroundColor3 LayoutOrder ZIndex ClipsDescendants AutomaticSize Active Selectable Interactable"
local TEXT = "Text FontFace TextSize TextColor3 TextTransparency TextXAlignment TextYAlignment TextWrapped TextScaled RichText AutoLocalize LineHeight"
local BUTTON = "AutoButtonColor Active Selectable"
local IMAGE = "Image ImageColor3 ImageTransparency ScaleType SliceCenter SliceScale TileSize"
local function set(words)
    local result = {}
    for word in string.gmatch(words, "%S+") do result[word] = true end
    return result
end
local PROPERTIES = {
    SurfaceGui = set("Enabled ResetOnSpawn ZIndexBehavior AlwaysOnTop LightInfluence MaxDistance Active ClipsDescendants Face CanvasSize SizingMode"),
    BillboardGui = set("Enabled ResetOnSpawn ZIndexBehavior AlwaysOnTop LightInfluence MaxDistance Active ClipsDescendants Size StudsOffsetWorldSpace"),
    ScreenGui = set("ResetOnSpawn IgnoreGuiInset ZIndexBehavior DisplayOrder Enabled"),
    ScrollingFrame = set(GUI .. " CanvasSize AutomaticCanvasSize ScrollingDirection ScrollingEnabled ScrollBarThickness ScrollBarImageColor3 ScrollBarImageTransparency TopImage MidImage BottomImage"),
    TextBox = set(GUI .. " " .. TEXT .. " PlaceholderText PlaceholderColor3 ClearTextOnFocus MultiLine TextEditable"),
    Frame = set(GUI), CanvasGroup = set(GUI .. " GroupTransparency"),
    ViewportFrame = set(GUI .. " Ambient LightColor LightDirection ImageColor3 ImageTransparency"),
    TextLabel = set(GUI .. " " .. TEXT), TextButton = set(GUI .. " " .. TEXT .. " " .. BUTTON),
    ImageLabel = set(GUI .. " " .. IMAGE), ImageButton = set(GUI .. " " .. IMAGE .. " " .. BUTTON),
    UICorner = set("CornerRadius TopLeftRadius TopRightRadius BottomRightRadius BottomLeftRadius"), UIStroke = set("Color Thickness Transparency ApplyStrokeMode BorderStrokePosition LineJoinMode StrokeSizingMode"),
    UIShadow = set("Enabled BlurRadius Offset Spread Color Transparency ZIndex"),
    UIGradient = set("Rotation Color Transparency"),
    UIAspectRatioConstraint = set("AspectRatio AspectType DominantAxis"),
    UISizeConstraint = set("MinSize MaxSize"), UITextSizeConstraint = set("MinTextSize MaxTextSize"), UIScale = set("Scale"),
    UIGridLayout = set("CellSize CellPadding FillDirection FillDirectionMaxCells StartCorner SortOrder HorizontalAlignment VerticalAlignment"),
    UIListLayout = set("FillDirection SortOrder Padding HorizontalAlignment VerticalAlignment HorizontalFlex VerticalFlex Wraps ItemLineAlignment"),
    UIFlexItem = set("FlexMode GrowRatio ShrinkRatio ItemLineAlignment"),
    UIPadding = set("PaddingTop PaddingBottom PaddingLeft PaddingRight"),
}
local ENUMS = set("NormalId SurfaceGuiSizingMode ZIndexBehavior TextXAlignment TextYAlignment ScaleType ApplyStrokeMode BorderStrokePosition LineJoinMode StrokeSizingMode FillDirection SortOrder HorizontalAlignment VerticalAlignment UIFlexAlignment AutomaticSize ScrollingDirection AspectType DominantAxis StartCorner UIFlexMode ItemLineAlignment")
local function check(condition, message) if not condition then error("Framebridge: " .. message, 0) end end
local function guiRoot(class) return class == "ScreenGui" or class == "SurfaceGui" or class == "BillboardGui" end
local function finite(n) return type(n) == "number" and n == n and math.abs(n) < 1000000000 end
local function assetId(value)
    if type(value) ~= "string" then return nil end
    local digits = string.match(value, "^rbxassetid://([1-9]%d*)$") or string.match(value, "^([1-9]%d*)$")
    if digits and #digits <= 20 then return "rbxassetid://" .. digits end
    return nil
end
Importer.assetId = assetId
local function numbers(values, length)
    check(type(values) == "table" and #values == length, "Invalid numeric value.")
    for _, value in ipairs(values) do check(finite(value), "Non-finite or oversized numeric value.") end
    return table.unpack(values)
end
local function decodeValue(value)
    local kind = type(value)
    if kind == "boolean" then return value end
    if kind == "number" then check(finite(value), "Invalid number."); return value end
    if kind == "string" then check(#value <= 1000000, "Text exceeds 1 MB."); return value end
    check(kind == "table", "Unsupported property value.")
    if value.type == "UDim2" then return UDim2.new(numbers(value.value,4)) end
    if value.type == "UDim" then return UDim.new(numbers(value.value,2)) end
    if value.type == "Vector2" then return Vector2.new(numbers(value.value,2)) end
    if value.type == "Vector3" then return Vector3.new(numbers(value.value,3)) end
    if value.type == "Rect" then
        local left, top, right, bottom = numbers(value.value,4)
        check(left >= 0 and top >= 0 and right >= left and bottom >= top, "Slice coordinates must be nonnegative and ordered.")
        return Rect.new(left,top,right,bottom)
    end
    if value.type == "Color3" then return Color3.new(numbers(value.value,3)) end
    if value.type == "Enum" then
        check(type(value.value) == "table" and ENUMS[value.value[1]], "Unsupported enum type.")
        local enumType = Enum[value.value[1]]
        local ok, enumValue = pcall(function() return enumType[value.value[2]] end)
        check(ok and enumValue ~= nil, "Unknown enum member.")
        return enumValue
    end
    if value.type == "Font" then
        check(type(value.family) == "string" and (assetId(value.family) or string.match(value.family,"^rbxasset://fonts/families/[%w_]+%.json$")), "Invalid font family.")
        local ok, result = pcall(function() return Font.new(value.family,Enum.FontWeight[value.weight],Enum.FontStyle[value.style]) end)
        check(ok, "Invalid font weight or style."); return result
    end
    if value.type == "ColorSequence" or value.type == "NumberSequence" then
        check(type(value.value) == "table" and #value.value >= 2 and #value.value <= 20, "Gradient requires 2–20 stops.")
        local result, previous = {}, -1
        for _, point in ipairs(value.value) do
            numbers(point, value.type == "ColorSequence" and 4 or 2)
            check(point[1] >= 0 and point[1] <= 1 and point[1] > previous, "Gradient stops must increase from 0 to 1.")
            previous = point[1]
            table.insert(result,value.type == "ColorSequence" and ColorSequenceKeypoint.new(point[1],Color3.new(point[2],point[3],point[4])) or NumberSequenceKeypoint.new(point[1],point[2]))
        end
        check(value.value[1][1] == 0 and previous == 1, "Gradient endpoints must be 0 and 1.")
        return value.type == "ColorSequence" and ColorSequence.new(result) or NumberSequence.new(result)
    end
    error("Framebridge: Unsupported value type.",0)
end
local function validateThemes(roots)
    local function fields(value,allowed)
        check(type(value)=="table","Invalid theme data.")
        for key in pairs(value) do check(allowed[key],"Unknown theme field.") end
    end
    local function name(value) return type(value)=="string" and #value>0 and #value<=64 and value:match("^[A-Za-z][A-Za-z0-9_.%-]*$")~=nil end
    local allowed=set("BackgroundColor3 BackgroundTransparency TextColor3 TextTransparency ImageColor3 ImageTransparency Color Transparency FontFace TextSize BlurRadius Offset Spread")
    local hoverAllowed=set("BackgroundColor3 BackgroundTransparency TextColor3 TextTransparency ImageColor3 ImageTransparency")
    local function validValue(property,value)
        decodeValue(value)
        if property=="FontFace" then check(type(value)=="table" and value.type=="Font","Invalid theme font.");fields(value,set("type family weight style"))
        elseif property=="TextSize" or property:find("Transparency") then
            check(type(value)=="number" and finite(value) and value>=(property=="TextSize" and 1 or 0) and value<=(property=="TextSize" and 100 or 1),"Invalid theme numeric value.")
        else
            local kind=(property=="Offset" or property=="Spread") and "UDim2" or property=="BlurRadius" and "UDim" or "Color3"
            check(type(value)=="table" and value.type==kind,"Invalid theme property type.");fields(value,set("type value"))
            if kind=="Color3" or kind=="UDim" then for _,number in ipairs(value.value) do check(number>=0 and number<=(kind=="Color3" and 1 or 1000),"Invalid theme value range.") end end
        end
    end
    for _,root in ipairs(roots) do
        local nodes,parents,byId={},{},{}
        local function visit(node,parent)
            table.insert(nodes,node);byId[node.id]=node;parents[node.id]=parent
            if parent then check(node.themes==nil,"Theme definitions belong on the UI root.") end
            for _,child in ipairs(node.children) do visit(child,node.id) end
        end
        visit(root,nil)
        local themes=root.themes
        if themes==nil then for _,node in ipairs(nodes) do check(node.theme==nil,"Theme bindings need root definitions.") end;continue end
        fields(themes,set("version initial modes"));check(themes.version==1 and name(themes.initial) and type(themes.modes)=="table","Invalid compiled themes.")
        check(#HttpService:JSONEncode(themes)<=60000,"Theme settings exceed 60 KB.")
        local modeCount,canonical,used=0,{},{}
        check(type(themes.modes[themes.initial])=="table","Invalid initial theme.")
        local tokenCount=0
        for id in pairs(themes.modes[themes.initial]) do check(name(id),"Invalid theme token name.");canonical[id]=true;tokenCount+=1 end
        check(tokenCount>=1 and tokenCount<=128,"Invalid theme token count.")
        for mode,tokens in pairs(themes.modes) do
            check(name(mode) and type(tokens)=="table","Invalid theme mode.");modeCount+=1
            local count=0
            for id,values in pairs(tokens) do check(canonical[id] and type(values)=="table","Compiled theme token sets differ.");count+=1;local fieldsCount=0;for key,v in pairs(values) do check(allowed[key],"Invalid theme token field.");validValue(key,v);fieldsCount+=1 end;check(fieldsCount>=1 and fieldsCount<=6,"Invalid theme token fields.") end
            check(count==tokenCount,"Compiled theme token sets differ.")
            for id,values in pairs(tokens) do
                local expected=themes.modes[themes.initial][id];local size=0;for key in pairs(expected) do size+=1;check(values[key]~=nil,"Compiled theme token fields differ.") end
                local actual=0;for _ in pairs(values) do actual+=1 end;check(actual==size,"Compiled theme token fields differ.")
            end
        end
        check(modeCount>=1 and modeCount<=8,"Invalid theme mode count.")
        for _,node in ipairs(nodes) do
            local value=node.theme
            if value~=nil then
                fields(value,set("base hover owner"));check(type(value.base)=="table" and (value.hover==nil or type(value.hover)=="table"),"Invalid theme binding.")
                local count=0
                for _,bindings in ipairs({value.base,value.hover or {}}) do
                    for property,ref in pairs(bindings) do
                        count+=1
                        check(allowed[property] and PROPERTIES[node.className][property] and node.properties[property]~=nil and type(ref)=="table" and #ref==2 and name(ref[1]) and name(ref[2]) and canonical[ref[1]],"Invalid theme property reference.")
                        local motion=node.behavior and node.behavior.motion
                        local tint=node.className:sub(1,4)=="Text" and "TextColor3" or node.className:sub(1,5)=="Image" and "ImageColor3" or "BackgroundColor3"
                        check(not (motion and motion.hover and motion.hover.tint and property==tint),"Theme color and motion hover tint conflict.")
                        if property:find("Transparency") then
                            check(not (property=="ImageTransparency" and motion and motion.drift),"Theme transparency and texture drift conflict.")
                            local ancestor=node
                            while ancestor and ancestor.className~="CanvasGroup" do
                                local effect=ancestor.behavior and ancestor.behavior.motion
                                check(not ((ancestor.behavior and ancestor.behavior.keyframes) or (effect and (effect.blink or effect.enter))),"Theme transparency and ancestor fade/blink motion conflict.")
                                ancestor=byId[parents[ancestor.id]]
                            end
                        end
                        for _,tokens in pairs(themes.modes) do validValue(property,tokens[ref[1]][ref[2]]) end
                        used[ref[1]]=true
                    end
                end
                check(count>0,"Empty theme binding.")
                if value.hover then
                    for property in pairs(value.hover) do check(hoverAllowed[property],"Invalid hover theme property.") end
                    local owner=node.id
                    while owner and owner~=value.owner do owner=parents[owner] end
                    check(owner and byId[owner] and (byId[owner].className=="TextButton" or byId[owner].className=="ImageButton"),"Theme hover owner must be this button or an ancestor.")
                else check(value.owner==nil,"Theme owner needs hover bindings.") end
            end
        end
        for id in pairs(canonical) do check(used[id],"Unused theme tokens must not be transferred.") end
        check(not byId[root.id.."/behavior-runtime"] and not byId[root.id.."/behavior-runtime/module"],"Reserved interaction runtime identity.")
    end
end

-- Shared bounded rule validation; kept identical to CONDITIONAL_VALIDATOR.
local ConditionalRules = (function()
local Rules = {}
local function fields(v, names)
    if type(v)~="table" then return false end
    for key in pairs(v) do if not names[key] then return false end end
    return true
end
local function set(words) local out={};for word in words:gmatch("%S+") do out[word]=true end;return out end
local function list(v,limit)
    if type(v)~="table" or #v<1 or #v>limit then return false end
    local count=0;for key in pairs(v) do if type(key)~="number" or key%1~=0 or key<1 or key>#v then return false end;count+=1 end
    return count==#v
end
local function scalar(v) return type(v)=="boolean" or (type(v)=="string" and #v<=4096) or (type(v)=="number" and v==v and math.abs(v)<1e9) end
local function identity(v) return type(v)=="string" and #v>0 and #v<=256 and v:find("%S")~=nil end
function Rules.validPredicate(p)
    if not fields(p,set("source key operator value")) or not set("attribute leaderstats viewport")[p.source] or type(p.key)~="string" or #p.key>128 or not p.key:match("^[%a_][%w_-]*$") then return false end
    if p.source=="viewport" and p.key~="width" and p.key~="height" then return false end
    if p.operator=="exists" or p.operator=="missing" then return p.value==nil end
    if not set("eq ne lt lte gt gte")[p.operator] or not scalar(p.value) then return false end
    if p.source=="viewport" and type(p.value)~="number" then return false end
    return p.operator=="eq" or p.operator=="ne" or type(p.value)=="number"
end
function Rules.validAction(a)
    if not fields(a,set("target property value")) or not identity(a.target) then return false end
    local p=a.property
    if p=="Visible" or p=="Interactable" then return type(a.value)=="boolean" end
    if p=="Text" then return type(a.value)=="string" and #a.value<=4096 end
    if set("BackgroundTransparency TextTransparency ImageTransparency")[p] then return type(a.value)=="number" and a.value==a.value and a.value>=0 and a.value<=1 end
    if not set("BackgroundColor3 TextColor3 ImageColor3")[p] then return false end
    local v=a.value
    if not fields(v,set("type value")) or v.type~="Color3" or not list(v.value,3) or #v.value~=3 then return false end
    for _,n in ipairs(v.value) do if type(n)~="number" or n~=n or n<0 or n>1 then return false end end
    return true
end
function Rules.valid(rules)
    if not list(rules,8) then return false end
    local ids={}
    local function actions(items)
        if not list(items,8) then return false end
        local seen={}
        for _,a in ipairs(items) do
            if not Rules.validAction(a) then return false end
            local key=a.target.."/"..a.property;if seen[key] then return false end;seen[key]=true
        end
        return true
    end
    for _,r in ipairs(rules) do
        if not fields(r,set("id branches else")) or type(r.id)~="string" or #r.id>64 or not r.id:match("^[%a_][%w_-]*$") or ids[r.id] or not list(r.branches,8) then return false end
        ids[r.id]=true
        for _,b in ipairs(r.branches) do
            if not fields(b,set("when then")) or not fields(b.when,set("mode predicates")) or (b.when.mode~="all" and b.when.mode~="any") or not list(b.when.predicates,8) or not actions(b["then"]) then return false end
            for _,p in ipairs(b.when.predicates) do if not Rules.validPredicate(p) then return false end end
        end
        if r["else"]~=nil and not actions(r["else"]) then return false end
    end
    local ok,encoded=pcall(function() return game:GetService("HttpService"):JSONEncode(rules) end)
    return ok and #encoded<=12288
end
function Rules.actions(r)
    local out={};for _,b in ipairs(r.branches) do for _,a in ipairs(b["then"]) do table.insert(out,a) end end
    for _,a in ipairs(r["else"] or {}) do table.insert(out,a) end;return out
end
function Rules.compatible(class,p)
    if class:match("^UI") or set("ScreenGui SurfaceGui BillboardGui")[class] then return false end
    if p=="Interactable" then return class=="TextButton" or class=="ImageButton" end
    if p:match("^Text") then return set("TextLabel TextButton TextBox")[class]==true end
    if p:match("^Image") then return set("ImageLabel ImageButton ViewportFrame")[class]==true end
    return true
end
function Rules.validate(nodes)
    local byId,owned,parents,tabTargets,tooltipTargets,count={},{},{},{},{},0
    for _,n in ipairs(nodes) do
        byId[n.id]=n;for _,child in ipairs(n.children or {}) do if child.id then parents[child.id]=n end end
        local action=n.behavior and n.behavior.action;if action and action.kind=="tab" then tabTargets[action.target]=true end
        local control=n.behavior and n.behavior.control;if control and control.kind=="tooltip" then tooltipTargets[control.target]=true end
    end
    for _,n in ipairs(nodes) do
        local rules=n.behavior and n.behavior.rules
        if rules~=nil then
            assert(Rules.valid(rules),"Invalid conditional rules.");count+=#rules;assert(count<=32,"Screen rule limit exceeded.")
            for _,r in ipairs(rules) do for _,a in ipairs(Rules.actions(r)) do
                local target=byId[a.target]
                assert(target and Rules.compatible(target.className,a.property) and not target.maskBasis and not target.decorationRect and target.sourceType~="MOTION_SLOT","Conditional actions need compatible targets in the same screen.")
                local b=target.behavior or {}
                assert(not (target.theme and (target.theme.base[a.property] or (target.theme.hover and target.theme.hover[a.property]))),"Conditional action conflicts with a theme property owner.")
                if a.property:match("Color3$") then for _,child in ipairs(target.children or {}) do assert(child.className~="UIGradient","Conditional color requires a flat fill.") end end
                if a.property:match("Transparency$") then
                    local ancestor=target
                    while ancestor and ancestor.className~="CanvasGroup" do local behavior=ancestor.behavior or {};local motion=behavior.motion;assert(not (behavior.keyframes or (motion and (motion.enter or motion.blink))),"Conditional transparency conflicts with an animated fade owner.");ancestor=parents[ancestor.id] end
                end
                assert(not ((a.property=="Visible" and (b.state or b.role=="tabGroup" or tooltipTargets[target.id] or (b.role=="panel" and tabTargets[target.id]))) or (a.property=="Text" and b.binding) or (a.property:match("Color3$") and b.motion and b.motion.hover and b.motion.hover.tint)),"Conditional property ownership conflict.")
                local key=a.target.."/"..a.property;assert(not owned[key] or owned[key]==r,"Only one conditional rule may own each target property.");owned[key]=r
            end end
        end
    end
end
function Rules.test(p,data)
    local source=data[p.source];local v=source and source[p.key];local exists=scalar(v)
    if p.operator=="exists" then return exists end;if p.operator=="missing" then return not exists end
    if not exists or type(v)~=type(p.value) then return false end
    if p.operator=="eq" then return v==p.value end;if p.operator=="ne" then return v~=p.value end
    if type(v)~="number" then return false end
    if p.operator=="lt" then return v<p.value end;if p.operator=="lte" then return v<=p.value end;if p.operator=="gt" then return v>p.value end;return v>=p.value
end
function Rules.evaluate(r,data)
    for index,b in ipairs(r.branches) do
        local pass=b.when.mode=="all"
        for _,p in ipairs(b.when.predicates) do local result=Rules.test(p,data);if b.when.mode=="all" then pass=pass and result else pass=pass or result end end
        if pass then return b["then"],index end
    end
    return r["else"] or {},0
end
return Rules
end)()
local function validateBehaviors(roots)
    local function fields(value, allowed)
        if type(value) ~= "table" then return false end
        for key in pairs(value) do if not allowed[key] then return false end end
        return true
    end
    local function identity(value) return type(value) == "string" and #value > 0 and #value <= 256 end
    local function particlesValid(p)
        if not fields(p,set("version kind engine trigger enabled count rate capacity lifetime speed size rotationSpeed direction spread acceleration drag colors texture shape clip respectReducedMotion seed dependency owner")) then return false end
        local function range(v,lo,hi) return type(v)=="number" and v==v and v>=lo and v<=hi end
        local function integer(v,lo,hi)return range(v,lo,hi) and v%1==0 end
        local function vector(v,size,lo,hi)
            if type(v)~="table" or #v~=size then return false end
            for key,value in pairs(v) do if type(key)~="number" or key%1~=0 or key<1 or key>size or not range(value,lo,hi) then return false end end
            return true
        end
        local function pair(v,lo,hi) return vector(v,2,lo,hi) and v[1]<=v[2] end
        if not (p.version==1 and set("confetti emitter2d")[p.kind] and set("framebridge-v1 dogwarrior24-template-v1")[p.engine] and set("manual mount activate")[p.trigger] and type(p.enabled)=="boolean" and integer(p.capacity,1,128) and integer(p.count,1,p.capacity) and range(p.rate,0,32) and pair(p.lifetime,.05,5) and pair(p.speed,0,1000) and pair(p.size,1,64) and pair(p.rotationSpeed,-720,720) and range(p.direction,-360,360) and range(p.spread,0,360) and vector(p.acceleration,2,-1000,1000) and range(p.drag,0,20) and type(p.colors)=="table" and #p.colors>=1 and #p.colors<=8 and type(p.texture)=="string" and (p.texture=="" or assetId(p.texture)==p.texture) and set("point rectangle")[p.shape] and type(p.clip)=="boolean" and type(p.respectReducedMotion)=="boolean" and integer(p.seed,0,2147483647) and (p.owner==nil or identity(p.owner))) then return false end
        for key,color in pairs(p.colors) do if type(key)~="number" or key%1~=0 or key<1 or key>#p.colors or not vector(color,3,0,1) then return false end end
        if p.engine=="framebridge-v1" then return p.dependency==nil end
        local d=p.dependency
        local function label(v)return type(v)=="string" and #v>=1 and #v<=64 and v:match("^[A-Za-z0-9_.%-]+$") end
        return p.kind=="emitter2d" and p.texture~="" and p.acceleration[1]==0 and p.acceleration[2]==0 and p.drag==0 and fields(d,set("template configVersion clientRevision")) and type(d.template)=="string" and #d.template>=1 and #d.template<=64 and d.template:match("^[A-Za-z][A-Za-z0-9_%-]*$") and label(d.configVersion) and label(d.clientRevision)
    end
    local function button(node) return node and (node.className == "TextButton" or node.className == "ImageButton") end
    local function motionValid(m)
        if not fields(m,set("input owner slot hover press float spin pulse blink enter shine magnet drift sounds")) then return false end
        if m.input ~= nil and m.input ~= "auto" and m.input ~= "parent" then return false end
        if (m.owner ~= nil and not identity(m.owner)) or (m.slot ~= nil and not identity(m.slot)) then return false end
        local ranges = {
            hover={scale={0.5,2},rotation={-90,90},lift={-200,200},duration={0,5}},
            press={scale={0.5,2},duration={0,5}},
            float={distance={0,500},period={0.1,60},direction={-360,360}},
            spin={speed={-1440,1440}}, pulse={scale={0.5,2},period={0.1,60}},
            blink={visible={0.1,60},hidden={0.1,60},fade={0,10},delay={0,60}},
            enter={duration={0,10},delay={0,60},distance={0,500},direction={-360,360}},
            shine={period={0.1,60},width={0.01,0.8},opacity={0,1},direction={-360,360}},
            magnet={radius={1,1000},pull={0,200},duration={0,5}},
            drift={speed={-500,500},direction={-360,360}}, sounds={volume={0,1}},
        }
        local function finite(value,lo,hi) return type(value)=="number" and value==value and value>=lo and value<=hi end
        local function rgb(value)
            if type(value)~="table" or #value~=3 then return false end
            for key,v in pairs(value) do if type(key)~="number" or key%1~=0 or key<1 or key>3 or not finite(v,0,1) then return false end end
            return true
        end
        local used=false
        for kind,bounds in pairs(ranges) do
            local setting=m[kind]
            if setting~=nil then
                used=true
                local allowed={}
                for key in pairs(bounds) do allowed[key]=true end
                if kind=="hover" then allowed.tint=true
                elseif kind=="shine" then allowed.color=true; allowed.trigger=true
                elseif kind=="enter" then allowed.kind=true
                elseif kind=="sounds" then allowed.hover=true; allowed.press=true end
                if not fields(setting,allowed) then return false end
                for key,bound in pairs(bounds) do if not finite(setting[key],bound[1],bound[2]) then return false end end
                if kind=="hover" and setting.tint~=nil and not rgb(setting.tint) then return false end
                if kind=="shine" and (not rgb(setting.color) or (setting.trigger~="loop" and setting.trigger~="hover")) then return false end
                if kind=="enter" and not set("fade slide pop")[setting.kind] then return false end
                if kind=="sounds" then
                    for _,key in ipairs({"hover","press"}) do
                        if setting[key]~=nil then
                            if type(setting[key])~="string" then return false end
                            local id=setting[key]:gsub("^rbxassetid://", "")
                            if #id>20 or not id:match("^[1-9]%d*$") then return false end
                        end
                    end
                end
                if kind=="blink" and (setting.visible+setting.hidden<1/3 or setting.fade>math.min(setting.visible,setting.hidden)) then return false end
            end
        end
        return used
    end
    local function controlValid(c)
        if type(c)~="table" then return false end
        local function finite(v,lo,hi) return type(v)=="number" and v==v and v>=lo and v<=hi end
        if c.data~=nil then
            local d=c.data
            if not fields(d,set("source key")) or (d.source~="attribute" and d.source~="leaderstats") or type(d.key)~="string" or #d.key>128 or not d.key:match("^[%a_][%w_-]*$") then return false end
        end
        local function array(v,lo,hi,predicate)
            if type(v)~="table" or #v<lo or #v>hi then return false end
            for k,item in pairs(v) do if type(k)~="number" or k%1~=0 or k<1 or k>#v or not predicate(item) then return false end end
            return true
        end
        if c.kind=="progress" or c.kind=="slider" then
            if not fields(c,set(c.kind=="slider" and "kind min max value step axis fill thumb data" or "kind min max value axis fill data")) or not finite(c.min,-1e9,1e9) or not finite(c.max,-1e9,1e9) or c.max<=c.min or not finite(c.value,c.min,c.max) or (c.axis~="X" and c.axis~="Y") then return false end
            if c.kind=="progress" then return identity(c.fill) end
            return finite(c.step,.000001,c.max-c.min) and (c.fill==nil or identity(c.fill)) and (c.thumb==nil or identity(c.thumb))
        elseif c.kind=="toggle" then return fields(c,set("kind value data")) and type(c.value)=="boolean"
        elseif c.kind=="cooldown" then return fields(c,set("kind duration fill")) and finite(c.duration,.05,3600) and (c.fill==nil or identity(c.fill))
        elseif c.kind=="tooltip" then return fields(c,set("kind target delay")) and identity(c.target) and finite(c.delay,0,5)
        elseif c.kind=="window" then return fields(c,set("kind handle constrain")) and type(c.constrain)=="boolean" and (c.handle==nil or identity(c.handle))
        elseif c.kind=="skill" then
            local used={}
            return fields(c,set("kind requires unlocked data")) and type(c.unlocked)=="boolean" and array(c.requires,0,16,function(id) if not identity(id) or used[id] then return false end;used[id]=true;return true end)
        elseif c.kind=="roulette" then return fields(c,set("kind items duration")) and finite(c.duration,.1,30) and array(c.items,2,64,function(item) return type(item)=="string" and #item>0 and #item<=128 and item:find("%S")~=nil end)
        end
        return false
    end
    local function validateControls(nodes,byId,parents)
        local used,visiting,visited={},{},{}
        local function descendant(child,ancestor)
            local p=parents[child.id]
            while p do if p==ancestor then return true end;p=parents[p.id] end
            return false
        end
        local function layout(node)
            if not node then return false end
            for _,n in ipairs(node.children) do if n.className=="UIListLayout" or n.className=="UIGridLayout" then return true end end
            return false
        end
        for _,node in ipairs(nodes) do
            local c=node.behavior and node.behavior.control
            if c~=nil then
                check(controlValid(c),"Invalid advanced control settings.")
                check(not set("toggle slider cooldown tooltip skill roulette")[c.kind] or button(node),"This control needs a button.")
                check(not node.behavior.keyframes and not node.behavior.state and not node.behavior.motion and (not node.behavior.action or c.kind=="cooldown"),"Controls cannot share state/motion/actions, except cooldown actions.")
                if c.kind=="slider" then local automatic=node.properties.AutomaticSize;check(not automatic or automatic.value[2]=="None","Slider tracks cannot use automatic size.") end
                local refs={}
                if c.kind=="skill" then refs=c.requires
                elseif c.kind=="tooltip" then refs={c.target}
                elseif c.kind=="window" then if c.handle then refs={c.handle} end
                else if c.fill then table.insert(refs,c.fill) end;if c.thumb then table.insert(refs,c.thumb) end end
                for _,id in ipairs(refs) do
                    local target=byId[id]
                    check(target and not guiRoot(target.className) and not target.className:match("^UI"),"Control target must be GUI content in the same screen.")
                    if c.kind=="skill" then check(id~=node.id and target.behavior and target.behavior.control and target.behavior.control.kind=="skill","Skill prerequisites must be other skill controls.")
                    elseif c.kind=="tooltip" then
                        check(target.behavior and target.behavior.role=="panel" and not descendant(node,target) and not target.behavior.keyframes and not target.behavior.motion and not target.behavior.control and not target.behavior.state and not (parents[id] and parents[id].behavior and parents[id].behavior.role=="tabGroup"),"Tooltip needs a separate panel without other visibility owners.")
                        for _,other in ipairs(nodes) do check(not (other.behavior and other.behavior.action and other.behavior.action.target==id),"Tooltip panel cannot also be an action target.") end
                    else
                        check(descendant(target,node) and not target.behavior,"Control artwork/handles must be descendants without interactions.")
                        if c.kind~="window" then
                            local automatic=target.properties.AutomaticSize
                            check(parents[id]==node and not layout(node) and (not automatic or automatic.value[2]=="None"),"Fill/thumb need direct children without layout or automatic size.")
                            for _,helper in ipairs(target.children) do check(not set("UIAspectRatioConstraint UISizeConstraint UIFlexItem")[helper.className],"Fill/thumb cannot have size constraints or flex ownership.") end
                        end
                    end
                    if c.kind~="skill" then check(not used[id],"Control target already has an owner.");used[id]=true end
                end
                if c.kind=="window" then
                    check(not layout(parents[node.id]),"Draggable windows cannot belong to native list/grid layouts.")
                    local ancestor=node
                    while ancestor do check(not ancestor.properties.Rotation or ancestor.properties.Rotation==0,"Draggable windows need unrotated ancestors.");ancestor=parents[ancestor.id] end
                end
            end
        end
        local function visit(id)
            check(not visiting[id],"Skill prerequisites contain a cycle.")
            if visited[id] then return end
            visiting[id]=true
            local c=byId[id].behavior and byId[id].behavior.control
            if c and c.kind=="skill" then for _,other in ipairs(c.requires) do visit(other) end end
            visiting[id]=nil;visited[id]=true
        end
        for _,node in ipairs(nodes) do if node.behavior and node.behavior.control and node.behavior.control.kind=="skill" then visit(node.id) end end
    end
    local function validateKeyframes(nodes,byId,parents)
        local count=0
        local function finite(v,lo,hi) return type(v)=="number" and v==v and v>=lo and v<=hi end
        local function related(child,ancestor) local p=child;while p do if p==ancestor then return true end;p=parents[p.id] end;return false end
        for _,node in ipairs(nodes) do
            local k=node.behavior and node.behavior.keyframes
            if k~=nil then
                count+=1;check(count<=256,"Use at most 256 keyframe chains in one screen.")
                check(fields(k,set("trigger input attribute interruption finish repeats yoyo frames owner slot")),"Invalid keyframe settings.")
                check(set("mount visible activate hover pressed selected attribute")[k.trigger] and (k.input==nil or k.input=="auto" or k.input=="parent") and set("restart ignore")[k.interruption] and set("hold restore")[k.finish] and finite(k.repeats,0,20) and k.repeats%1==0 and type(k.yoyo)=="boolean","Invalid keyframe trigger/playback settings.")
                if k.trigger=="attribute" then check(type(k.attribute)=="string" and #k.attribute<=128 and k.attribute:match("^[%a_][%w_-]*$"),"Invalid keyframe attribute trigger.") else check(k.attribute==nil,"Only attribute triggers accept a key.") end
                check(type(k.frames)=="table" and #k.frames>=2 and #k.frames<=32,"Use 2 to 32 keyframes.")
                for index in pairs(k.frames) do check(type(index)=="number" and index%1==0 and index>=1 and index<=#k.frames,"Invalid keyframe array.") end
                local last=-1;local spatial=false
                for _,f in ipairs(k.frames) do
                    check(fields(f,set("time easing direction x y scale rotation opacity")) and finite(f.time,0,120) and (last<0 and f.time==0 or last>=0 and f.time-last>=.00999999) and set("linear quad cubic sine back")[f.easing] and set("in out inOut")[f.direction] and finite(f.x,-2000,2000) and finite(f.y,-2000,2000) and finite(f.scale,.1,4) and finite(f.rotation,-3600,3600) and finite(f.opacity,0,4),"Invalid keyframe pose, timing or easing.")
                    last=f.time;spatial=spatial or f.x~=0 or f.y~=0 or f.scale~=1 or f.rotation~=0
                end
                check(not node.behavior.motion and not node.behavior.control and not node.behavior.state,"Keyframes cannot share motion, control or state writers.")
                for _,other in ipairs(nodes) do if other~=node and (related(other,node) or related(node,other)) then check(not (other.behavior and (other.behavior.motion or other.behavior.keyframes)),"Nested keyframes/motion share opacity writers.") end end
                if set("activate hover pressed selected")[k.trigger] then
                    local owner=(k.input~="parent" and button(node)) and node or parents[node.id]
                    while owner and not button(owner) do owner=parents[owner.id] end
                    check(owner and owner.id==k.owner,"Keyframe input needs this button or its nearest ancestor button.")
                else check(k.owner==nil,"This trigger cannot reference a button.") end
                if spatial then
                    local slot=parents[node.id]
                    check(slot and slot.id==node.id.."/motion-slot" and k.slot==slot.id and slot.className=="Frame","Spatial keyframes need their generated layout slot.")
                    local guiCount=0;for _,child in ipairs(slot.children) do if not child.className:match("^UI") then guiCount+=1 end end;check(guiCount==1,"A keyframe slot can only hold one GUI element.")
                else check(k.slot==nil,"Opacity-only keyframes cannot reference a slot.") end
            end
        end
    end
    local function logicalParent(node,parents)
        local p=parents[node.id]
        if p and node.behavior and ((node.behavior.motion and node.behavior.motion.slot) or (node.behavior.keyframes and node.behavior.keyframes.slot))==p.id then return parents[p.id] end
        return p
    end
    for _, root in ipairs(roots) do
        local byId, parents, nodes, owned = {}, {}, {}, {}
        local function visit(node,parent)
            byId[node.id] = node; parents[node.id] = parent; table.insert(nodes,node)
            for _, child in ipairs(node.children) do visit(child,node) end
        end
        visit(root,nil)
        validateKeyframes(nodes,byId,parents)
        validateControls(nodes,byId,parents)
        ConditionalRules.validate(nodes)
        local particleCount=0
        for _, node in ipairs(nodes) do
            local b = node.behavior
            if b ~= nil then
                check(fields(b,set("role action state binding motion control rules ruleDesign keyframes particles")) and not guiRoot(node.className) and not node.className:match("^UI"), "Invalid interaction data.")
                if b.particles~=nil then
                    local p=b.particles;particleCount+=1
                    check(particlesValid(p) and node.properties.Size~=nil and particleCount<=16,"Invalid or excessive particle settings.")
                    check(p.engine~="dogwarrior24-template-v1" or (root.className~="SurfaceGui" and root.className~="BillboardGui"),"Installed Emitter2D supports ScreenGui only; choose the built-in engine for world UI.")
                    if p.trigger=="activate" then local owner=node;while owner and not button(owner) do owner=parents[owner.id] end;check(owner and owner.id==p.owner,"Particles must activate through this button or nearest ancestor.")
                    else check(p.owner==nil,"Only activated particles reference a button owner.") end
                end
                check(#HttpService:JSONEncode(b)<=16384,"Interaction data exceeds 16 KB.")
                check(b.ruleDesign==nil or (type(b.ruleDesign)=="string" and #b.ruleDesign==16 and b.ruleDesign:match("^[a-f0-9]+$")),"Invalid conditional design marker.")
                check(b.role == nil or b.role == "panel" or b.role == "tabGroup", "Invalid interaction role.")
                if b.action ~= nil then
                    local a = b.action
                    check(fields(a,set("kind target")) and set("open close toggle tab")[a.kind] and identity(a.target) and button(node), "Invalid UI action.")
                    local target = byId[a.target]
                    check(target and target.behavior and target.behavior.role == "panel", "Action targets must be panels in the same screen.")
                    if a.kind == "tab" then
                        local parent = logicalParent(target,parents)
                        check(parent and parent.behavior and parent.behavior.role == "tabGroup", "Tab target needs a tab group.")
                    end
                end
                if b.state ~= nil then
                    local s = b.state
                    check(fields(s,set("kind owner")) and set("default hover pressed disabled selected")[s.kind] and identity(s.owner) and not button(node), "Invalid state visual.")
                    local parent = parents[node.id]
                    while parent and not button(parent) do parent = parents[parent.id] end
                    check(parent and parent.id == s.owner, "State visual needs its nearest ancestor button.")
                    local key = s.owner .. "/" .. s.kind
                    check(not owned[key], "Use one visual per button state."); owned[key] = true
                end
                if b.binding ~= nil then
                    local binding = b.binding
                    check(fields(binding,set("source key template")) and (binding.source == "attribute" or binding.source == "leaderstats") and type(binding.key) == "string" and #binding.key <= 128 and binding.key:match("^[%a_][%w_-]*$") and type(binding.template) == "string" and #binding.template <= 4096 and binding.template:find("{value}",1,true) and (node.className == "TextLabel" or node.className == "TextButton"), "Invalid live-text binding.")
                end
                if b.motion ~= nil then
                    local m=b.motion
                    check(motionValid(m), "Invalid motion settings.")
                    local input=m.hover or m.press or m.magnet or (m.shine and m.shine.trigger=="hover") or (m.sounds and (m.sounds.hover or m.sounds.press))
                    if input then
                        local owner=(m.input~="parent" and button(node)) and node or parents[node.id]
                        while owner and not button(owner) do owner=parents[owner.id] end
                        check(owner and owner.id==m.owner, "Motion input needs this button or its nearest ancestor button.")
                    else check(m.owner==nil,"Idle motion cannot reference an input owner.") end
                    local spatial=m.hover or m.press or m.float or m.spin or m.pulse or m.magnet or (m.enter and m.enter.kind~="fade")
                    if spatial then
                        local slot=parents[node.id]
                        check(slot and slot.id==node.id.."/motion-slot" and slot.id==m.slot and slot.className=="Frame", "Motion needs its generated layout slot.")
                        local guiCount=0
                        for _,child in ipairs(slot.children) do if not guiRoot(child.className) and not child.className:match("^UI") then guiCount+=1 end end
                        check(guiCount==1,"A motion slot can only hold one GUI element.")
                    else check(m.slot==nil,"Non-spatial motion cannot reference a layout slot.") end
                    if m.drift then
                        local fit=node.properties.ScaleType
                        check((node.className=="ImageLabel" or node.className=="ImageButton") and type(fit)=="table" and fit.type=="Enum" and fit.value[2]=="Tile", "Texture drift needs a tiled image.")
                    end
                end
            end
        end
    end
end
local function validateWorld(root)
    local world=root.worldUI
    if root.className=="ScreenGui" then check(world==nil,"ScreenGui cannot carry world settings"); return end
    check(type(world)=="table" and (world.kind=="surface" or world.kind=="billboard" or world.kind=="prompt"),"Invalid world UI kind")
    local allowed=set("kind alwaysOnTop lightInfluence maxDistance")
    if world.kind=="surface" then allowed.face=true else allowed.widthStuds=true; allowed.offset=true; if world.kind=="prompt" then allowed.prompt=true end end
    for key in pairs(world) do check(allowed[key],"Unsupported world UI setting") end
    local function bounded(value,low,high) return finite(value) and value>=low and value<=high end
    check(type(world.alwaysOnTop)=="boolean" and bounded(world.lightInfluence,0,1) and bounded(world.maxDistance,0,10000),"Invalid world visibility settings")
    check(root.className==(world.kind=="surface" and "SurfaceGui" or "BillboardGui"),"World root class and settings must agree")
    local canvas=root.referenceSize
    check(type(canvas)=="table" and #canvas==2 and bounded(canvas[1],1,100000) and bounded(canvas[2],1,100000),"Invalid authored world canvas")
    check(#root.children==1 and root.children[1].className=="Frame" and root.children[1].id==root.id.."/world-canvas","Missing world canvas wrapper")
    if world.kind=="surface" then check(set("Front Back Left Right Top Bottom")[world.face],"Invalid surface face")
    else
        check(bounded(world.widthStuds,0.01,1000),"Invalid billboard width")
        numbers(world.offset,3);for _,v in ipairs(world.offset) do check(bounded(v,-1000,1000),"Invalid world offset") end
    end
    local byId,parents={},{}
    local function visit(node,parent)
        byId[node.id]=node
        parents[node.id]=parent
        check(world.kind~="surface" or node.className~="CanvasGroup","SurfaceGui cannot render CanvasGroup")
        for _,child in ipairs(node.children) do visit(child,node) end
    end
    visit(root)
    check(not byId[root.id.."/world-target"] and not byId[root.id.."/world-prompt"],"Reserved world helper identity")
    if world.kind=="prompt" then
        local prompt=world.prompt
        check(type(prompt)=="table","Invalid prompt configuration")
        for key in pairs(prompt) do check(set("actionText objectText keyboardKey gamepadKey holdDuration activationDistance requiresLineOfSight clickable labels")[key],"Invalid prompt setting") end
        for _,key in ipairs({"actionText","objectText"}) do check(type(prompt[key])=="string" and #prompt[key]<=800,"Invalid prompt text") end
        check(set("E F Q R T")[prompt.keyboardKey] and set("ButtonX ButtonY ButtonA ButtonB")[prompt.gamepadKey],"Invalid prompt input")
        check(bounded(prompt.holdDuration,0,60) and bounded(prompt.activationDistance,0.1,1000) and type(prompt.requiresLineOfSight)=="boolean" and type(prompt.clickable)=="boolean","Invalid prompt parameters")
        if prompt.labels then
            check(type(prompt.labels)=="table","Invalid prompt labels")
            local used={}
            for role,id in pairs(prompt.labels) do
                check(set("action object input hold")[role] and type(id)=="string" and #id<=256 and not used[id],"Invalid prompt role")
                used[id]=true
                local node=byId[id]
                check(node and node~=root and (role=="hold" and set("Frame ImageLabel")[node.className] or role~="hold" and set("TextLabel TextButton TextBox")[node.className]),"Prompt role needs a compatible layer")
                if role=="hold" then
                    check(id~=root.id.."/world-canvas" and not (node.behavior and (node.behavior.motion or node.behavior.keyframes)),"Hold progress cannot have motion or keyframes or use the world canvas")
                    local auto=node.properties.AutomaticSize;check(not auto or auto.value[2]=="None","Hold progress cannot use AutomaticSize")
                    for _,child in ipairs(node.children) do check(not set("UIAspectRatioConstraint UISizeConstraint")[child.className],"Hold progress cannot have size constraints") end
                    for _,child in ipairs(parents[id] and parents[id].children or {}) do check(not set("UIListLayout UIGridLayout UITableLayout UIPageLayout")[child.className],"Hold progress cannot be controlled by a layout") end
                end
            end
        end
    end
end
local function validateDecorationAsset(asset)
    check(asset.renderMode==nil or set("fills shadow blend")[asset.renderMode],"Invalid decoration rendering mode.")
    if asset.renderMode=="blend" then
        numbers(asset.backdrop,3)
        for _,v in ipairs(asset.backdrop) do check(v>=0 and v<=1,"Invalid frozen paint backdrop.") end
    else check(asset.backdrop==nil,"Invalid frozen paint backdrop.") end
    if asset.renderMode then
        if asset.processing ~= nil then
            check(type(asset.processing)=="table","Invalid independent decoration preparation.")
            for key,value in pairs(asset.processing) do
                check((key=="whiteMask" or key=="edgeCleanup") and type(value)=="boolean","Invalid independent decoration preparation.")
            end
            check(not asset.processing.whiteMask,"Independent decoration cannot use a white mask.")
        end
        check(not asset.scrollbarSlice,"Invalid independent decoration preparation.")
        if asset.pixelSize then numbers(asset.pixelSize,2);check(asset.pixelSize[1]*asset.pixelSize[2]<=4194304,"Decoration exceeds 4 million pixels.") end
    end
end
-- Keep this bounded data validator in parity with text-decoration-runtime.mjs.
local validTextDecoration = (function()
local function finite(v,low,high) return type(v)=="number" and v==v and v>=low and v<=high end
local function fields(v,allowed)
    if type(v)~="table" then return false end
    for k in pairs(v) do if not allowed[k] then return false end end
    return true
end
local function keys(words) local out={};for k in words:gmatch("%S+") do out[k]=true end;return out end
local function tuple(v,n,low,high)
    if type(v)~="table" or #v~=n then return false end
    local count=0;for k,x in pairs(v) do count+=1;if type(k)~="number" or k%1~=0 or k<1 or k>n or not finite(x,low,high) then return false end end
    return count==n
end
local function validTextDecoration(d)
    if not fields(d,keys("version reference scaled shadows baseline captured capturedAlpha themeShadow")) or d.version~=1 or type(d.scaled)~="boolean" or not tuple(d.reference,2,.000001,1e7) or type(d.shadows)~="table" or #d.shadows>8 or (#d.shadows==0 and not d.themeShadow) then return false end
    local count=0
    for k,s in pairs(d.shadows) do
        count+=1
        if type(k)~="number" or k%1~=0 or k<1 or k>#d.shadows or not fields(s,keys("color offset radius spread")) or not tuple(s.color,4,0,1) or not tuple(s.offset,2,-1000,1000) or not finite(s.radius,0,1000) or not finite(s.spread,-1000,1000) then return false end
    end
    if count~=#d.shadows then return false end
    if d.captured~=nil and (type(d.captured)~="string" or #d.captured>256) or d.themeShadow~=nil and (type(d.themeShadow)~="string" or #d.themeShadow>256) then return false end
    if d.capturedAlpha~=nil and (not d.captured or not finite(d.capturedAlpha,0,1)) then return false end
    local b=d.baseline
    if b~=nil then
        if not fields(b,keys("text font size rich scaled wrapped lineHeight x y truncate graphemes alpha color")) or type(b.text)~="string" or #b.text>8192 or type(b.font)~="table" or #b.font~=3 or type(b.font[1])~="string" or #b.font[1]>512 or not keys("Thin ExtraLight Light Regular Medium SemiBold Bold ExtraBold Heavy")[b.font[2]] or not keys("Normal Italic")[b.font[3]] or not finite(b.size,1,100) or type(b.rich)~="boolean" or type(b.scaled)~="boolean" or type(b.wrapped)~="boolean" or not finite(b.lineHeight,1,3) or not keys("Left Center Right")[b.x] or not keys("Top Center Bottom")[b.y] or not keys("None AtEnd SplitWord")[b.truncate] or not finite(b.graphemes,-1,1e9) or b.graphemes%1~=0 or not finite(b.alpha,0,1) or not tuple(b.color,3,0,1) then return false end
    end
    return true
end
return validTextDecoration
end)()
local function validateMaskBases(roots,assets)
    local totalNodes,totalGlyphs,runtimeNodes,decorationOwners=0,0,0,0
    local assetData={};for _,a in ipairs(assets or {}) do assetData[a.id]=a end
    for _,root in ipairs(roots) do
        local nodes,byId,parents={},{},{}
        local previousGlyphs=totalGlyphs
        local function visit(node,parent)
            totalNodes+=1;table.insert(nodes,node);byId[node.id]=node;parents[node.id]=parent
            for _,child in ipairs(node.children) do visit(child,node) end
        end
        visit(root,nil)
        for _,node in ipairs(nodes) do
            if node.textDecoration~=nil then
                local d=node.textDecoration
                check(set("TextLabel TextButton TextBox")[node.className] and validTextDecoration(d) and #HttpService:JSONEncode(d)<=65536 and not node.decorationRect and not node.maskBasis,"Invalid live text decoration.")
                decorationOwners+=1;totalGlyphs+=(d.themeShadow and 1 or #d.shadows)*4
                if d.captured~=nil then local c=byId[d.captured];check(c and c==byId[node.id.."/effect"] and parents[c.id]==node and c.className=="ImageLabel" and c.decorationRect and c.assetRef,"Invalid captured text decoration.") end
                if d.themeShadow~=nil then local c=byId[d.themeShadow];check(c and parents[c.id]==node and c.className=="UIShadow" and c.properties.Enabled==false,"Invalid text shadow theme.") end
            end
            if node.layoutCanvas~=nil then check(node.layoutCanvas==true and node.className=="ScrollingFrame" and not node.maskBasis,"Invalid proportional layout canvas.") end
            if node.decorationRect~=nil then
                local parent,rect=parents[node.id],node.decorationRect
                local anchor=node.properties.AnchorPoint
                local effect=parent and node.id==parent.id.."/effect"
                local asset=assetData[node.assetRef]
                check(parent and (effect or node.id==parent.id.."/decoration") and node.className=="ImageLabel" and node.assetRef and #node.children==0 and set(effect and "Frame CanvasGroup ScrollingFrame ViewportFrame TextButton ImageButton TextLabel TextBox" or "Frame CanvasGroup ScrollingFrame ViewportFrame TextButton ImageButton")[parent.className],"Invalid independent decoration helper.")
                check(asset and (effect and asset.renderMode=="shadow" or not effect and set("fills blend")[asset.renderMode]),"Invalid decoration asset owner mode.")
                numbers(rect,4)
                for _,value in ipairs(rect) do check(math.abs(value)<=1000,"Invalid background decoration bounds.") end
                check(rect[3]>0 and rect[4]>0 and node.properties.Active==false and node.properties.Selectable==false and node.properties.BackgroundTransparency==1 and node.properties.Rotation==0 and not node.behavior and not node.theme and not node.themes and not node.worldUI and not node.maskBasis and not node.assetBindings and not node.sourceType,"Invalid independent decoration properties.")
                check(type(anchor)=="table" and anchor.type=="Vector2" and anchor.value[1]==0 and anchor.value[2]==0,"Invalid background decoration anchor.")
            end
            if node.maskBasis~=nil then
                local clip,source=parents[node.id],byId[node.maskBasis]
                local ancestor=clip and parents[clip.id];local found=false
                while ancestor do if ancestor==source then found=true;break end;ancestor=parents[ancestor.id] end
                local anchor=node.properties.AnchorPoint
                check(type(node.maskBasis)=="string" and #node.maskBasis>0 and #node.maskBasis<=256 and set("Frame ScrollingFrame")[node.className] and clip and clip.className=="CanvasGroup" and found and source and not guiRoot(source.className) and not source.className:match("^UI"),"Invalid mask coordinate container.")
                if node.className=="ScrollingFrame" then check(node.properties.ScrollingEnabled==false and node.properties.ScrollBarThickness==0 and node.properties.Active==false and node.properties.Selectable==false,"Mask coordinates cannot accept scrolling input.") end
                check(not node.assetRef and not node.assetBindings and not node.behavior and not node.worldUI and node.properties.BackgroundTransparency==1 and node.properties.ClipsDescendants==false and node.properties.Rotation==0 and type(anchor)=="table" and anchor.type=="Vector2" and anchor.value[1]==0 and anchor.value[2]==0,"Invalid mask coordinate properties.")
                local scales=0
                for _,child in ipairs(node.children) do if child.className:match("^UI") then
                    check(child.className=="UIScale" and child.id==node.id.."/mask-scale" and child.properties.Scale==1,"Invalid mask coordinate scale.");scales+=1
                end end
                check(scales==1,"Mask coordinate scale is missing.")
            end
        end
        if totalGlyphs>previousGlyphs then runtimeNodes+=2+(root.worldUI and 3 or 0) end
    end
    check(totalGlyphs<=4096 and totalNodes+totalGlyphs*4+decorationOwners*5+runtimeNodes<=MAX_NODES,"Live text shadow helpers exceed the 15,000-instance or 4,096-glyph budget. Export a smaller selection or reduce text shadows.")
end
function Importer.decode(raw)
    check(type(raw) == "string" and #raw <= 20 * 1024 * 1024, "Package exceeds 20 MB.")
    local ok, package = pcall(function() return HttpService:JSONDecode(raw) end)
    check(ok and type(package) == "table", "This is not a valid JSON package.")
    check(package.format == "framebridge" and package.version == 1, "Unsupported package. Export it with Framebridge v1.")
    check(type(package.sourceId) == "string" and #package.sourceId > 0 and #package.sourceId <= 256, "Missing source identity.")
    check(type(package.roots) == "table" and #package.roots > 0 and #package.roots <= 100, "Package must contain 1–100 screens.")
    check(type(package.assets) == "table" and #package.assets <= 10000, "A design can contain at most 10,000 image references.")
    package.issues = type(package.issues) == "table" and package.issues or {}
    check(#package.issues <= MAX_NODES * 10, "Too many diagnostics.")
    for _, issue in ipairs(package.issues) do
        check(type(issue) == "table" and type(issue.message) == "string" and #issue.message <= 10000, "Invalid diagnostic.")
        check(issue.severity ~= "error", "Export contains a blocking issue: " .. issue.message)
    end
    local uniqueImages, uniqueImageCount = {}, 0
    local ids, assetIds, count = {}, {}, 0
    for _, asset in ipairs(package.assets) do
        check(type(asset) == "table" and type(asset.id) == "string" and not assetIds[asset.id], "Invalid or duplicate asset identity.")
        check(type(asset.name) == "string" and #asset.name <= 1000, "Invalid asset name.")
        assetIds[asset.id] = true
        if asset.robloxId then
            local image = assetId(asset.robloxId)
            check(image ~= nil, "Invalid linked image ID.")
            if not uniqueImages[image] then uniqueImages[image]=true; uniqueImageCount+=1 end
            check(uniqueImageCount<=1000,"A design can contain at most 1,000 unique Roblox images.")
        end
        validateDecorationAsset(asset)
        if asset.scrollbarSlice ~= nil then
            local slice = asset.scrollbarSlice
            check(type(slice) == "table" and (slice.axis == "X" or slice.axis == "Y") and finite(slice.start) and finite(slice["end"]) and slice.start >= 0 and slice["end"] <= 1 and slice.start < slice["end"], "Invalid scrollbar image slice.")
            for key in pairs(slice) do check(key == "axis" or key == "start" or key == "end", "Invalid scrollbar image slice field.") end
        end
        if asset.pixelSize ~= nil then
            numbers(asset.pixelSize,2)
            for _, dimension in ipairs(asset.pixelSize) do check(dimension > 0 and dimension <= 4096 and dimension % 1 == 0, "Invalid image pixel dimensions.") end
        end
    end
    local function visit(node,depth,root)
        count += 1
        check(count <= MAX_NODES and depth <= MAX_DEPTH, "Package is too large or deeply nested.")
        check(type(node) == "table" and PROPERTIES[node.className], "Unsupported instance class. Only UI instances are allowed.")
        check(root == guiRoot(node.className), "UI collectors must be top-level instances.")
        check(type(node.id) == "string" and #node.id > 0 and #node.id <= 256 and not ids[node.id], "Missing or duplicate layer identity.")
        ids[node.id] = true
        check(type(node.name) == "string" and #node.name <= 1000, "Invalid layer name.")
        check(type(node.properties) == "table" and type(node.children) == "table", "Invalid node data.")
        check(root or node.worldUI == nil, "World configuration belongs on the root.")
        if node.referenceSize then numbers(node.referenceSize,2); check(node.referenceSize[1] > 0 and node.referenceSize[2] > 0, "Invalid reference size.") end
        if node.layoutSizing then
            check(type(node.layoutSizing) == "table" and #node.layoutSizing == 2, "Invalid layout sizing.")
            for _, axis in ipairs(node.layoutSizing) do check(axis == "FIXED" or axis == "HUG" or axis == "FILL", "Invalid layout sizing axis.") end
        end
        for property in pairs(node.properties) do check(PROPERTIES[node.className][property], "Unsupported property: " .. tostring(property)) end
        if node.assetRef then check(assetIds[node.assetRef] and (node.className == "ImageLabel" or node.className == "ImageButton"), "Invalid asset reference.") end
        if node.assetBindings ~= nil then
            check(type(node.assetBindings)=="table" and node.className=="ScrollingFrame", "Invalid native scrollbar image references.")
            for property, ref in pairs(node.assetBindings) do
                check((property=="TopImage" or property=="MidImage" or property=="BottomImage") and type(ref)=="string" and assetIds[ref], "Invalid native scrollbar image reference.")
            end
        end
        for _,child in ipairs(node.children) do visit(child,depth+1,false) end
    end
    for _, root in ipairs(package.roots) do visit(root,0,true);validateWorld(root) end
    validateBehaviors(package.roots)
    validateThemes(package.roots)
    validateMaskBases(package.roots,package.assets)
    package.instanceCount = count
    return package
end
-- A button class or a panel role alone does not require executable behavior.
local function behaviorNeedsScript(behavior)
    if type(behavior) ~= "table" then return false end
    for key,value in pairs(behavior) do
        if key ~= "role" and type(value) == "table" and next(value) ~= nil then return true end
    end
    return false
end
function Importer.scriptFeatures(package)
    local result = {interactions=0, visuals=0, worlds=0}
    local function visit(node)
        if behaviorNeedsScript(node.behavior) then result.interactions += 1 end
        if node.themes or node.maskBasis or node.decorationRect or node.layoutCanvas or node.textDecoration then result.visuals += 1 end
        if node.worldUI then result.worlds += 1 end
        for _,child in ipairs(node.children) do visit(child) end
    end
    for _,root in ipairs(package.roots) do visit(root) end
    result.total = result.interactions + result.visuals + result.worlds
    return result
end
function Importer.stage(package, bindings, placeholders, runtime, options)
    -- Existing programmatic callers explicitly supply a trusted runtime. The
    -- Studio UI always supplies its per-design, default-off script consent.
    local scripts = options == nil or options.scripts == true
    check(type(package.assets) == "table" and #package.assets <= 10000, "A design can contain at most 10,000 image references.")
    for _,asset in ipairs(package.assets) do validateDecorationAsset(asset) end
    validateBehaviors(package.roots)
    validateThemes(package.roots)
    validateMaskBases(package.roots,package.assets)
    for _,root in ipairs(package.roots) do validateWorld(root) end
    local roots, entries, byId, missing = {}, {}, {}, {}
    local assets, assetData, uniqueImages, uniqueImageCount = {}, {}, {}, 0
    for _,asset in ipairs(package.assets) do
        assets[asset.id] = assetId(bindings[asset.id]) or assetId(asset.robloxId)
        local image = assets[asset.id]
        if image and not uniqueImages[image] then
            uniqueImages[image] = true
            uniqueImageCount += 1
            check(uniqueImageCount <= 1000, "A design can contain at most 1,000 unique Roblox images.")
        end
        assetData[asset.id] = asset
        if not assets[asset.id] then table.insert(missing,asset.name) end
    end
    check(placeholders or #missing == 0, tostring(#missing) .. " image assets still need Roblox IDs.")
    local created = {}
    local ok, err = pcall(function()
        local function interactive(node)
            if node.themes or behaviorNeedsScript(node.behavior) or node.maskBasis or node.decorationRect or node.layoutCanvas or node.textDecoration then return true end
            for _,child in ipairs(node.children) do if interactive(child) then return true end end
            return false
        end
        local function build(node,parent,nodeScripts)
            local instance = Instance.new(node.className)
            table.insert(created,instance)
            instance.Name = node.name
            local keys = {}
            -- CornerRadius writes all four corners; apply it before individual overrides.
            local propertyNames = {}
            for property in pairs(node.properties) do table.insert(propertyNames, property) end
            table.sort(propertyNames, function(a,b)
                if a == "CornerRadius" then return true end
                if b == "CornerRadius" then return false end
                return a < b
            end)
            for _,property in ipairs(propertyNames) do
                local value = node.properties[property]
                if property == "Image" or property == "TopImage" or property == "MidImage" or property == "BottomImage" then check(value == "" or assetId(value), "Image must reference a Roblox asset.") end
                if property == "SliceCenter" then check(type(value) == "table" and value.type == "Rect", "SliceCenter requires a Rect.") end
                if property == "SliceScale" then check(finite(value) and value >= 0, "SliceScale must be nonnegative.") end
                if property == "TileSize" then
                    check(type(value) == "table" and value.type == "UDim2", "TileSize requires a UDim2.")
                    local xs, xo, ys, yo = numbers(value.value,4)
                    check(xs >= 0 and xo >= 0 and ys >= 0 and yo >= 0 and xs + math.floor(xo) > 0 and ys + math.floor(yo) > 0, "TileSize needs a positive width and height.")
                end
                local valid, detail = pcall(function() instance[property] = decodeValue(value) end)
                check(valid, node.name .. "." .. property .. " could not be applied. Update Studio if this property is unavailable. " .. tostring(detail))
                table.insert(keys,property)
            end
            if node.assetRef and instance.ScaleType == Enum.ScaleType.Slice then
                local dimensions = assetData[node.assetRef].pixelSize
                if dimensions then check(instance.SliceCenter.Max.X <= dimensions[1] and instance.SliceCenter.Max.Y <= dimensions[2], "Slice guides extend beyond the exported texture.") end
            end
            if node.assetRef then
                instance.Image = assets[node.assetRef] or ""
                if not assets[node.assetRef] then instance.BackgroundColor3 = Color3.fromRGB(108,81,160); instance.BackgroundTransparency = 0.3 end
                instance:SetAttribute("FramebridgeAsset",node.assetRef)
            end
            if node.assetBindings ~= nil then
                check(type(node.assetBindings)=="table" and node.className=="ScrollingFrame", "Invalid native scrollbar image references.")
                for property, ref in pairs(node.assetBindings) do
                    check((property=="TopImage" or property=="MidImage" or property=="BottomImage") and type(ref)=="string" and assetData[ref], "Invalid native scrollbar image reference.")
                    instance[property]=assets[ref] or ""
                    if not table.find(keys,property) then table.insert(keys,property) end
                    instance:SetAttribute("FramebridgeAsset_"..property,ref)
                end
            end
            instance:SetAttribute("FramebridgeId",node.id)
            instance:SetAttribute("FramebridgeSource",package.sourceId)
            instance:SetAttribute("FramebridgeProperties",HttpService:JSONEncode(keys))
            if guiRoot(node.className) and node.referenceSize then instance:SetAttribute("FramebridgeCanvas",HttpService:JSONEncode(node.referenceSize)) end
            if node.worldUI then instance:SetAttribute("FramebridgeWorld",HttpService:JSONEncode(node.worldUI)); instance:SetAttribute("FramebridgeWorldCanvas",HttpService:JSONEncode(node.referenceSize)) end
            if nodeScripts and node.themes then instance:SetAttribute("FramebridgeThemes",HttpService:JSONEncode(node.themes)) end
            if nodeScripts and node.theme then instance:SetAttribute("FramebridgeThemeBinding",HttpService:JSONEncode(node.theme)) end
            if nodeScripts and node.behavior and next(node.behavior) then instance:SetAttribute("FramebridgeBehavior",HttpService:JSONEncode(node.behavior)) end
            if node.maskBasis then instance:SetAttribute("FramebridgeMaskBasis",node.maskBasis) end
            if node.layoutCanvas then instance:SetAttribute("FramebridgeLayoutCanvas","true") end
            if node.decorationRect then instance:SetAttribute("FramebridgeDecorationRect",HttpService:JSONEncode(node.decorationRect)) end
            if node.textDecoration then instance:SetAttribute("FramebridgeTextDecoration",HttpService:JSONEncode(node.textDecoration)) end
            instance.Parent = parent
            local entry = { instance=instance, node=node, parent=parent, keys=keys }
            table.insert(entries,entry); byId[node.id] = entry
            for _,child in ipairs(node.children) do build(child,instance,nodeScripts) end
            return instance
        end
        for _,root in ipairs(package.roots) do
            local nodeScripts = scripts and (interactive(root) or root.worldUI ~= nil)
            local instance = build(root,nil,nodeScripts)
            table.insert(roots,instance)
            if root.worldUI then
                local target=Instance.new("ObjectValue");table.insert(created,target)
                target.Name="FramebridgeWorldTarget";target:SetAttribute("FramebridgeId",root.id.."/world-target");target:SetAttribute("FramebridgeSource",package.sourceId);target:SetAttribute("FramebridgeProperties",'["Value"]');target.Parent=instance
                local entry={instance=target,node={id=root.id.."/world-target",name=target.Name,properties={}},parent=instance,keys={},worldReference=instance}
                table.insert(entries,entry);byId[entry.node.id]=entry
                if root.worldUI.kind=="prompt" then
                    local config=root.worldUI.prompt
                    local prompt=Instance.new("ProximityPrompt");table.insert(created,prompt)
                    prompt.Name=root.name.."Prompt";prompt.Style=Enum.ProximityPromptStyle.Custom
                    prompt.ActionText=config.actionText;prompt.ObjectText=config.objectText;prompt.KeyboardKeyCode=Enum.KeyCode[config.keyboardKey];prompt.GamepadKeyCode=Enum.KeyCode[config.gamepadKey]
                    prompt.HoldDuration=config.holdDuration;prompt.MaxActivationDistance=config.activationDistance;prompt.RequiresLineOfSight=config.requiresLineOfSight;prompt.ClickablePrompt=config.clickable
                    local keys={"Style","ActionText","ObjectText","KeyboardKeyCode","GamepadKeyCode","HoldDuration","MaxActivationDistance","RequiresLineOfSight","ClickablePrompt"}
                    prompt:SetAttribute("FramebridgeId",root.id.."/world-prompt");prompt:SetAttribute("FramebridgeSource",package.sourceId);prompt:SetAttribute("FramebridgeProperties",HttpService:JSONEncode(keys));prompt:SetAttribute("FramebridgeGeneratedPrompt",true)
                    local entry={instance=prompt,node={id=root.id.."/world-prompt",name=prompt.Name,properties={}},keys=keys,externalRoot=instance}
                    table.insert(entries,entry);byId[entry.node.id]=entry
                    target.Value=prompt
                end
            end
            if nodeScripts then
                check(type(runtime) == "table" and runtime.version == "11" and type(runtime.source) == "string", "Update the Studio plugin to enable generated UI behavior.")
                local clientSource = runtime.source
                if root.themes then check(type(runtime.themeSource)=="string", "Update the Studio plugin to enable theme tokens.");clientSource=runtime.themeSource end
                local function particles(node)
                    if node.behavior and node.behavior.particles then return true end
                    for _,child in ipairs(node.children) do if particles(child) then return true end end
                    return false
                end
                if particles(root) then
                    local key=root.themes and "themeParticleSource" or "particleSource"
                    check(type(runtime[key])=="string","Update the Studio plugin to enable particles.");clientSource=runtime[key]
                    instance:SetAttribute("FramebridgeParticles","1")
                end
                check(type(clientSource)=="string", "Update the Studio plugin to enable theme tokens.")
                local id = root.id .. "/behavior-runtime"
                check(not byId[id] and not byId[id.."/module"], "Reserved interaction runtime identity.")
                local bootstrapSource = "-- Framebridge generated runtime bootstrap.\nrequire(script.FramebridgeRuntime)\n"
                local moduleSource = "local runtimeModule=script\nlocal script=runtimeModule.Parent\n"..clientSource.."\nconnect(runtimeModule.Destroying,cleanup)\nreturn true\n"
                local client = Instance.new("LocalScript")
                table.insert(created,client)
                client.Name = "FramebridgeInteractions"
                client.Source = bootstrapSource
                client:SetAttribute("FramebridgeId",id)
                client:SetAttribute("FramebridgeSource",package.sourceId)
                client:SetAttribute("FramebridgeProperties",HttpService:JSONEncode({"Source"}))
                client:SetAttribute("FramebridgeRuntime",runtime.version)
                client:SetAttribute("FramebridgeGeneratedSource",bootstrapSource)
                client.Parent = instance
                local entry = {instance=client,node={id=id,name=client.Name,properties={Source=bootstrapSource}},parent=instance,keys={"Source"},runtime=true}
                table.insert(entries,entry); byId[id] = entry
                local module = Instance.new("ModuleScript")
                table.insert(created,module)
                module.Name = "FramebridgeRuntime"
                module.Source = moduleSource
                module:SetAttribute("FramebridgeId",id.."/module")
                module:SetAttribute("FramebridgeSource",package.sourceId)
                module:SetAttribute("FramebridgeProperties",HttpService:JSONEncode({"Source"}))
                module:SetAttribute("FramebridgeRuntime",runtime.version)
                module:SetAttribute("FramebridgeGeneratedSource",moduleSource)
                module.Parent=client
                local moduleEntry={instance=module,node={id=id.."/module",name=module.Name,properties={Source=moduleSource}},parent=client,keys={"Source"},runtime=true}
                table.insert(entries,moduleEntry);byId[moduleEntry.node.id]=moduleEntry
            end
        end
    end)
    if not ok then for _,instance in ipairs(created) do instance:Destroy() end; error(err,0) end
    return { roots=roots, entries=entries, byId=byId, missing=missing }
end
function Importer.destroy(stage) for _,entry in ipairs(stage.entries) do if entry.externalRoot then entry.instance:Destroy() end end; for _,root in ipairs(stage.roots) do root:Destroy() end end
-- Builds the whole update plan before touching the user's data model.
-- Existing instances keep their identity, events, scripts, and custom children.
local function ownsPrompt(root,prompt)
    local id=root:GetAttribute("FramebridgeId")
    return prompt and prompt:IsA("ProximityPrompt") and type(id)=="string"
        and prompt:GetAttribute("FramebridgeGeneratedPrompt")==true
        and prompt:GetAttribute("FramebridgeSource")==root:GetAttribute("FramebridgeSource")
        and prompt:GetAttribute("FramebridgeId")==id.."/world-prompt"
end
function Importer.apply(stage, package, destination, update, worldTarget)
    local existing = {}
    if update then
        local rootIds = {}
        for _, root in ipairs(package.roots) do rootIds[root.id] = true end
        for _, root in ipairs(destination:GetChildren()) do
            if root:GetAttribute("FramebridgeSource") == package.sourceId and rootIds[root:GetAttribute("FramebridgeId")] then
                local owned={root,table.unpack(root:GetDescendants())}
                local seenPrompts={}
                for _,name in ipairs({"FramebridgeWorldTarget","FramebridgeOwnedPrompt"}) do
                    local reference=root:FindFirstChild(name)
                    local prompt=reference and reference:IsA("ObjectValue") and reference.Value
                    if ownsPrompt(root,prompt) and not seenPrompts[prompt] then
                        seenPrompts[prompt]=true;table.insert(owned,prompt)
                        for _,child in ipairs(prompt:GetDescendants()) do table.insert(owned,child) end
                    end
                end
                for _, instance in ipairs(owned) do
                    if instance:GetAttribute("FramebridgeSource") == package.sourceId then
                        local id = instance:GetAttribute("FramebridgeId")
                        if id then check(not existing[id], "Multiple imports share this identity. Remove the duplicate or import as a new copy."); existing[id] = instance end
                    end
                end
            end
        end
    end
    local actual, journal, newInstances, removed = {}, {}, {}, {}
    local stats = { created=0, updated=0, removed=0 }
    for _,entry in ipairs(stage.entries) do
        local old = existing[entry.node.id]
        check(not old or old.ClassName == entry.instance.ClassName, "Layer class changed for " .. entry.node.name .. ". Import a new copy to preserve attached scripts.")
        if old and entry.runtime then check(old:GetAttribute("FramebridgeGeneratedSource") == old.Source, "Your generated interaction script was edited. Keep that script in a new copy, or move your changes to an application script before updating.") end
        actual[entry.instance] = old or entry.instance
    end
    local worldTargets,externalPrompts={},{}
    for _,root in ipairs(stage.roots) do
        if root:GetAttribute("FramebridgeWorld") then
            local config=HttpService:JSONDecode(root:GetAttribute("FramebridgeWorld"))
            local prior=actual[root]
            local reference=prior:FindFirstChild("FramebridgeWorldTarget")
            local linked=reference and reference:IsA("ObjectValue") and reference.Value
            local target=worldTarget or (config.kind~="prompt" and prior.Adornee) or linked
            if config.kind=="prompt" then
                local ownedReference=prior:FindFirstChild("FramebridgeOwnedPrompt")
                check(not ownedReference or (ownedReference:IsA("ObjectValue") and ownedReference:GetAttribute("FramebridgeOwnedPromptReference")==true),"The reserved owned-prompt reference contains custom content")
                -- A scene selection during reimport must not replace an explicitly linked game prompt.
                if update and linked and linked:IsA("ProximityPrompt") and not ownsPrompt(prior,linked)
                    and not (worldTarget and worldTarget:IsA("ProximityPrompt")) then target=linked end
                if target and target:IsA("ProximityPrompt") then
                    check(target.Style==Enum.ProximityPromptStyle.Custom,"Set the linked prompt's Style to Custom")
                    if not ownsPrompt(prior,target) then externalPrompts[root]=target end
                end
            else check(not target or not target:IsA("ProximityPrompt"),"Select a Part or Attachment for this world UI") end
            if target and target:IsA("ProximityPrompt") then
                target=target.Parent
                if target and target:IsA("Model") then target=target.PrimaryPart end
            end
            target=target or prior.Adornee
            check(typeof(target)=="Instance" and target:IsDescendantOf(game:GetService("Workspace")),"Select a Part or Attachment in Workspace before importing world UI")
            check(config.kind=="surface" and target:IsA("BasePart") or config.kind~="surface" and (target:IsA("BasePart") or target:IsA("Attachment")),"Surface UI needs a Part; billboard and prompt UI need a Part or Attachment")
            check(config.kind~="surface" or target.CanQuery,"Enable CanQuery on the selected Part so SurfaceGui buttons receive input")
            worldTargets[root]=target
        end
    end
    -- Removed owned nodes may contain user scripts or UI. Do not discard those.
    for id,instance in pairs(existing) do
        if not stage.byId[id] then
            if (instance:IsA("LocalScript") or instance:IsA("ModuleScript")) and instance:GetAttribute("FramebridgeRuntime") then check(instance:GetAttribute("FramebridgeGeneratedSource") == instance.Source, "Your generated interaction script was edited. Import a new copy before removing it.") end
            local function checkRemovedContent(parent)
                for _,child in ipairs(parent:GetChildren()) do
                    if child:GetAttribute("FramebridgeParticleHelper")==true and child:GetAttribute("FramebridgeParticleHelperSource")==package.sourceId and child:GetAttribute("FramebridgeParticleOwner")==parent:GetAttribute("FramebridgeId") then
                        local external=child:GetAttribute("FramebridgeParticleEngine")=="dogwarrior24-template-v1"
                        local function checkHelper(helper,inExternal)
                            check(not helper:IsA("LuaSourceContainer"),"Removed particle visuals contain your script. Move it onto an authored layer before updating.")
                            local externalRoot=external and helper.Parent==child and helper.Name=="Framebridge Emitter2D" and helper:IsA("GuiObject") and helper:GetAttribute("ClassName")=="Emitter2D"
                            local owned=helper:GetAttribute("FramebridgeParticleHelper")==true and helper:GetAttribute("FramebridgeParticleHelperSource")==package.sourceId and helper:GetAttribute("FramebridgeParticleOwner")==child:GetAttribute("FramebridgeParticleOwner")
                            check(inExternal or externalRoot or owned,"Removed particle visuals contain your custom content. Move it onto an authored layer before updating.")
                            for _,descendant in ipairs(helper:GetChildren())do checkHelper(descendant,inExternal or externalRoot)end
                        end
                        checkHelper(child,false)
                        continue
                    end
                    local kept = child:GetAttribute("FramebridgeSource") == package.sourceId and stage.byId[child:GetAttribute("FramebridgeId")]
                    -- Retained layers (and their application children) move before the wrapper is removed.
                    if not kept then
                        check(child:GetAttribute("FramebridgeSource") == package.sourceId, "Removed layer " .. instance.Name .. " contains your custom content. Move that content out before updating, or import a new copy.")
                        checkRemovedContent(child)
                    end
                end
            end
            checkRemovedContent(instance)
            table.insert(removed,instance)
        end
    end
    local function assign(instance,key,value,attribute)
        local old
        if attribute then old = instance:GetAttribute(key) else old = instance[key] end
        table.insert(journal,{instance,key,old,attribute})
        if attribute then instance:SetAttribute(key,value) else instance[key] = value end
    end
    local ok,err = pcall(function()
        for _,entry in ipairs(stage.entries) do
            local target = actual[entry.instance]
            if entry.externalRoot and externalPrompts[entry.externalRoot] then
                -- Preserve all gameplay-owned prompt properties, scripts and ownership metadata.
                -- Keep our previous generated prompt disabled so it can be rebound without losing scripts.
                if target~=entry.instance then
                    stats.updated+=1
                    for _,property in ipairs(entry.keys) do assign(target,property,entry.instance[property],false) end
                    assign(target,"Name",entry.instance.Name,false)
                    local root=actual[entry.externalRoot]
                    local reference=root:FindFirstChild("FramebridgeOwnedPrompt")
                    if not reference then
                        reference=Instance.new("ObjectValue");reference.Name="FramebridgeOwnedPrompt"
                        table.insert(newInstances,reference);stats.created+=1
                        reference:SetAttribute("FramebridgeOwnedPromptReference",true)
                        assign(reference,"Parent",root,false)
                    end
                    if reference.Value~=target or type(reference:GetAttribute("FramebridgeRestorePromptEnabled"))~="boolean" then
                        assign(reference,"Value",target,false)
                        assign(reference,"FramebridgeRestorePromptEnabled",target.Enabled,true)
                    end
                    assign(target,"Enabled",false,false)
                end
                continue
            end
            if target == entry.instance then table.insert(newInstances,target); stats.created += 1
            else
                stats.updated += 1
                local raw = target:GetAttribute("FramebridgeProperties")
                local prior = raw and HttpService:JSONDecode(raw) or {}
                for _,property in ipairs(prior) do
                    if PROPERTIES[target.ClassName] and PROPERTIES[target.ClassName][property] and entry.node.properties[property] == nil then assign(target,property,entry.instance[property],false) end
                end
                for _,property in ipairs(entry.keys) do assign(target,property,entry.instance[property],false) end
                assign(target,"Name",entry.instance.Name,false)
                assign(target,"FramebridgeProperties",entry.instance:GetAttribute("FramebridgeProperties"),true)
                assign(target,"FramebridgeCanvas",entry.instance:GetAttribute("FramebridgeCanvas"),true)
                assign(target,"FramebridgeAsset",entry.instance:GetAttribute("FramebridgeAsset"),true)
                for _, property in ipairs({"TopImage","MidImage","BottomImage"}) do
                    assign(target,"FramebridgeAsset_"..property,entry.instance:GetAttribute("FramebridgeAsset_"..property),true)
                end
                assign(target,"FramebridgeThemes",entry.instance:GetAttribute("FramebridgeThemes"),true)
                assign(target,"FramebridgeParticles",entry.instance:GetAttribute("FramebridgeParticles"),true)
                assign(target,"FramebridgeThemeBinding",entry.instance:GetAttribute("FramebridgeThemeBinding"),true)
                assign(target,"FramebridgeBehavior",entry.instance:GetAttribute("FramebridgeBehavior"),true)
                if not entry.instance:GetAttribute("FramebridgeBehavior") then
                    for _,name in ipairs({"FramebridgeState","FramebridgeSelected","FramebridgeBindingStatus","FramebridgeMotionStatus","FramebridgeKeyframesStatus","FramebridgeParticlesStatus"}) do assign(target,name,nil,true) end
                end
                if not entry.instance:GetAttribute("FramebridgeThemes") and not entry.instance:GetAttribute("FramebridgeThemeBinding") then
                    assign(target,"FramebridgeTheme",nil,true)
                    assign(target,"FramebridgeThemeStatus",nil,true)
                end
                assign(target,"FramebridgeMaskBasis",entry.instance:GetAttribute("FramebridgeMaskBasis"),true)
                assign(target,"FramebridgeLayoutCanvas",entry.instance:GetAttribute("FramebridgeLayoutCanvas"),true)
                assign(target,"FramebridgeDecorationRect",entry.instance:GetAttribute("FramebridgeDecorationRect"),true)
                assign(target,"FramebridgeTextDecoration",entry.instance:GetAttribute("FramebridgeTextDecoration"),true)
                assign(target,"FramebridgeWorld",entry.instance:GetAttribute("FramebridgeWorld"),true)
                assign(target,"FramebridgeWorldCanvas",entry.instance:GetAttribute("FramebridgeWorldCanvas"),true)
                if entry.runtime then
                    assign(target,"FramebridgeRuntime",entry.instance:GetAttribute("FramebridgeRuntime"),true)
                    assign(target,"FramebridgeGeneratedSource",entry.instance:GetAttribute("FramebridgeGeneratedSource"),true)
                end
            end
            if worldTargets[entry.instance] then assign(target,"Adornee",worldTargets[entry.instance],false) end
            if entry.worldReference then
                local stagedPrompt=entry.instance.Value
                assign(target,"Value",externalPrompts[entry.worldReference] or (stagedPrompt and actual[stagedPrompt]) or worldTargets[entry.worldReference],false)
            end
            if entry.externalRoot then
                local reference=actual[entry.externalRoot]:FindFirstChild("FramebridgeOwnedPrompt")
                local enabled=reference and reference.Value==target and reference:GetAttribute("FramebridgeRestorePromptEnabled")
                if type(enabled)=="boolean" then assign(target,"Enabled",enabled,false);assign(reference,"FramebridgeRestorePromptEnabled",nil,true) end
            end
            assign(target,"Parent",entry.externalRoot and worldTargets[entry.externalRoot] or entry.parent and actual[entry.parent] or destination,false)
        end
        for _,instance in ipairs(removed) do assign(instance,"Parent",nil,false); stats.removed += 1 end
    end)
    if not ok then
        for i=#journal,1,-1 do local item=journal[i]; pcall(function() if item[4] then item[1]:SetAttribute(item[2],item[3]) else item[1][item[2]]=item[3] end end) end
        for _,instance in ipairs(newInstances) do instance:Destroy() end
        error(err,0)
    end
    local roots = {}
    for _,root in ipairs(stage.roots) do table.insert(roots,actual[root]) end
    -- Unparented stale objects remain undoable through ChangeHistoryService.
    -- A newly added wrapper can retain staged copies of reused children after it moves
    -- into the live tree. Remove every replaced staging instance, not only its root.
    for _,entry in ipairs(stage.entries) do
        if actual[entry.instance] ~= entry.instance or (entry.externalRoot and externalPrompts[entry.externalRoot]) then entry.instance:Destroy() end
    end
    return roots, stats
end
return Importer
