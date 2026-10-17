import { poolListContext, poolRowsOf } from "../../people/audience-pool.js";
import { membersOf, resolveList } from "../../people/lists/lists.js";
import { QUIET_AFTER_DAYS } from "../../people/person-state.js";
const FRESH_BUCKETS = [
  { key: "under_7", before: 7 },
  { key: "d7_30", before: QUIET_AFTER_DAYS + 1 },
  { key: "d31_60", before: 61 },
  { key: "d61_90", before: 91 }
];
function freshBucketOf(heardDays) {
  if (heardDays === null) return "never";
  return FRESH_BUCKETS.find((b) => heardDays < b.before)?.key ?? "d91_up";
}
function freshCountsOf(vms) {
  const fresh = { under_7: 0, d7_30: 0, d31_60: 0, d61_90: 0, d91_up: 0, never: 0 };
  for (const v of vms) fresh[freshBucketOf(v.heardDays)] += 1;
  return fresh;
}
const BOOK_CONTEXT = poolListContext({ calendar: "none", dealsOn: false, consultFirst: false, viewer: null });
function listCountOf(id, vms) {
  const def = resolveList({ kind: "builtin", id }, []);
  const members = def ? membersOf(def, vms, BOOK_CONTEXT) : null;
  if (members?.state !== "ok") throw new Error(`People's list ${id} cannot be counted without a viewer`);
  return members.ids.size;
}
function listCountsOf(vms) {
  return {
    opted_in: listCountOf("opted_in", vms),
    offers_ok: listCountOf("offers_ok", vms),
    opted_out: listCountOf("opted_out", vms),
    quiet: listCountOf("quiet", vms)
  };
}
function stepCountsOf(vms) {
  const standing = (due) => vms.filter((v) => v.nextStep?.due === due).length;
  return { overdue: standing("past"), due_today: standing("today") };
}
const ONLY_WIRE = {
  whatsapp: "whatsapp_only",
  sms: "sms_only",
  voice: "phone_only",
  email: "email_only"
};
function wireBucketOf(channels) {
  const first = channels.at(0);
  if (first === void 0) return "none";
  return channels.length > 1 ? "several" : ONLY_WIRE[first];
}
function wireCountsOf(vms) {
  const wires = { whatsapp_only: 0, sms_only: 0, phone_only: 0, email_only: 0, several: 0, none: 0 };
  for (const v of vms) wires[wireBucketOf(v.channels)] += 1;
  return wires;
}
export function peopleNowOf(rows, o) {
  const vms = poolRowsOf(rows, { tz: o.tz, now: new Date(o.nowMs), viewer: null, dealsOn: false, ready: o.ready });
  return {
    people: vms.length,
    fresh: freshCountsOf(vms),
    lists: listCountsOf(vms),
    steps: stepCountsOf(vms),
    email_stopped: vms.filter((v) => v.emailSuppressed).length,
    wires: wireCountsOf(vms)
  };
}
