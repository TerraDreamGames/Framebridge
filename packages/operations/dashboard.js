const $ = (id) => document.getElementById(id),
  format = new Intl.NumberFormat(),
  text = (id, value) => {
    $(id).textContent = value;
  },
  number = (value) => (value == null ? "—" : format.format(value)),
  bytes = (value) =>
    value == null
      ? "—"
      : value < 1024
        ? number(value) + " B"
        : value < 1048576
          ? (value / 1024).toFixed(1) + " KiB"
          : (value / 1048576).toFixed(2) + " MiB",
  time = (value) =>
    new Date(value).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
let period = "24h",
  busy = false,
  sequence = 0;
let usageDays = [];
let usageRevision = "";
const shortDate = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});
const dateLabel = (date) => shortDate.format(new Date(date + "T00:00:00Z"));
function element(tag, content, className) {
  const node = document.createElement(tag);
  if (content != null) node.textContent = content;
  if (className) node.className = className;
  return node;
}
function chart(data) {
  const host = $("chart");
  host.replaceChildren();
  if (!data.hourly.length) {
    host.append(
      element("p", "No invocations reported in this period.", "muted"),
    );
    return;
  }
  const ns = "http://www.w3.org/2000/svg",
    svg = document.createElementNS(ns, "svg"),
    W = 680,
    H = 200,
    left = 47,
    bottom = 28,
    top = 13,
    start = Math.floor(Date.parse(data.periodStart) / 3600000) * 3600000,
    end = Math.ceil(Date.parse(data.periodEnd) / 3600000) * 3600000,
    bins = Math.max(1, (end - start) / 3600000),
    max = Math.max(1, ...data.hourly.map((r) => r.requests));
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("role", "img");
  svg.setAttribute(
    "aria-label",
    "Hourly requests. " +
      number(data.requests) +
      " requests in the selected period.",
  );
  function draw(tag, attrs, content) {
    const node = document.createElementNS(ns, tag);
    for (const [key, value] of Object.entries(attrs))
      node.setAttribute(key, value);
    if (content != null) node.textContent = content;
    svg.append(node);
    return node;
  }
  for (let i = 0; i <= 3; i++) {
    const y = top + ((H - bottom - top) * i) / 3;
    draw("line", { x1: left, x2: W - 8, y1: y, y2: y, stroke: "#343434" });
    draw(
      "text",
      {
        x: left - 9,
        y: y + 4,
        fill: "#a1a1a6",
        "font-size": 10,
        "text-anchor": "end",
      },
      number(Math.round(max * (1 - i / 3))),
    );
  }
  const width = (W - left - 8) / bins;
  data.hourly.forEach((row) => {
    const index = (Date.parse(row.time) - start) / 3600000,
      height = (row.requests / max) * (H - bottom - top),
      bar = draw("rect", {
        x: left + index * width + 1,
        y: H - bottom - height,
        width: Math.max(1, width - 2),
        height: Math.max(height, 1),
        fill: "#348ce6",
        rx: 2,
        tabindex: 0,
      });
    const label =
      new Date(row.time).toLocaleString() +
      ": " +
      number(row.requests) +
      " requests, " +
      number(row.errors) +
      " exceptions";
    bar.setAttribute("aria-label", label);
    const title = document.createElementNS(ns, "title");
    title.textContent = label;
    bar.append(title);
    bar.addEventListener("focus", () => text("traffic-freshness", label));
  });
  const label = (value) =>
    new Date(value).toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  draw(
    "text",
    { x: left, y: H - 5, fill: "#a1a1a6", "font-size": 10 },
    label(data.periodStart),
  );
  draw(
    "text",
    {
      x: W - 8,
      y: H - 5,
      fill: "#a1a1a6",
      "font-size": 10,
      "text-anchor": "end",
    },
    label(data.periodEnd),
  );
  host.append(svg);
}
function showFunnel() {
  const cohort = usageDays.find(
    (day) => day.date === $("onboarding-cohort").value,
  );
  const host = $("onboarding-steps");
  host.replaceChildren();
  text("onboarding-choices", "");
  if (!cohort?.onboarding.opened) {
    text(
      "onboarding-summary",
      "Waiting for onboarding reports from opted-in Figma users.",
    );
    return;
  }
  const events = cohort.onboarding;
  const steps = [
    ["opened", "Opened onboarding"],
    ["tutorialOffered", "Reached tutorial prompt"],
    ["tutorialStarted", "Started tutorial"],
    ["previewReached", "Reached Roblox preview lesson"],
    ["studioReached", "Reached Studio lesson"],
    ["tutorialCompleted", "Completed tutorial"],
  ];
  const started = events.tutorialStarted ?? 0;
  const completion = started
    ? Math.round((100 * (events.tutorialCompleted ?? 0)) / started) +
      "% completed"
    : "No tutorial starts";
  text(
    "onboarding-summary",
    completion +
      (started ? " among " + number(started) + " tutorial starters" : "") +
      (cohort.followUpOpen
        ? " · Follow-up in progress"
        : " · Follow-up closed"),
  );
  let previous;
  for (const [event, label] of steps) {
    const count = events[event] ?? 0;
    const row = element("li");
    const heading = element("div", null, "funnel-label");
    heading.append(element("span", label), element("b", number(count)));
    const bar = element("progress");
    bar.max = events.opened;
    bar.value = count;
    bar.setAttribute("aria-label", label);
    row.append(heading, bar);
    if (previous && previous > count) {
      row.append(
        element(
          "small",
          number(previous - count) + " fewer reached this step",
          "muted",
        ),
      );
    }
    host.append(row);
    previous = count;
  }
  text(
    "onboarding-choices",
    [
      [events.signInStarted, "started Roblox sign-in"],
      [events.connectedAtTutorial, "connected at tutorial prompt"],
      [events.continuedWithoutRoblox, "continued without Roblox"],
      [events.tutorialSkipped, "skipped tutorial"],
    ]
      .map(([count, label]) => number(count ?? 0) + " " + label)
      .join(" · "),
  );
}
function showFigmaUsage(data, relayAvailable) {
  const revision = JSON.stringify(data ?? relayAvailable);
  if (revision === usageRevision) return;
  usageRevision = revision;
  usageDays = data?.days ?? [];
  const today = usageDays.at(-1);
  const historical = usageDays.slice(0, -1);
  const host = $("figma-history");
  const countsOpen = host.querySelector("details")?.open;
  const select = $("onboarding-cohort");
  const selected = select.value;
  const cohorts = usageDays.filter((day) => day.onboarding.opened).reverse();
  select.replaceChildren(
    ...(cohorts.length
      ? cohorts.map((day) => {
          const option = element("option", dateLabel(day.date));
          option.value = day.date;
          return option;
        })
      : [element("option", "No cohorts yet")]),
  );
  select.disabled = !cohorts.length;
  if (cohorts.some((day) => day.date === selected)) select.value = selected;
  text("figma-today", number(today?.installations));
  text(
    "figma-today-label",
    today ? dateLabel(today.date) + " · Today so far" : "Today",
  );
  host.replaceChildren();
  const reported = usageDays.filter((day) => day.installations !== null);
  if (!reported.length) {
    host.append(
      element(
        "p",
        data
          ? "No usage reports yet. Data appears after users opt in on the updated plugin."
          : relayAvailable
            ? "Usage metrics require the updated Framebridge relay."
            : "Usage metrics are currently unavailable.",
        "muted",
      ),
    );
  } else {
    const max = Math.max(1, ...reported.map((day) => day.installations));
    const chart = element("div", null, "usage-bars");
    for (const day of usageDays) {
      const bar = element("meter");
      bar.max = max;
      bar.value = day.installations ?? 0;
      bar.title =
        dateLabel(day.date) + ": " + (day.installations ?? "No reports");
      bar.setAttribute("aria-label", bar.title);
      chart.append(bar);
    }
    const range = element("div", null, "funnel-label muted");
    range.append(
      element("span", dateLabel(usageDays[0].date)),
      element("span", dateLabel(today.date)),
    );
    const details = element("details", null, "daily-counts");
    details.open = !!countsOpen;
    details.append(element("summary", "Daily counts"));
    const list = element("dl");
    for (const day of [today, ...historical.reverse()]) {
      const row = element("div");
      row.append(
        element("dt", dateLabel(day.date)),
        element("dd", number(day.installations)),
      );
      list.append(row);
    }
    details.append(list);
    host.append(chart, range, details);
  }
  showFunnel();
}
function show(data) {
  $("messages").replaceChildren();
  for (const part of [data.application, data.traffic])
    if (!part.available)
      $("messages").append(element("p", part.error, "warning"));
  text("environment", data.worker + " · Cloudflare");
  for (const [id, key] of [
    ["worker-link", "worker"],
    ["storage-link", "storage"],
    ["billing-link", "billing"],
  ])
    $(id).href = data.links[key];
  const app = data.application.available ? data.application.data : null;
  showFigmaUsage(app?.figmaUsage, !!app);
  text("online", number(app?.connections.studioOnline));
  text("paired", number(app?.connections.paired));
  text(
    "session-slots",
    app
      ? number(app.connections.retained) +
          " / " +
          number(app.connections.capacity)
      : "—",
  );
  text("upload-sessions", number(app?.connections.uploadOnly));
  text("accounts", number(app?.accounts));
  text("sqlite", bytes(app?.storage.sqliteBytes));
  text("app-freshness", app ? "As of " + time(app.observedAt) : "Unavailable");
  text(
    "artwork-status",
    app ? (app.storage.cloudArtworkEnabled ? "Enabled" : "Disabled") : "—",
  );
  $("artwork-usage-row").hidden = !app?.storage.cloudArtworkEnabled;
  const artwork = app?.storage.artwork ?? [];
  text(
    "artwork-usage",
    number(artwork.reduce((n, row) => n + row.objects, 0)) +
      " / " +
      bytes(artwork.reduce((n, row) => n + row.bytes, 0)),
  );
  text(
    "storage-note",
    !app
      ? "Storage metrics unavailable."
      : app.storage.cloudArtworkEnabled
        ? "Tracked artwork metadata includes pending uploads and cleanup. See Cloudflare R2 for billable storage and bucket operations."
        : "Cloud artwork is disabled for this backend. Roblox image uploads are stored by Roblox; they do not use an R2/S3 bucket.",
  );
  $("uploads").replaceChildren();
  for (const [state, label] of [
    ["uploading", "In progress"],
    ["done", "Completed"],
    ["failed", "Failed"],
  ]) {
    const span = element("span", label);
    span.append(
      element(
        "b",
        app
          ? number(
              app.uploads.retained.find((r) => r.state === state)?.count ?? 0,
            )
          : "—",
      ),
    );
    $("uploads").append(span);
  }
  $("quotas").replaceChildren();
  for (const quota of app?.quotas ?? []) {
    const row = element("div", null, "quota"),
      label = element("div", null, "quota-label"),
      meter = element("meter");
    label.append(
      element(
        "span",
        {
          requests: "Requests",
          transfers: "Transfers",
          uploads: "Image uploads",
        }[quota.name],
      ),
      element("span", number(quota.used) + " / " + number(quota.maximum)),
    );
    meter.min = 0;
    meter.max = quota.maximum;
    meter.value = quota.used;
    meter.low = quota.maximum * 0.8;
    meter.high = quota.maximum * 0.95;
    meter.optimum = 0;
    meter.setAttribute(
      "aria-label",
      quota.name + ": " + quota.used + " of " + quota.maximum,
    );
    row.append(label, meter);
    $("quotas").append(row);
  }
  text(
    "quota-reset",
    app
      ? "Resets " +
          new Date(app.quotaResetsAt).toLocaleString() +
          " (00:00 UTC)"
      : "Usage unavailable",
  );
  text(
    "monitoring-since",
    app
      ? "Connection tracking enabled " +
          new Date(app.monitoringSince).toLocaleString() +
          "."
      : "",
  );
  const traffic = data.traffic.available ? data.traffic.data : null;
  text("requests", number(traffic?.requests));
  text("errors", number(traffic?.errors));
  text("subrequests", number(traffic?.subrequests));
  text(
    "traffic-period",
    { "1h": "Past hour", "24h": "Past 24 hours", "7d": "Past 7 days" }[
      data.period
    ],
  );
  text(
    "error-rate",
    traffic && traffic.requests
      ? ((traffic.errors / traffic.requests) * 100).toFixed(2) +
          "% of invocations"
      : "Cloudflare invocation failures",
  );
  text(
    "traffic-freshness",
    traffic ? "Analytics fetched " + time(traffic.observedAt) : "Unavailable",
  );
  if (traffic) chart(traffic);
  else {
    $("chart").replaceChildren(
      element("p", "Traffic analytics unavailable.", "muted"),
    );
  }
  text("refresh-status", "Updated " + time(data.generatedAt));
}
async function refresh() {
  if (busy) return;
  busy = true;
  const selected = period,
    version = ++sequence;
  $("refresh").disabled = true;
  try {
    const response = await fetch("/api/snapshot?period=" + selected, {
      cache: "no-store",
    });
    if (!response.ok)
      throw new Error("Dashboard unavailable. Check the local server.");
    const data = await response.json();
    if (version === sequence && selected === period) show(data);
  } catch (error) {
    text("refresh-status", "Update failed");
    $("messages").replaceChildren(
      element(
        "p",
        error.message + " Previously displayed values may be stale.",
        "warning",
      ),
    );
  } finally {
    busy = false;
    $("refresh").disabled = false;
    if (selected !== period) refresh();
  }
}
$("refresh").addEventListener("click", refresh);
$("onboarding-cohort").addEventListener("change", showFunnel);
document.querySelectorAll("[data-period]").forEach((button) =>
  button.addEventListener("click", () => {
    period = button.dataset.period;
    document
      .querySelectorAll("[data-period]")
      .forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
    refresh();
  }),
);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) refresh();
});
setInterval(() => {
  if (!document.hidden) refresh();
}, 30000);
refresh();
