/**
 * Errors nobody reported (decision 0068): what pages hit in members' browsers, kept thirty days (client_errors, 00469),
 * grouped by fingerprint, the same short id a member's Get help sends (shell/client-error.ts errorIdOf), so a bug report
 * lands on its error's group. Each group says first and last seen, how many times, how many people, on which builds
 * and devices; a group nobody hit for a day reads quiet. Pure.
 */
import { agoWords, DAY_MS } from "../shared/time";
import type { ClientErrorDto } from "./health";
import { pageWords, reportCode, type SupportReportDto } from "./support";

export interface ErrorGroupVM {
  fingerprint: string;
  name: string;
  message: string;
  page: string;
  boundary: string;
  events: number;
  people: number;
  builds: string[];
  /** The build it was first seen on in the window: "since 3de53f9". */
  since: string | null;
  devices: { desk: number; phone: number };
  firstMs: number;
  lastMs: number;
  first: string;
  last: string;
  /** Nobody hit it for a day. */
  quiet: boolean;
  /** The members' reports that name it (Get help's "Something isn't working"), by their codes. */
  reports: string[];
}

export interface ErrorGroupsVM {
  groups: ErrorGroupVM[];
  events: number;
  people: number;
  /** Events by build, newest build first, as the beacon named them. */
  builds: Array<{ build: string; events: number; groups: number }>;
  read: boolean;
}

const short = (build: string | null) => (build ? build.slice(0, 9) : null);

/** The window's errors grouped, the most people first, then the most events. */
export function errorGroupsOf(
  rows: readonly ClientErrorDto[] | null,
  reports: readonly SupportReportDto[] | null,
  nowMs: number,
): ErrorGroupsVM {
  const by = new Map<string, ClientErrorDto[]>();
  for (const r of rows ?? []) by.set(r.fingerprint, [...(by.get(r.fingerprint) ?? []), r]);
  const date = (ms: number) =>
    new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  const groups = [...by.entries()].map(([fingerprint, list]): ErrorGroupVM => {
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
      builds: [...new Set(list.map((r) => short(r.build)).filter((b): b is string => !!b))],
      since: short(earliest?.build ?? null),
      devices: {
        desk: list.filter((r) => r.device === "desk").length,
        phone: list.filter((r) => r.device === "phone").length,
      },
      firstMs,
      lastMs,
      first: date(firstMs),
      last: agoWords(lastMs, nowMs, { dateAfterMs: 2 * DAY_MS, date }),
      quiet: nowMs - lastMs > DAY_MS,
      reports: (reports ?? []).filter((x) => x.error_id === fingerprint).map((x) => reportCode(x.number)),
    };
  });
  groups.sort((a, b) => Number(a.quiet) - Number(b.quiet) || b.people - a.people || b.events - a.events);
  const builds = new Map<string, { events: number; groups: Set<string>; lastMs: number }>();
  for (const r of rows ?? []) {
    const b = short(r.build) ?? "unknown";
    const was = builds.get(b) ?? { events: 0, groups: new Set<string>(), lastMs: 0 };
    was.events += 1;
    was.groups.add(r.fingerprint);
    was.lastMs = Math.max(was.lastMs, Date.parse(r.at));
    builds.set(b, was);
  }
  return {
    groups,
    events: (rows ?? []).length,
    people: new Set((rows ?? []).map((r) => r.member_key).filter(Boolean)).size,
    builds: [...builds.entries()]
      .sort((a, b) => b[1].lastMs - a[1].lastMs)
      .map(([build, v]) => ({ build, events: v.events, groups: v.groups.size })),
    read: rows !== null,
  };
}

/** A group as a bug report says it, for the inbox or a ticket: plain text, no person in it. */
export function errorGroupReport(g: ErrorGroupVM): string {
  return [
    `${g.name}: ${g.message}`,
    `Page: ${g.page} · boundary ${g.boundary}`,
    `Seen ${g.events} times by ${g.people} ${g.people === 1 ? "person" : "people"}, first ${g.first}, last ${g.last}`,
    `Builds: ${g.builds.join(", ") || "unknown"} · desk ${g.devices.desk}, phone ${g.devices.phone}`,
    g.reports.length ? `Reported by members: ${g.reports.join(", ")}` : null,
    `Fingerprint: ${g.fingerprint}`,
  ]
    .filter(Boolean)
    .join("\n");
}
