local Lifetime = {}
function Lifetime.read(expiresAt, now)
    local seconds = math.max(0, math.ceil((expiresAt - now) / 1000))
    local label
    if seconds == 0 then label = "Expired"
    elseif seconds >= 3600 then label = string.format("%dh %dm", math.floor(seconds/3600), math.floor(seconds%3600/60))
    elseif seconds >= 300 then label = string.format("%dm", math.ceil(seconds/60))
    else label = string.format("%d:%02d", math.floor(seconds/60), seconds%60) end
    return {seconds=seconds,soon=seconds<=300,label=label}
end
return Lifetime
