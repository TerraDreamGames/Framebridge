local cases={{7200000,"2h 0m",false},{3660000,"1h 1m",false},{300001,"6m",false},{300000,"5m",true},{299000,"4:59",true},{61000,"1:01",true},{1,"0:01",true},{0,"Expired",true},{-1000,"Expired",true}}
for _,case in ipairs(cases) do
    local remaining=Lifetime.read(10000+case[1],10000)
    assert(remaining.label==case[2] and remaining.soon==case[3], "Incorrect connection expiry label")
end
return {passed=#cases,failed=0,scope="Expiry formatting and five-minute warning boundaries"}
