import { initialsOf, shortName } from "../conversations/thread-contact.js";
import { leadTileSrc, leadTintOf } from "../leads/lead-facts.js";
import { leadsRoute } from "../leads/lead-plan.js";
import { toLeadPeekVM } from "../leads/lead-peek.js";
import { LEAD_STAGE_WORDS } from "../leads/lead-words.js";
import { clockDate } from "../shared/clock.js";
import { formatPhoneDisplay } from "../shared/phone.js";
import { MIN_MS } from "../shared/time.js";
import { personName } from "../people/person-name.js";
import { reachOutStandingOf } from "../reach-out/reach-out-leads.js";
import { BUSINESS_DOOR_LABEL, PERSON_NAME_WORDS, WORKS_AT_WORDS } from "./words.js";
function tileOf(name, b) {
  return {
    kind: "tile",
    initials: initialsOf(b?.lead.business_name ?? name),
    tint: leadTintOf(b?.lead.category ?? null),
    image: leadTileSrc(b?.lead.image_url ?? null)
  };
}
export function personHeadOf(h, tz, nowMs) {
  const standIn = h.nameSource === "lead";
  const day = (ms) => clockDate(ms, tz, nowMs);
  const offered = h.signers.find((s) => s.state === "offered" && s.intent !== "no" && s.claim === "person");
  const signer = offered && (standIn || !h.givenName) ? {
    name: offered.name,
    title: offered.title,
    messageId: offered.message_id,
    fact: PERSON_NAME_WORDS.signed(offered.name),
    day: day(Date.parse(offered.read_at))
  } : null;
  const gone = !!h.worksAt?.gone;
  const business = h.worksAt && !gone ? h.worksAt.name ?? h.business?.lead.business_name ?? null : null;
  let line = null;
  if (gone) line = { kind: "gone", text: WORKS_AT_WORDS.gone };
  else if (signer) line = null;
  else if (standIn) {
    const story = h.saidNoMs !== null ? WORKS_AT_WORDS.saidNo(day(h.saidNoMs)) : h.calledMs !== null && (h.addedMs === null || h.calledMs <= h.addedMs + MIN_MS) ? WORKS_AT_WORDS.youCalled(day(h.calledMs)) : h.addedMs !== null ? WORKS_AT_WORDS.weWroteFirst(day(h.addedMs)) : null;
    line = story ? { kind: "origin", text: story } : null;
  } else if (business) line = { kind: "business", text: business, label: BUSINESS_DOOR_LABEL(business) };
  const adopted = h.nameSource === "signature" ? h.signers.find((s) => s.state === "adopted") : void 0;
  return {
    face: standIn ? tileOf(h.name, h.business) : { kind: "face", initials: h.initials, tint: null, image: null },
    name: h.name,
    standIn,
    line,
    signer,
    addName: standIn && h.saidNoMs === null && !signer,
    namedBy: adopted ? {
      messageId: adopted.message_id,
      day: day(Date.parse(adopted.read_at)),
      putBack: business ?? h.business?.lead.business_name ?? null
    } : null,
    ask: standIn ? PERSON_NAME_WORDS.askAboutThisPerson : PERSON_NAME_WORDS.askAbout(shortName(h.name))
  };
}
function ratingOf(rating, reviews) {
  if (rating === null || !Number.isFinite(rating)) return null;
  return `\u2605 ${rating.toFixed(1)}${reviews ? ` (${reviews.toLocaleString("en-US")})` : ""}`;
}
export function worksAtOf(worksAt, b, tz, nowMs) {
  if (!worksAt) return null;
  if (worksAt.gone) return { gone: true, text: WORKS_AT_WORDS.gone };
  const name = worksAt.name ?? b?.lead.business_name ?? null;
  if (!name) return null;
  const lead = b?.lead ?? null;
  const people = b?.people.length ?? 0;
  const kind = [
    lead?.category ?? null,
    lead ? ratingOf(lead.rating, lead.reviews) : null,
    people > 1 ? WORKS_AT_WORDS.people(people) : null
  ].filter((x) => !!x).join(" \xB7 ");
  const found = lead ? Date.parse(lead.found_at) : NaN;
  return {
    gone: false,
    leadId: worksAt.leadId,
    name,
    tile: tileOf(name, b),
    kind: kind || name,
    read: Number.isFinite(found) ? WORKS_AT_WORDS.read(clockDate(found, tz, nowMs)) : "",
    label: BUSINESS_DOOR_LABEL(name)
  };
}
export function businessRecordOf(b, of, tz, now) {
  const { personId, reachOut } = of;
  const nowMs = now.getTime();
  const peek = toLeadPeekVM(b.lead, null, tz, now);
  const found = Date.parse(b.lead.found_at);
  const people = b.people.map((p) => {
    const name = personName(p);
    const touched = p.in_touch_at ? Date.parse(p.in_touch_at) : NaN;
    return {
      id: p.id,
      name,
      initials: initialsOf(name),
      here: p.id === personId,
      line: p.id === personId ? WORKS_AT_WORDS.thisPage : Number.isFinite(touched) ? WORKS_AT_WORDS.inTouch(clockDate(touched, tz, nowMs)) : WORKS_AT_WORDS.neverInTouch,
      needsYou: p.needs_you,
      to: p.id === personId ? null : `clients/${p.id}`
    };
  });
  const links = Object.values(peek.links).filter((l) => !!l && !!l.href);
  return {
    leadId: b.lead.id,
    name: b.lead.business_name,
    tile: tileOf(b.lead.business_name, b),
    kind: peek.sub,
    rating: ratingOf(b.lead.rating, b.lead.reviews),
    address: peek.where ? { line: peek.where.line, href: peek.where.href } : null,
    read: Number.isFinite(found) ? WORKS_AT_WORDS.readOnSheet(clockDate(found, tz, nowMs)) : "",
    stage: { word: LEAD_STAGE_WORDS[b.lead.stage] ?? b.lead.stage, note: WORKS_AT_WORDS.stageNote },
    open: b.lead.stage !== "archived" && !!b.lead.contact_id,
    people,
    peopleTitle: WORKS_AT_WORDS.peopleHere(people.length),
    fit: peek.checkDots.length ? { word: peek.fit.word, checks: WORKS_AT_WORDS.checks(peek.checkDots.length) } : null,
    reachOut: reachOut?.chain ? {
      chain: reachOut.chain.name,
      // Where the business stands in it, said once for every page (00426): never "still writing" after an answer.
      line: reachOutStandingOf(reachOut, nowMs, tz)?.line ?? "",
      to: reachOut.conversation_id ? `inbox/th-${reachOut.conversation_id}` : null
    } : null,
    phone: peek.reach.phone ? {
      value: peek.reach.phone.value ?? formatPhoneDisplay(b.lead.phone) ?? "",
      tel: peek.reach.phone.tel,
      hours: peek.today ? WORKS_AT_WORDS.listingHours(peek.today) : null
    } : null,
    links,
    to: leadsRoute({ peek: b.lead.id })
  };
}
export function leadPeopleIndex(rows) {
  const byLead = /* @__PURE__ */ new Map();
  const byId = /* @__PURE__ */ new Map();
  for (const r of rows) {
    byId.set(r.id, r);
    const lead = r.worksAt && !r.worksAt.gone ? r.worksAt.leadId : null;
    if (!lead) continue;
    const at = byLead.get(lead);
    if (at) at.push(r);
    else byLead.set(lead, [r]);
  }
  return { byLead, byId };
}
export function leadPeopleOf(lead, index) {
  const own = lead.contactId ? index.byId.get(lead.contactId) ?? null : null;
  const at = index.byLead.get(lead.id) ?? [];
  const face = at.find((r) => !r.standIn) ?? own ?? at[0] ?? null;
  const others = at.filter((r) => r !== face);
  const people = [
    ...face && at.includes(face) ? [face] : [],
    ...others.filter((r) => r.state === "needs_you"),
    ...others.filter((r) => r.state !== "needs_you")
  ];
  const names = WORKS_AT_WORDS.someNames(people.filter((r) => !r.standIn).map((r) => r.name));
  const n = people.length;
  return {
    door: face ? { id: face.id, name: face.standIn ? null : face.name } : null,
    line: names ? WORKS_AT_WORDS.peopleLine(n, names) : null,
    card: n ? names ? WORKS_AT_WORDS.inPeopleNamed(names) : WORKS_AT_WORDS.inPeople(n) : null,
    client: [...own ? [own] : [], ...people].find((r) => r.deal?.stage === "won")?.id ?? null,
    order: people.map((r) => r.id)
  };
}
export function businessTrailOf(row) {
  if (row.nameSource === "lead" || !row.worksAt || row.worksAt.gone || !row.worksAt.name) return null;
  return row.worksAt.name;
}
