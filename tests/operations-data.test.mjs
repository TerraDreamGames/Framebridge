import { describe, expect, it } from "vitest";
import {
  analyticsQuery,
  readAnalytics,
  allowedDashboardRequest,
} from "../scripts/operations-data.mjs";
describe("operator analytics and loopback boundary", () => {
  const query = analyticsQuery(
    "account",
    "worker",
    "24h",
    Date.parse("2026-10-11T12:00:00Z"),
  );
  it("defines an exact rolling window and takes the provider total without averaging quantiles", () => {
    expect(query.variables.start).toBe("2026-10-10T12:00:00.000Z");
    const body = {
      data: {
        viewer: {
          accounts: [
            {
              hourly: [
                {
                  dimensions: { datetimeHour: "2026-10-10T13:00:00Z" },
                  sum: { requests: 7, errors: 1 },
                },
              ],
              totals: [
                {
                  sum: { requests: 7, errors: 1, subrequests: 2 },
                  quantiles: { cpuTimeP50: 800, cpuTimeP99: 5000 },
                },
              ],
            },
          ],
        },
      },
    };
    expect(readAnalytics(body, query)).toMatchObject({
      requests: 7,
      errors: 1,
      cpuP99Micros: 5000,
    });
  });
  it("distinguishes a successful empty dataset from denied/missing analytics", () => {
    expect(
      readAnalytics(
        { data: { viewer: { accounts: [{ hourly: [], totals: [] }] } } },
        query,
      ).requests,
    ).toBe(0);
    for (const result of [
      { errors: [{ message: "Denied" }] },
      { data: { viewer: { accounts: [] } } },
    ])
      expect(() => readAnalytics(result, query)).toThrow(/unavailable/);
    expect(() => analyticsQuery("account", "worker", "all")).toThrow();
  });
  it("rejects DNS rebinding hosts and cross-site access to the operator proxy", () => {
    for (const headers of [
      { host: "attacker.test:4319" },
      { host: "127.0.0.1:4319", origin: "https://evil.test" },
      { host: "127.0.0.1:4319", "sec-fetch-site": "cross-site" },
      { host: "localhost:4319", "sec-fetch-site": "same-site" },
    ])
      expect(allowedDashboardRequest({ headers }, 4319)).toBe(false);
    expect(
      allowedDashboardRequest(
        {
          headers: {
            host: "127.0.0.1:4319",
            origin: "http://127.0.0.1:4319",
            "sec-fetch-site": "same-origin",
          },
        },
        4319,
      ),
    ).toBe(true);
  });
});
