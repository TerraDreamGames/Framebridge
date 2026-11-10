-- The fixture is compiled from Figma API coordinates at (48000, -32000).
-- Independently resolve the final viewport positions through nested UDim2s.
local passed, failures = 0, {}
local function near(actual, expected)
    assert(math.abs(actual-expected) < 0.01, tostring(actual) .. " ~= " .. tostring(expected))
end
local function positions(prepared, width, height)
    local boxes = {}
    local function visit(node, x, y, w, h)
        if node.properties.Size then
            local size = node.properties.Size.value
            local position = node.properties.Position.value
            local anchor = node.properties.AnchorPoint.value
            local ownW, ownH = size[1]*w+size[2], size[3]*h+size[4]
            x += position[1]*w+position[2]-anchor[1]*ownW
            y += position[3]*h+position[4]-anchor[2]*ownH
            w, h = ownW, ownH
            boxes[node.id] = {x,y,w,h}
        end
        for _, child in node.children do visit(child,x,y,w,h) end
    end
    for _, root in prepared.roots do visit(root,0,0,width,height) end
    return boxes
end
for _, mode in {"scale", "offset", "source"} do
    local ok, why = pcall(function()
        local prepared, notices = Editor.prepare(package,{mode=mode})
        assert(#notices == 0, "Unexpected conversion warning")
        for _, viewport in {{800,600},{400,300},{1200,900},{360,780}} do
            local sx = mode == "scale" and viewport[1]/800 or 1
            local sy = mode == "scale" and viewport[2]/600 or 1
            local boxes = positions(prepared,viewport[1],viewport[2])
            near(boxes["31:1"][1],0); near(boxes["31:1"][2],0)
            near(boxes["31:4"][1],100*sx); near(boxes["31:4"][2],100*sy)
            near(boxes["31:4"][3],180*sx); near(boxes["31:4"][4],32*sy)
            near(boxes["31:5"][1],317*sx); near(boxes["31:5"][2],105*sy)
            near(boxes["31:5"][3],38*sx); near(boxes["31:5"][4],42*sy)
            near(boxes["31:7"][1],122*sx); near(boxes["31:7"][2],218*sy)
        end
        -- Source delivery remains untouched for receipts and repeat imports.
        assert(Editor.find(package,"31:4").properties.Position.value[2] == 20)
    end)
    if ok then passed += 1 else table.insert(failures,mode .. ": " .. tostring(why)) end
end
for _, mode in {"scale", "offset", "source"} do
    local ok, why = pcall(function()
        assert(screenPackage.roots[1].referenceSize[1] == 1920)
        assert(screenPackage.roots[1].referenceSize[2] == 1080)
        local prepared, notices = Editor.prepare(screenPackage,{mode=mode})
        assert(#notices == 0, "Unexpected conversion warning")
        local boxes = positions(prepared,1920,1080)
        near(boxes["31:1"][1],560); near(boxes["31:1"][2],240)
        near(boxes["31:1"][3],800); near(boxes["31:1"][4],600)
        near(boxes["31:4"][1],660); near(boxes["31:4"][2],340)
        near(boxes["31:5"][1],877); near(boxes["31:5"][2],345)
        near(boxes["31:7"][1],682); near(boxes["31:7"][2],458)
        if mode == "scale" then
            local main = Editor.find(prepared,"31:1").properties.Size.value
            near(main[1],800/1920); near(main[3],600/1080)
            assert(main[2] == 0 and main[4] == 0, "Main panel has pixel offsets")
            for _, viewport in {{1280,720},{960,540},{2560,1440},{390,844}} do
                local sx, sy = viewport[1]/1920, viewport[2]/1080
                local left, top = (viewport[1]-800*sx)/2,(viewport[2]-600*sy)/2
                local resized = positions(prepared,viewport[1],viewport[2])
                near(resized["31:1"][1],left); near(resized["31:1"][2],top)
                near(resized["31:1"][3],800*sx); near(resized["31:1"][4],600*sy)
                near(resized["31:4"][1],left+100*sx); near(resized["31:4"][2],top+100*sy)
                near(resized["31:5"][1],left+317*sx); near(resized["31:5"][2],top+105*sy)
                near(resized["31:7"][1],left+122*sx); near(resized["31:7"][2],top+218*sy)
            end
        end
        assert(Editor.find(screenPackage,"31:4").properties.Position.value[2] == 20)
    end)
    if ok then passed += 1 else table.insert(failures,"screen " .. mode .. ": " .. tostring(why)) end
end
return {passed=passed,failed=#failures,failures=failures,scope="Figma snapshot through Studio sizing; authored canvas and 1920x1080 panel reference"}
