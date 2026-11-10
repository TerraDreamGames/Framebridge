local checks={}
local function test(name,fn)
    local ok,why=pcall(fn)
    table.insert(checks,{name=name,passed=ok,error=not ok and tostring(why) or nil})
end
for _,kind in ipairs({'surface','billboard','prompt'}) do
    test(kind..' mount, update and cleanup',function()
        local destination=Instance.new('Folder')
        local target=Instance.new('Part'); target.Name='FramebridgeWorldQA';target.Anchored=true;target.Parent=workspace
        local stage,controller
        local ok,why=pcall(function()
            local pkg=Importer.decode(game:GetService('HttpService'):JSONEncode(fixtures[kind]))
            stage=Importer.stage(pkg,{},false,runtimeSource)
            local roots=Importer.apply(stage,pkg,destination,false,target)
            local root=roots[1]
            assert(root.Adornee==target,'Missing Adornee')
            local reference=root:FindFirstChild('FramebridgeWorldTarget')
            assert(reference and reference:IsA('ObjectValue'))
            if kind=='prompt' then
                assert(reference.Value:IsA('ProximityPrompt') and reference.Value.Parent==target)
                assert(reference.Value.Style==Enum.ProximityPromptStyle.Custom and reference.Value.HoldDuration==0.5)
                assert(reference.Value.ActionText=='Open chest')
            else assert(reference.Value==target) end
            local action=stage.byId.action.instance
            local custom=Instance.new('LocalScript'); custom.Name='ApplicationScript';custom.Source='-- application';custom.Parent=action
            local oldPrompt=kind=='prompt' and reference.Value
            pkg.roots[1].worldUI.alwaysOnTop=false;pkg.roots[1].properties.AlwaysOnTop=false
            if kind=='prompt' then pkg.roots[1].worldUI.prompt.actionText='Updated action' end
            local update=Importer.stage(pkg,{},false,runtimeSource)
            local changed=Importer.apply(update,pkg,destination,true)
            assert(changed[1]==root and action.Parent and custom.Parent==action,'Update replaced custom content')
            assert(not root.AlwaysOnTop and root.Adornee==target)
            if kind=='prompt' then assert(reference.Value==oldPrompt and oldPrompt.ActionText=='Updated action','Prompt identity not preserved') end
            controller=Runtime.mount(root,{manualMotion=true,reducedMotion=true})
            assert(controller.connectionCount()>0)
            controller.destroy();assert(controller.connectionCount()==0)
            assert(not root:FindFirstChild('FramebridgePromptInput') and not root:FindFirstChild('FramebridgeWorldScale',true))
            controller=nil
        end)
        if controller then controller.destroy() end
        destination:Destroy();target:Destroy()
        assert(ok,why)
    end)
