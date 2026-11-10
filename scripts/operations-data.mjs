export const PERIODS = {
  "1h": 3_600_000,
  "24h": 86_400_000,
  "7d": 604_800_000,
};

export function analyticsQuery(account, worker, period, now = Date.now()) {
  if (!PERIODS[period]) throw new Error("Invalid reporting period.");
  return {
    query: `query($account: string, $worker: string, $start: string, $end: string) {
      viewer { accounts(filter: {accountTag: $account}) {
        hourly: workersInvocationsAdaptive(limit: 10000, filter: {scriptName: $worker, datetime_geq: $start, datetime_lt: $end}, orderBy: [datetimeHour_ASC]) {
          dimensions { datetimeHour } sum { requests errors subrequests }
        }
        totals: workersInvocationsAdaptive(limit: 1, filter: {scriptName: $worker, datetime_geq: $start, datetime_lt: $end}) {
          sum { requests errors subrequests } quantiles { cpuTimeP50 cpuTimeP99 }
        }
      } }
    }`,
    variables: {
      account,
      worker,
      start: new Date(now - PERIODS[period]).toISOString(),
      end: new Date(now).toISOString(),
    },
  };
}

/** Preserve provider aggregate quantiles; do not average hourly percentiles. */
export function readAnalytics(response, query) {
  const accounts = response.data?.viewer?.accounts;
  if (
    response.errors?.length ||
    !Array.isArray(accounts) ||
    accounts.length !== 1
  )
    throw new Error(
      "Cloudflare analytics unavailable. Check account Analytics Read access.",
    );
  const source = accounts[0],
    totals = source.totals;
  if (
    !Array.isArray(source.hourly) ||
    !Array.isArray(totals) ||
    totals.length > 1 ||
    source.hourly.length >= 10000
  )
    throw new Error("Cloudflare returned incomplete analytics.");
  const number = (value) => {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
      throw new Error("Cloudflare returned invalid analytics.");
    return value;
  };
  const sum = totals[0]?.sum;
  const cpu = totals[0]?.quantiles;
  // An authorized, successful empty dataset means no observed invocations. Errors never become zeros.
  return {
    periodStart: query.variables.start,
    periodEnd: query.variables.end,
    requests: sum ? number(sum.requests) : 0,
    errors: sum ? number(sum.errors) : 0,
    subrequests: sum ? number(sum.subrequests) : 0,
    cpuP50Micros: cpu ? number(cpu.cpuTimeP50) : null,
    cpuP99Micros: cpu ? number(cpu.cpuTimeP99) : null,
    hourly: source.hourly.map((row) => {
      const time = row.dimensions?.datetimeHour;
      if (typeof time !== "string" || !Number.isFinite(Date.parse(time)))
        throw new Error("Invalid analytics time.");
      return {
        time,
        requests: number(row.sum?.requests),
        errors: number(row.sum?.errors),
      };
    }),
  };
}

export function allowedDashboardRequest(request, port) {
  const host = request.headers.host;
  if (!["127.0.0.1:" + port, "localhost:" + port].includes(host)) return false;
  const origin = request.headers.origin;
  return (
    (!origin ||
      ["http://127.0.0.1:" + port, "http://localhost:" + port].includes(
        origin,
      )) &&
    !["cross-site", "same-site"].includes(request.headers["sec-fetch-site"])
  );
}
