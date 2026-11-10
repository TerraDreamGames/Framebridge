-- Observe real UI Undo/Redo without an intervening automation/history recording.
local function observeNativeHistory(qa,snapshot)
 qa.historyEvents,qa.historyConnections={},{}
 local function observe(kind,waypoint)
  task.defer(function()
   if qa.historyDisposed then return end
   local ok,result=pcall(snapshot)
   table.insert(qa.historyEvents,{kind=kind,waypoint=waypoint,ok=ok,result=result})
  end)
 end
 local history=game:GetService("ChangeHistoryService")
 table.insert(qa.historyConnections,history.OnUndo:Connect(function(waypoint)observe("undo",waypoint)end))
 table.insert(qa.historyConnections,history.OnRedo:Connect(function(waypoint)observe("redo",waypoint)end))
end