end
test('missing and incompatible target fail before destination mutation',function()
    local destination=Instance.new('Folder')
    local stage=Importer.stage(fixtures.surface,{},false,runtimeSource)
    assert(not pcall(Importer.apply,stage,fixtures.surface,destination,false,nil))
    assert(#destination:GetChildren()==0)
    local part=Instance.new('Part');part.CanQuery=false;part.Parent=workspace
    assert(not pcall(Importer.apply,stage,fixtures.surface,destination,false,part))
    assert(#destination:GetChildren()==0)
    Importer.destroy(stage);part:Destroy();destination:Destroy()
end)
test('world validation rejects inconsistent classes, targets and prompt roles',function()
    local Http=game:GetService('HttpService')
    for _,edit in ipairs({function(p)p.roots[1].className='ScreenGui'end,function(p)p.roots[1].worldUI.target='Workspace.Part'end,function(p)p.roots[1].worldUI.prompt.labels.action='progress'end}) do
        local pkg=Http:JSONDecode(Http:JSONEncode(fixtures.prompt));edit(pkg)
        assert(not pcall(Importer.decode,Http:JSONEncode(pkg)))
    end
end)
test('Studio scale preparation preserves the authored world canvas',function()
    for _,kind in ipairs({'surface','billboard','prompt'}) do
        local pkg=Importer.decode(game:GetService('HttpService'):JSONEncode(fixtures[kind]))
        local prepared=Editor.prepare(pkg,{mode='scale',layers={}})
        local canvas=prepared.roots[1].children[1]
        assert(canvas.properties.Size.value[1]==0 and canvas.properties.Size.value[2]==280 and canvas.properties.Size.value[3]==0 and canvas.properties.Size.value[4]==140,'Authored canvas scaled twice')
        local design=canvas.children[1]
        assert(design.properties.Size.value[1]==1 and design.properties.Size.value[3]==1,'Design does not fit its authored canvas')
        Importer.destroy(Importer.stage(prepared,{},false,runtimeSource))
    end
end)
test('ScreenGui / SurfaceGui conversion preserves identity and real Undo / Redo',function()
    local history=game:GetService('ChangeHistoryService')
    local baseline=history:TryBeginRecording('FramebridgeWorldQASetup','Create world QA fixture');assert(baseline)
    local destination=Instance.new('Folder');destination.Name='FramebridgeWorldQA';destination.Parent=game:GetService('StarterGui')
    local part=Instance.new('Part');part.Name='FramebridgeWorldQA';part.Anchored=true;part.Parent=workspace
    local original=Instance.new('ScreenGui');original.Name='WorldConversionQA';original.IgnoreGuiInset=true;original.DisplayOrder=7
    original:SetAttribute('FramebridgeId','screen:conversion');original:SetAttribute('FramebridgeSource','world-conversion');original:SetAttribute('FramebridgeCanvas','[280,140]');original.Parent=destination
    local frame=Instance.new('Frame');frame.Size=UDim2.fromScale(1,1);frame:SetAttribute('FramebridgeId','conversion');frame:SetAttribute('FramebridgeSource','world-conversion');frame.Parent=original
    local app=Instance.new('LocalScript');app.Name='Application';app.Source='-- custom';app.Parent=frame
    history:FinishRecording(baseline,Enum.FinishRecordingOperation.Commit)
    local surface,screen
    local ok,why=pcall(function()
        surface=WorldTools.run({original,part},'surface',{},history,runtimeSource).root
        assert(surface:IsA('SurfaceGui') and surface.Adornee==part and surface.CanvasSize==Vector2.new(280,140))
        assert(frame.Parent.Parent==surface and app.Parent==frame and original.Parent==nil)
        assert(surface:GetAttribute('FramebridgeId')=='screen:conversion')
        local can,label=history:GetCanUndo();assert(can and (label=='Change world UI' or label=='FramebridgeWorld'),'Conversion did not create its own native Undo step: '..tostring(label))
        history:Undo();task.wait()
        assert(original.Parent==destination and frame.Parent==original and app.Parent==frame,'Undo lost original instances: '..game:GetService('HttpService'):JSONEncode({originalParent=original.Parent and original.Parent:GetFullName(),frameParent=frame.Parent and frame.Parent:GetFullName(),appParent=app.Parent and app.Parent:GetFullName(),expected=destination:GetFullName(),originalSame=destination:FindFirstChild(original.Name)==original,frameSame=original:FindFirstChild(frame.Name)==frame,appSame=frame:FindFirstChild(app.Name)==app}))
        history:Redo();task.wait()
        assert(surface.Parent==destination and frame.Parent.Parent==surface and app.Parent==frame,'Redo lost converted instances')
        screen=WorldTools.run({surface},'screen',{},history,runtimeSource).root
        assert(screen:IsA('ScreenGui') and screen.IgnoreGuiInset and screen.DisplayOrder==7 and frame.Parent==screen)
        assert(frame.Size==UDim2.fromScale(1,1) and app.Parent==frame and not screen:GetAttribute('FramebridgeWorld'))
        history:Undo();task.wait();assert(surface.Parent==destination and frame.Parent.Parent==surface,'Reverse conversion Undo failed')
        history:Redo();task.wait();assert(screen.Parent==destination and frame.Parent==screen,'Reverse conversion Redo failed')
    end)
    destination:Destroy();part:Destroy();original:Destroy();if surface then surface:Destroy() end;if screen then screen:Destroy() end
    assert(ok,why)
end)
test('unbound model-style prompt binding, relocation and real Undo',function()
    local history=game:GetService('ChangeHistoryService')
    local baseline=history:TryBeginRecording('FramebridgeWorldQASetup','Create world QA fixture');assert(baseline)
    local destination=Instance.new('Folder');destination.Name='FramebridgeWorldQA';destination.Parent=game:GetService('StarterGui')
    local first=Instance.new('Part');first.Name='FramebridgeWorldQA';first.Anchored=true;first.Parent=workspace
    local second=first:Clone();second.Parent=workspace
    local root,ownedPrompt
    local ok,why=pcall(function()
        local stage=Importer.stage(fixtures.prompt,{},false,runtimeSource);root=stage.roots[1];root.Parent=destination
        local reference=root:FindFirstChild('FramebridgeWorldTarget');reference.Value:Destroy();reference.Value=nil
        history:FinishRecording(baseline,Enum.FinishRecordingOperation.Commit);baseline=nil
        WorldTools.run({root,first},'bind',{},history,runtimeSource)
        ownedPrompt=reference.Value
        assert(ownedPrompt and ownedPrompt:IsA('ProximityPrompt') and ownedPrompt.Parent==first and root.Adornee==first)
        history:Undo();task.wait();assert(reference.Value==nil and root.Adornee==nil,'Undo did not remove a newly created prompt binding')
        history:Redo();task.wait();ownedPrompt=reference.Value;assert(ownedPrompt and ownedPrompt.Parent==first,'Redo did not restore the prompt binding')
        local added=history:TryBeginRecording('FramebridgeWorldQAApp','Attach QA game script');assert(added)
        local app=Instance.new('Script');app.Name='Gameplay';app.Source='-- custom';app.Parent=ownedPrompt
        history:FinishRecording(added,Enum.FinishRecordingOperation.Commit)
        WorldTools.run({root,second},'bind',{},history,runtimeSource)
        assert(reference.Value==ownedPrompt and ownedPrompt.Parent==second and app.Parent==ownedPrompt)
        history:Undo();task.wait();assert(reference.Value==ownedPrompt and ownedPrompt.Parent==first and root.Adornee==first,'Binding Undo lost prompt identity')
        history:Redo();task.wait();assert(ownedPrompt.Parent==second and app.Parent==ownedPrompt,'Binding Redo lost game script')
    end)
    if baseline then history:FinishRecording(baseline,Enum.FinishRecordingOperation.Cancel) end
    destination:Destroy();first:Destroy();second:Destroy();if root then root:Destroy() end;if ownedPrompt then ownedPrompt:Destroy() end
    assert(ok,why)
end)
test('failed conversion restores children, root and attributes',function()
    local folder=Instance.new('Folder')
    local part=Instance.new('Part');part.Parent=workspace
    local root=Instance.new('ScreenGui');root:SetAttribute('FramebridgeCanvas','[280,140]');root.Parent=folder
    local frame=Instance.new('Frame');frame.Parent=root
    local cancelled=false
    local history={TryBeginRecording=function() return 'failure-fixture' end,FinishRecording=function(_,_,operation) if operation==Enum.FinishRecordingOperation.Commit then error('injected commit failure') else cancelled=true end end}
    local ok,why=pcall(WorldTools.run,{root,part},'surface',{},history,runtimeSource)
    assert(not ok and tostring(why):find('injected commit failure') and cancelled)
    assert(root.Parent==folder and frame.Parent==root and #folder:GetChildren()==1 and not root:GetAttribute('FramebridgeWorld'),'Rollback changed the original UI')
    folder:Destroy();part:Destroy()
end)
test('surface conversion rejects unsupported compositing before mutations',function()
    local folder=Instance.new('Folder');local part=Instance.new('Part');part.Parent=workspace
    local root=Instance.new('ScreenGui');root:SetAttribute('FramebridgeCanvas','[280,140]');root.Parent=folder
    local group=Instance.new('CanvasGroup');group.Parent=root
    assert(not pcall(WorldTools.run,{root,part},'surface',{},game:GetService('ChangeHistoryService'),runtimeSource))
    assert(root.Parent==folder and group.Parent==root and #folder:GetChildren()==1)
    folder:Destroy();part:Destroy()
end)
test('destroying world targets disposes the complete generated controller',function()
    for _,kind in ipairs({'surface','billboard','prompt'}) do
        local folder=Instance.new('Folder');local target=Instance.new('Part');target.Parent=workspace
        local controller
        local ok,why=pcall(function()
            local stage=Importer.stage(fixtures[kind],{},false,runtimeSource)
            local root=Importer.apply(stage,fixtures[kind],folder,false,target)[1]
            controller=Runtime.mount(root,{manualMotion=true})
            target:Destroy()
            assert(not root.Enabled and controller.connectionCount()==0,'Target destruction left live subscriptions: '..kind)
            assert(not root:FindFirstChild('FramebridgePromptInput') and not root:FindFirstChild('FramebridgeWorldScale',true),'Target destruction left helpers: '..kind)
        end)
        if controller then controller.destroy() end
        folder:Destroy();target:Destroy();assert(ok,why)
    end
end)
test('game prompt binding preserves settings and scripts across updates, rebinding and real Undo',function()
    local history=game:GetService('ChangeHistoryService')
    local baseline=history:TryBeginRecording('FramebridgeWorldQASetup','Create world QA fixture');assert(baseline)
    local destination=Instance.new('Folder');destination.Name='FramebridgeWorldQA';destination.Parent=game:GetService('StarterGui')
    local first=Instance.new('Part');first.Name='FramebridgeWorldQA';first.Anchored=true;first.Parent=workspace
    local second=first:Clone();second.Parent=workspace
    local third=first:Clone();third.Parent=workspace
    local external=Instance.new('ProximityPrompt');external.Name='GamePrompt';external.Style=Enum.ProximityPromptStyle.Custom
    external.ActionText='Game action';external.ObjectText='Game object';external.KeyboardKeyCode=Enum.KeyCode.Q;external.HoldDuration=1.25;external.MaxActivationDistance=17;external.Parent=second
    external:SetAttribute('GameplayOwner','Application')
    local gameScript=Instance.new('Script');gameScript.Name='GameLogic';gameScript.Source='-- gameplay';gameScript.Parent=external
    local ok,why=pcall(function()
        local pkg=Importer.decode(game:GetService('HttpService'):JSONEncode(fixtures.prompt))
        local stage=Importer.stage(pkg,{},false,runtimeSource)
        local root=Importer.apply(stage,pkg,destination,false,first)[1]
        local reference=root:FindFirstChild('FramebridgeWorldTarget');local generated=reference.Value
        local app=gameScript:Clone();app.Parent=generated
        history:FinishRecording(baseline,Enum.FinishRecordingOperation.Commit);baseline=nil
        local function preserved()
            assert(external.Parent==second and external.Enabled and external.Style==Enum.ProximityPromptStyle.Custom)
            assert(external.ActionText=='Game action' and external.ObjectText=='Game object' and external.KeyboardKeyCode==Enum.KeyCode.Q and external.HoldDuration==1.25 and external.MaxActivationDistance==17)
            assert(gameScript.Parent==external and external:GetAttribute('GameplayOwner')=='Application' and external:GetAttribute('FramebridgeSource')==nil,'Game prompt ownership or scripts changed')
        end
        local failing={TryBeginRecording=function()return 'binding-failure'end,FinishRecording=function(_,_,op)if op==Enum.FinishRecordingOperation.Commit then error('binding commit failure')end end}
        assert(not pcall(WorldTools.run,{root,external},'bind',{},failing,runtimeSource))
        assert(reference.Value==generated and generated.Enabled and not root:FindFirstChild('FramebridgeOwnedPrompt'),'Binding rollback changed the original prompt');preserved()
        WorldTools.run({root,external},'bind',{},history,runtimeSource)
        local backup=root:FindFirstChild('FramebridgeOwnedPrompt')
        assert(reference.Value==external and root.Adornee==second and not generated.Enabled and backup.Value==generated and app.Parent==generated)
        preserved()
        history:Undo();task.wait();assert(reference.Value==generated and generated.Enabled and root.Adornee==first,'External binding Undo lost the old prompt');preserved()
        history:Redo();task.wait();backup=root:FindFirstChild('FramebridgeOwnedPrompt');assert(reference.Value==external and not generated.Enabled and backup.Value==generated,'External binding Redo lost its backup')
        local recording=history:TryBeginRecording('FramebridgeWorldQAUpdate','Update world QA fixture');assert(recording)
        pkg.roots[1].name='Updated custom prompt UI';pkg.roots[1].worldUI.prompt.actionText='Figma action'
        local updated=Importer.apply(Importer.stage(pkg,{},false,runtimeSource),pkg,destination,true,third)[1]
        history:FinishRecording(recording,Enum.FinishRecordingOperation.Commit)
        assert(updated==root and root.Name=='Updated custom prompt UI' and reference.Value==external and root.Adornee==second,'Reimport replaced the game binding')
        assert(not generated.Enabled and app.Parent==generated and generated.ActionText=='Figma action','Reimport did not prepare the suspended generated prompt');preserved()
        WorldTools.run({root,third},'bind',{},history,runtimeSource)
        assert(reference.Value==generated and generated.Enabled and generated.Parent==third and app.Parent==generated and root.Adornee==third and generated.ActionText=='Figma action','Rebinding lost the generated prompt or its updated settings');preserved()
        history:Undo();task.wait();assert(reference.Value==external and not generated.Enabled and generated.Parent==first and root.Adornee==second,'Rebinding Undo lost the external binding');preserved()
        history:Redo();task.wait();assert(reference.Value==generated and generated.Enabled and generated.Parent==third and app.Parent==generated,'Rebinding Redo lost the owned prompt');preserved()
    end)
    if baseline then history:FinishRecording(baseline,Enum.FinishRecordingOperation.Cancel) end
    destination:Destroy();first:Destroy();second:Destroy();third:Destroy();assert(ok,why)
end)
test('direct custom game prompt adoption supports Model targets without mutating gameplay',function()
    local destination=Instance.new('Folder');local model=Instance.new('Model');model.Name='FramebridgeWorldQA';model.Parent=workspace
    local part=Instance.new('Part');part.Parent=model;model.PrimaryPart=part
    local prompt=Instance.new('ProximityPrompt');prompt.Style=Enum.ProximityPromptStyle.Custom;prompt.ActionText='Keep this';prompt.HoldDuration=2;prompt.Parent=model
    local stage,controller
    local ok,why=pcall(function()
        stage=Importer.stage(fixtures.prompt,{},false,runtimeSource)
        local root,stats=Importer.apply(stage,fixtures.prompt,destination,false,prompt)
        assert(root[1].Adornee==part and root[1]:FindFirstChild('FramebridgeWorldTarget').Value==prompt)
        assert(#model:GetChildren()==2 and prompt.Parent==model and prompt.ActionText=='Keep this' and prompt.HoldDuration==2 and prompt:GetAttribute('FramebridgeSource')==nil)
        controller=Runtime.mount(root[1],{manualMotion=true});controller.destroy();controller=nil
        assert(prompt.Parent==model and prompt.Enabled,'Runtime cleanup changed a game prompt')
        local invalid=Importer.stage(fixtures.prompt,{},false,runtimeSource)
        prompt.Style=Enum.ProximityPromptStyle.Default
        assert(not pcall(Importer.apply,invalid,fixtures.prompt,destination,false,prompt));Importer.destroy(invalid)
        assert(#destination:GetChildren()==1,'Invalid game prompt changed the destination')
    end)
    if controller then controller.destroy() end
    destination:Destroy();model:Destroy();assert(ok,why)
end)
return checks
