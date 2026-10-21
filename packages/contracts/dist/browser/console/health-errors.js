import { agoWords, DAY_MS } from "../shared/time.js";
import { pageWords, reportCode } from "./support.js";
const short = (build) => build ? build.slice(0, 9) : null;
export function errorGroupsOf(rows, reports, nowMs) {
  const by = /* @__PURE__ */ new Map();
  for (const r of rows ?? []) by.set(r.fingerprint, [...by.get(r.fingerprint) ?? [], r]);
  const date = (ms) => new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  const groups = [...by.entries()].map(([fingerprint, list]) => {
    const times = list.map((r) => Date.parse(r.at)).sort((a, b) => a - b);
    const firstMs = times[0] ?? nowMs;
    const lastMs = times[times.length - 1] ?? nowMs;
    const earliest = [...list].sort((a, b) => Date.parse(a.at) - Date.parse(b.at))[0];
    const head = list[0];
    return {
      fingerprint,
      name: head?.name ?? "Error",
      message: (head?.message ?? "").split(/\r?\n/)[0] ?? "",
      page: pageWords(head?.page),
      boundary: head?.boundary ?? "",
      events: list.length,
      people: new Set(list.map((r) => r.member_key).filter(Boolean)).size,
      builds: [...new Set(list.map((r) => short(r.build)).filter((b) => !!b))],
      since: short(earliest?.build ?? null),
      devices: {
        desk: list.filter((r) => r.device === "desk").length,
        phone: list.filter((r) => r.device === "phone").length
      },
      firstMs,
      lastMs,
      first: date(firstMs),
      last: agoWords(lastMs, nowMs, { dateAfterMs: 2 * DAY_MS, date }),
      quiet: nowMs - lastMs > DAY_MS,
      reports: (reports ?? []).filter((x) => x.error_id === fingerprint).map((x) => reportCode(x.number))
    };
  });
  groups.sort((a, b) => Number(a.quiet) - Number(b.quiet) || b.people - a.people || b.events - a.events);
  const builds = /* @__PURE__ */ new Map();
  for (const r of rows ?? []) {
    const b = short(r.build) ?? "unknown";
    const was = builds.get(b) ?? { events: 0, groups: /* @__PURE__ */ new Set(), lastMs: 0 };
    was.events += 1;
    was.groups.add(r.fingerprint);
    was.lastMs = Math.max(was.lastMs, Date.parse(r.at));
    builds.set(b, was);
  }
  return {
    groups,
    events: (rows ?? []).length,
    people: new Set((rows ?? []).map((r) => r.member_key).filter(Boolean)).size,
    builds: [...builds.entries()].sort((a, b) => b[1].lastMs - a[1].lastMs).map(([build, v]) => ({ build, events: v.events, groups: v.groups.size })),
    read: rows !== null
  };
}
export function errorGroupReport(g) {
  return [
    `${g.name}: ${g.message}`,
    `Page: ${g.page} \xB7 boundary ${g.boundary}`,
    `Seen ${g.events} times by ${g.people} ${g.people === 1 ? "person" : "people"}, first ${g.first}, last ${g.last}`,
    `Builds: ${g.builds.join(", ") || "unknown"} \xB7 desk ${g.devices.desk}, phone ${g.devices.phone}`,
    g.reports.length ? `Reported by members: ${g.reports.join(", ")}` : null,
    `Fingerprint: ${g.fingerprint}`
  ].filter(Boolean).join("\n");
}
