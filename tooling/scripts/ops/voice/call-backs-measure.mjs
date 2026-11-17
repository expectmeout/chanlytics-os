/**
 * How the call backs came to be, and what became of them (decision 0136): a count, read-only.
 *
 * A call that needed a person, or that reached no answer, opens a `callback` hold on the caller's thread. Decision 0136
 * says three kinds of call ask for none (a caller a member said is not a customer, one the carrier flagged, and silence
 * from a toll-free number the business does not talk with), and lets a silent call's hold go after a week. This counts
 * the holds of the last days by the things those rules read, so the rules can be judged against what happened: how many
 * were asked by silence and how many by words, from what kind of number, from someone the owner brought in or named, and
 * how each ended: still waiting, closed by a person, or closed by the platform.
 *
 *   NEXT_PUBLIC_SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node --import tsx tooling/scripts/ops/voice/call-backs-measure.mjs [--days 90] [--tenant <uuid>] [--json]
 *
 * Read-only: it selects from escalations, conversations and contacts as the service role (no session reads across
 * workspaces) and writes nothing, so it has no dry run to leave. It prints counts alone, never a number or a name. What
 * it cannot see from three tables it does not claim: "the business talks with them" is read here from how the person
 * came to be on record and who named them, not from the messages and calls the live rule also reads, so the stranger
 * count is an upper bound. Exits 2 when it could not read.
 */
import { pathToFileURL } from "node:url";
import { DAY_MS, NEED_YOU_OLD_MS, callerStandingOf, saysUnansweredCall, tollFreeNumber } from "@chanlytics/contracts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Rows a read asks for at once, and ids a read names at once (a URL holds about two hundred uuids). */
const PAGE = 1000;
const IDS = 150;

/** What asked for the call back: silence (a missed call, a hang-up without a word), or something they said. */
const askedBy = (hold) => (saysUnansweredCall(hold.details) ? "silence" : "words");
/** The kind of number that rang. */
const numberOf = (person) =>
  !person?.phone_e164 ? "withheld" : tollFreeNumber(person.phone_e164) ? "toll_free" : "other";
/** How the hold ended: still open (and past its week or not), closed by a member, or by the platform with nobody named. */
function endingOf(hold, nowMs) {
  if (hold.state === "open")
    return nowMs - Date.parse(hold.updated_at ?? hold.created_at) >= NEED_YOU_OLD_MS ? "open_past_a_week" : "open";
  return hold.resolved_by_user_id ? "closed_by_a_person" : "closed_by_the_platform";
}

/**
 * The count: every hold once in each table, and the cell decision 0136's own rule names apart (silence, toll-free, a
 * stranger) with how those ended. `threads` and `people` are by id.
 */
export function measureCallBacks(holds, threads, people, nowMs) {
  const tally = (acc, k) => ((acc[k] = (acc[k] ?? 0) + 1), acc);
  const rows = holds.map((hold) => {
    const thread = threads.get(hold.conversation_id);
    const person = thread?.contact_id ? people.get(thread.contact_id) : null;
    const standing = callerStandingOf({
      setAsideAt: thread?.set_aside_at ?? null,
      setAsideWhy: thread?.set_aside_why ?? null,
      lastWord: null,
      wrote: false,
      phoned: false,
      acquiredVia: person?.acquired_via ?? null,
      nameSource: person?.name_source ?? null,
    });
    return {
      asked: askedBy(hold),
      number: numberOf(person),
      who:
        standing.said === "not_a_customer" ? "said_not_a_customer" : standing.talks ? "brought_or_named" : "only_rang",
      ending: endingOf(hold, nowMs),
    };
  });
  const by = (key) => rows.map((r) => r[key]).reduce(tally, {});
  const ruled = rows.filter((r) => r.asked === "silence" && r.number === "toll_free" && r.who === "only_rang");
  const quiet = rows.filter((r) => r.asked === "silence" && r.who === "only_rang");
  return {
    holds: rows.length,
    asked_by: by("asked"),
    number: by("number"),
    who: by("who"),
    ending: by("ending"),
    silent_toll_free_stranger: { holds: ruled.length, ending: ruled.map((r) => r.ending).reduce(tally, {}) },
    silent_stranger: { holds: quiet.length, ending: quiet.map((r) => r.ending).reduce(tally, {}) },
  };
}

/** The count in words an operator reads. */
export function measureText(measured, days) {
  const line = (title, counts) =>
    `${title}: ${
      Object.entries(counts)
        .sort(([, a], [, b]) => b - a)
        .map(([k, n]) => `${k.replace(/_/g, " ")} ${n}`)
        .join(", ") || "none"
    }`;
  return [
    `Call backs opened in the last ${days} days: ${measured.holds}`,
    line("  Asked by", measured.asked_by),
    line("  From", measured.number),
    line("  Who", measured.who),
    line("  Ended", measured.ending),
    "",
    `Silence from a toll-free number that only ever rang (no hold from now on): ${measured.silent_toll_free_stranger.holds}`,
    line("  Ended", measured.silent_toll_free_stranger.ending),
    `Silence from anyone who only ever rang (let go after a week from now on): ${measured.silent_stranger.holds}`,
    line("  Ended", measured.silent_stranger.ending),
    "",
    "Closed by a person: someone rang them back, or marked it done. A high share there says the rule would hide calls worth making.",
  ].join("\n");
}

async function main() {
  const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const arg = (name) => {
    const at = process.argv.indexOf(name);
    return at < 0 ? null : (process.argv[at + 1] ?? "");
  };
  const fail = (why) => {
    console.error(why);
    process.exit(2);
  };
  const days = Number(arg("--days") ?? 90);
  const tenant = arg("--tenant");
  if (!URL_ || !KEY) fail("NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY are required");
  if (!Number.isFinite(days) || days <= 0 || (tenant !== null && !UUID.test(tenant)))
    fail("usage: [--days 90] [--tenant <uuid>] [--json]");

  const rest = async (path) => {
    const res = await fetch(`${URL_}/rest/v1/${path}`, { headers: { apikey: KEY, authorization: `Bearer ${KEY}` } });
    if (!res.ok) fail(`${path.split("?")[0]} ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return res.json();
  };
  const nowMs = Date.now();
  const since = new Date(nowMs - days * DAY_MS).toISOString();
  const holds = [];
  for (let from = 0; ; from += PAGE) {
    const page = await rest(
      `escalations?reason=eq.callback&created_at=gte.${since}${tenant ? `&tenant_id=eq.${tenant}` : ""}` +
        "&select=id,conversation_id,details,state,created_at,updated_at,resolved_by_user_id" +
        `&order=created_at.asc,id.asc&limit=${PAGE}&offset=${from}`,
    );
    holds.push(...page);
    if (page.length < PAGE) break;
  }
  const byId = async (table, ids, select) => {
    const rows = new Map();
    for (let at = 0; at < ids.length; at += IDS)
      for (const row of await rest(`${table}?id=in.(${ids.slice(at, at + IDS).join(",")})&select=${select}`))
        rows.set(row.id, row);
    return rows;
  };
  const threads = await byId(
    "conversations",
    [...new Set(holds.map((h) => h.conversation_id))],
    "id,contact_id,set_aside_at,set_aside_why",
  );
  const people = await byId(
    "contacts",
    [...new Set([...threads.values()].map((t) => t.contact_id).filter(Boolean))],
    "id,phone_e164,acquired_via,name_source",
  );
  const measured = measureCallBacks(holds, threads, people, nowMs);
  console.log(process.argv.includes("--json") ? JSON.stringify(measured, null, 2) : measureText(measured, days));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) await main();
