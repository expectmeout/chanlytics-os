import { formatPhoneDisplay, samePhone } from "../shared/phone.js";
const trimmed = (v) => {
  const s = typeof v === "string" ? v.trim() : "";
  return s || null;
};
const activeChannel = (known, kind) => {
  const rows = known?.channels ?? [];
  const row = rows.find((c) => c.kind === kind && (c.status ?? "active") === "active");
  return trimmed(row?.number_e164);
};
const keptReaching = (known, line) => line ? trimmed((known?.forwarding ?? []).find((r) => trimmed(r.from_e164) && samePhone(r.to_e164, line))?.from_e164) : null;
export function knownForwarding(rows) {
  const out = [];
  for (const r of rows) {
    const from = trimmed(r.e164);
    if (r.kind === "forwarded" && from) out.push({ from_e164: from, to_e164: r.forwarding?.destination_e164 ?? null });
  }
  return out;
}
export function sameAddress(a, b) {
  const x = textKey(a).replace(/\b(usa|us|united states)\b/g, "").trim();
  const y = textKey(b).replace(/\b(usa|us|united states)\b/g, "").trim();
  if (!x || !y) return false;
  return x === y || x.startsWith(y) || y.startsWith(x);
}
export function sameName(a, b) {
  const x = textKey(a);
  const y = textKey(b);
  return !!x && !!y && x === y;
}
function textKey(v) {
  return String(v ?? "").toLowerCase().replace(/[’'.]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}
function typedOverKnown(typed, known, knownSource, same) {
  if (typed && known) {
    return same(typed, known) ? { value: typed, source: "typed" } : { value: typed, source: "typed", disputed: { value: known, source: knownSource } };
  }
  if (typed) return { value: typed, source: "typed" };
  if (known) return { value: known, source: knownSource };
  return { value: null, source: "absent" };
}
export function resolveFacts(typed, known) {
  const p = typed?.profile ?? null;
  const voice = activeChannel(known, "voice");
  const whatsapp = activeChannel(known, "whatsapp");
  const kept = keptReaching(known, voice);
  const published = trimmed(typed?.phone_display);
  const strEq = (a, b) => a === b;
  return {
    business_name: typedOverKnown(
      trimmed(typed?.business_name),
      trimmed(known?.listing?.name) ?? trimmed(known?.workspace?.name),
      known?.listing?.name ? "verified" : "workspace",
      sameName
    ),
    // The one that matters, and the one that should usually be absent.
    //
    // The fallback is FORMATTED, not raw E.164: this value is spoken and
    // written to customers -- "Phone: +13085550109" in a prompt becomes a
    // receptionist reading digits aloud -- so the provisioned line arrives as
    // "+1 (308) 555-0109", the way a person says a number.
    //
    // The number the business keeps and forwards to THIS line is the one typed value that is not a disagreement
    // with it: customers call the number they know, and when nobody picks up they reach the receptionist.
    phone_display: published && samePhone(published, kept) ? { value: published, source: "typed" } : typedOverKnown(published, voice ? formatPhoneDisplay(voice) : null, "provisioned", samePhone),
    booking_link: typedOverKnown(trimmed(typed?.booking_link), null, "absent", strEq),
    address: typedOverKnown(trimmed(p?.address), trimmed(known?.listing?.address), "verified", sameAddress),
    website: typedOverKnown(trimmed(p?.website), null, "absent", strEq),
    // Human-only by nature: nothing provisions "the person to put a caller through to".
    handoff_number: p?.handoff_number ? { value: p.handoff_number, source: "typed" } : { value: null, source: "absent" },
    voice_line: voice ? { value: voice, source: "provisioned" } : { value: null, source: "absent" },
    whatsapp_line: whatsapp ? { value: whatsapp, source: "provisioned" } : { value: null, source: "absent" },
    kept_line: kept ? { value: kept, source: "provisioned" } : { value: null, source: "absent" }
  };
}
export function factConflicts(f) {
  const out = [];
  const phone = f.phone_display;
  if (phone.disputed && phone.value) {
    const isHandoff = samePhone(phone.value, f.handoff_number.value);
    out.push({
      fact: "phone_display",
      severity: "serious",
      used: phone.value,
      known: phone.disputed.value,
      knownSource: phone.disputed.source,
      sentence: isHandoff ? `Your receptionist tells customers to call ${phone.value}, which is the number it transfers to \u2014 so they reach a person directly and never the receptionist answering on ${phone.disputed.value}.` : `Your receptionist tells customers to call ${phone.value}, but it answers on ${phone.disputed.value}. Anyone who calls the published number does not reach it.`,
      to: "admin/workspace"
    });
  }
  if (f.handoff_number.value && f.kept_line.value && samePhone(f.handoff_number.value, f.kept_line.value)) {
    const kept = formatPhoneDisplay(f.kept_line.value) ?? f.kept_line.value;
    out.push({
      fact: "handoff_number",
      severity: "serious",
      used: f.handoff_number.value,
      known: kept,
      knownSource: f.kept_line.source,
      sentence: `Your receptionist puts callers who ask for a person through to ${kept}, which forwards the calls nobody picks up back to it \u2014 they would come straight back. Give a mobile or another line a person answers.`,
      to: "admin/workspace"
    });
  }
  if (f.address.disputed && f.address.value) {
    out.push({
      fact: "address",
      severity: "minor",
      used: f.address.value,
      known: f.address.disputed.value,
      knownSource: f.address.disputed.source,
      sentence: `Your receptionist gives ${f.address.value}; Google has you at ${f.address.disputed.value}.`,
      to: "admin/workspace"
    });
  }
  if (f.business_name.disputed && f.business_name.value) {
    out.push({
      fact: "business_name",
      severity: "minor",
      used: f.business_name.value,
      known: f.business_name.disputed.value,
      knownSource: f.business_name.disputed.source,
      sentence: `Your receptionist introduces the business as ${f.business_name.value}; ${f.business_name.disputed.source === "verified" ? "Google lists it" : "this workspace is named"} ${f.business_name.disputed.value}.`,
      to: "admin/workspace"
    });
  }
  return out.sort((a, b) => a.severity === b.severity ? 0 : a.severity === "serious" ? -1 : 1);
}
export const SOURCE_WORDS = {
  provisioned: "your line",
  verified: "from Google",
  workspace: "this workspace",
  typed: "you set this",
  absent: "not set"
};
export function changedConfigFields(before, after) {
  const top = (v) => {
    const cfg = v ?? {};
    const brain = cfg.brain ?? {};
    const { profile, ...rest } = brain;
    return {
      ...rest,
      ...profile ?? {},
      calendar: cfg.calendar ?? null,
      bookings: cfg.bookings ?? null,
      notifications: cfg.notifications ?? null,
      features: cfg.features ?? null
    };
  };
  const a = top(before);
  const b = top(after);
  const keys = [.../* @__PURE__ */ new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  return keys.filter((k) => JSON.stringify(a[k] ?? null) !== JSON.stringify(b[k] ?? null));
}
