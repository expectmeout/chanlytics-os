import { moneyWords } from "./billing.js";
import { PLATFORM_VERDICTS, platformRows } from "./platform.js";
export const PARTNER_STATUSES = ["active", "paused", "closed"];
export const PARTNER_SHARE_BP_DEFAULT = 2500;
export const PARTNER_STANDINGS = ["qualified", "review", "disqualified"];
export const PARTNER_EARNING_KINDS = ["share", "refund", "dispute", "dispute_won"];
export const PARTNER_EARNING_STATES = ["held", "payable", "paid", "void"];
export const PARTNER_REVERSAL_KINDS = ["refund", "dispute", "dispute_won"];
export const PARTNER_HOLD_DAYS = 30;
export const PARTNER_CODE_MIN = 3;
export const PARTNER_CODE_MAX = 24;
const CODE_SHAPE = /^[a-z0-9][a-z0-9-]{1,22}[a-z0-9]$/;
export const PARTNER_CODES_RESERVED = ["chanlytics", "admin", "support", "signup", "login", "partner", "partners"];
export function cleanPartnerCode(raw) {
  const code = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!code) return { ok: false, reason: "Choose a code for your link." };
  if (code.length < PARTNER_CODE_MIN || code.length > PARTNER_CODE_MAX)
    return { ok: false, reason: `A code is ${PARTNER_CODE_MIN} to ${PARTNER_CODE_MAX} characters.` };
  if (!CODE_SHAPE.test(code))
    return { ok: false, reason: "Letters, digits and dashes only, starting and ending with a letter or digit." };
  if (PARTNER_CODES_RESERVED.includes(code)) return { ok: false, reason: "That code is reserved. Try another." };
  return { ok: true, code };
}
export const isPartnerCode = (raw) => cleanPartnerCode(raw).ok;
export const partnerPathFor = (code) => `/p/${encodeURIComponent(code)}`;
export const partnerLinkFor = (code, origin) => `${origin.replace(/\/+$/, "")}${partnerPathFor(code)}`;
export const PARTNER_COOKIE = "chanlytics_partner";
export const PARTNER_COOKIE_DAYS = 30;
export function partnerCodeFromCookie(header) {
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() !== PARTNER_COOKIE) continue;
    let value = part.slice(eq + 1).trim();
    try {
      value = decodeURIComponent(value);
    } catch {
      return null;
    }
    const cleaned = cleanPartnerCode(value);
    return cleaned.ok ? cleaned.code : null;
  }
  return null;
}
export const PARTNER_WORDS = {
  tab: "Partner",
  title: "Bring a business to Chanlytics",
  /** The offer, before the share, which is printed from the row (shareWords). */
  offer: "Send a business your link. When it signs up through the link and pays for its plan, you join its team as its partner: you set its receptionist up and keep it running, and Chanlytics pays you a share of what it pays for its plan, for as long as it pays. A business already on Chanlytics can ask you in by your code: if it has not paid for a plan yet, the same share is yours once it does.",
  codeLabel: "Your code",
  codeHint: `${PARTNER_CODE_MIN} to ${PARTNER_CODE_MAX} letters, digits or dashes. It ends your link, for good.`,
  terms: "A share is paid on a workspace someone other than you brought you onto: made through your link, set up by you and handed to its owner, or one whose owner asked you in before it had paid for a plan. It is paid thirty days after each payment of its plan, and never on a workspace of your own. Chanlytics can pause a partner account, and a workspace's owner can remove you from its team at any time.",
  termsAgree: "I agree to these terms.",
  become: "Become a partner",
  becoming: "Setting you up\u2026",
  linkLabel: "Your link",
  copy: "Copy link",
  copied: "Copied",
  since: (at) => `A partner since ${new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}.`,
  paused: "Your partner account is paused. Write to us to have it looked at.",
  closed: "Your partner account is closed.",
  reading: "Reading your partner account\u2026",
  failed: "your partner account",
  /** What the switcher and Team show for a workspace brought this way. */
  role: "Partner",
  earnings: "Earnings",
  workspaces: "Your workspaces",
  open: "Open",
  readingWorkspaces: "Reading your workspaces\u2026",
  failedWorkspaces: "your workspaces",
  noneYet: "Nothing earned yet. A share is written when a workspace you brought pays for its plan.",
  /**
   * The create screen's question when a partner's link brought the person (0012): nobody joins a team without the
   * owner's yes. Their price does not change; the share is Chanlytics'.
   */
  joinAsk: (code) => `Add ${code}, who sent you here, to your team as your partner? They set your receptionist up for you, and Chanlytics pays them a share of your plan: your price is the same. You can remove them in Team at any time.`,
  /** What a partner may not do for a business until it pays: the spend doors wait on its plan (maySpend). */
  spend: "Anything that spends a business's money, a phone number or a lead search, waits until its owner pays for a plan.",
  /** The pane's switch for the daily letter (0014). */
  letters: "Email me when something changes in my earnings or my workspaces' standing, at most once a day.",
  lettersFailed: "your email setting"
};
export function shareWords(shareBp) {
  const pct = shareBp / 100;
  const shown = Number.isInteger(pct) ? String(pct) : pct.toFixed(1).replace(/\.0$/, "");
  return `${shown}% of what it pays for its plan`;
}
export function broughtWords(count) {
  if (count <= 0) return "No workspace has you as its partner yet.";
  if (count === 1) return "1 workspace has you as its partner.";
  return `${count} workspaces have you as their partner.`;
}
export const dayWords = (at) => new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
function sumWords(rows, state) {
  const of = rows.filter((r) => r.state === state && r.earned_cents !== 0);
  if (!of.length) return { words: moneyWords(0, rows[0]?.currency ?? "usd"), cents: 0 };
  return {
    words: of.map((r) => moneyWords(r.earned_cents, r.currency)).join(" and "),
    cents: of.reduce((n, r) => n + r.earned_cents, 0)
  };
}
export function partnerEarningsWords(rows, nowMs = Date.now()) {
  const list = rows ?? [];
  const held = sumWords(list, "held");
  const payable = sumWords(list, "payable");
  const paid = sumWords(list, "paid");
  const next = list.filter((r) => r.state === "held" && r.next_payable_at).map((r) => r.next_payable_at).sort()[0];
  return {
    none: list.every((r) => r.earned_cents === 0),
    // The date is the earliest a held share could be paid, never a promise: one waiting on a review, or past its
    // date and not yet judged, is said as waiting rather than given a day that has gone.
    held: held.cents === 0 ? `Nothing held. A share is held ${PARTNER_HOLD_DAYS} days after each payment.` : next && Date.parse(next) > nowMs ? `${held.words} held, the first of it payable from ${dayWords(next)} at the earliest.` : `${held.words} held, payable once each workspace it came from is qualified.`,
    payable: payable.cents < 0 ? `${payable.words} to come off your next payout, for refunds and disputes after you were paid.` : `${payable.words} payable.`,
    paid: `${paid.words} paid to date.`
  };
}
export function partnerVM(dto, origin, workspacesAsPartner, balance = []) {
  return {
    code: dto.code,
    link: partnerLinkFor(dto.code, origin),
    status: dto.status,
    share: shareWords(dto.share_bp),
    since: PARTNER_WORDS.since(dto.created_at),
    brought: broughtWords(workspacesAsPartner),
    standing: dto.status === "paused" ? PARTNER_WORDS.paused : dto.status === "closed" ? PARTNER_WORDS.closed : null,
    earnings: partnerEarningsWords(balance)
  };
}
export const PARTNER_STANDING_WORDS = {
  pending: "Its share is judged once it has paid.",
  qualified: null,
  review: "Under review: a person at Chanlytics looks at it before its share is paid. We'll write to you.",
  disqualified: "Not eligible for a share."
};
const NEEDS_THE_PARTNER = ["broken", "stalled", "waiting_owner", "billing", "rehearsal"];
function moneyLine(lines) {
  if (!lines.length) return "Nothing earned from it yet.";
  const say = (pick) => lines.map((l) => moneyWords(pick(l), l.currency)).join(" and ");
  const toDate = lines.reduce((n, l) => n + l.held_cents + l.payable_cents + l.paid_cents, 0);
  const month = lines.reduce((n, l) => n + l.month_cents, 0);
  if (toDate === 0 && month === 0) return "Nothing earned from it yet.";
  return `${say((l) => l.month_cents)} from this month's payments \xB7 ${say((l) => l.held_cents + l.payable_cents + l.paid_cents)} to date`;
}
export function partnerWorkspacesVM(overview, money2, nowMs = Date.now(), status = "active") {
  const judged = platformRows(overview, nowMs);
  const moneyOf = (id) => money2.filter((m) => m.tenant_id === id);
  const standingOf = (id) => {
    const s = moneyOf(id)[0]?.standing ?? "pending";
    return PARTNER_STANDING_WORDS[s] ?? null;
  };
  const rows = judged.map((r) => {
    const v = PLATFORM_VERDICTS[r.verdict];
    return {
      tenantId: r.tenantId,
      slug: r.slug,
      name: r.name,
      verdict: r.verdict,
      label: v.label,
      tone: v.tone,
      sentence: r.sentence,
      facts: [r.facts.paying, r.facts.answering, `texting ${r.facts.texting}`, `heard ${r.facts.heard}`].join(" \xB7 "),
      standing: standingOf(r.tenantId),
      money: moneyLine(moneyOf(r.tenantId)),
      onTeam: true
    };
  });
  const seen = new Set(rows.map((r) => r.tenantId));
  const off = [...new Map(money2.filter((m) => !seen.has(m.tenant_id)).map((m) => [m.tenant_id, m])).values()];
  for (const m of off.sort((a, b) => a.name.localeCompare(b.name))) {
    rows.push({
      tenantId: m.tenant_id,
      slug: null,
      name: m.name,
      verdict: null,
      label: "Off the team",
      tone: "plain",
      sentence: status === "paused" ? "Your partner account is paused, so you are a viewer on its team until it is looked at." : status === "closed" ? "Your partner account is closed. Its details are its owner's." : m.on_team ? "Its details could not be read just now." : "Its owner took you off its team. Your share goes on while it pays; its details are theirs.",
      facts: null,
      standing: standingOf(m.tenant_id),
      money: moneyLine(moneyOf(m.tenant_id)),
      onTeam: m.on_team
    });
  }
  const total = rows.length;
  const live = rows.filter((r) => r.verdict === "live").length;
  const needs = rows.filter((r) => r.verdict !== null && NEEDS_THE_PARTNER.includes(r.verdict)).length;
  const parts = [`${total} workspace${total === 1 ? "" : "s"}`, `${live} live`];
  if (needs) parts.push(`${needs} need${needs === 1 ? "s" : ""} you`);
  return { rows, summary: total ? parts.join(" \xB7 ") : broughtWords(0) };
}
export const PARTNER_STANDING_VERBS = {
  qualified: "Qualify",
  review: "Hold for review",
  disqualified: "Disqualify"
};
export function partnerStandingChoices(standing) {
  return PARTNER_STANDINGS.filter((s) => s !== standing);
}
export const PARTNER_STATUS_VERBS = {
  active: "Restore",
  paused: "Pause",
  closed: "Close"
};
export function partnerStatusChoices(status) {
  return PARTNER_STATUSES.filter((s) => s !== status);
}
export function partnerStatusOutcomeWords(code, r) {
  const seats = `${r.seats} ${r.seats === 1 ? "workspace" : "workspaces"}`;
  if (r.status === "active")
    return r.seats ? `${code} is restored, and a partner again on ${seats}.` : `${code} is restored. No seat was waiting to be given back.`;
  const what = r.status === "closed" ? "closed" : "paused";
  return r.seats ? `${code} is ${what}: a viewer on ${seats} now, and what they held there is released.` : `${code} is ${what}. They held no partner seat to take.`;
}
export function platformPartnerRows(rows) {
  const seen = /* @__PURE__ */ new Set();
  return rows.map((r) => {
    const first = !seen.has(r.partner_id);
    seen.add(r.partner_id);
    const cur = r.currency ?? "usd";
    const pct = r.share_bp / 100;
    const who = [
      r.email ?? "no address on file",
      `${r.workspaces} workspace${r.workspaces === 1 ? "" : "s"}`,
      r.under_review ? `${r.under_review} under review` : null,
      `${Number.isInteger(pct) ? pct : pct.toFixed(1).replace(/\.0$/, "")}% of what each pays`,
      r.status === "active" ? null : r.status
    ].filter(Boolean);
    const payable = r.payable_cents;
    const money2 = r.currency === null ? "Nothing earned yet." : [
      payable < 0 ? `${moneyWords(payable, cur)} to come off the next payout` : `${moneyWords(payable, cur)} payable`,
      `${moneyWords(r.held_cents, cur)} held`,
      `${moneyWords(r.paid_cents, cur)} paid to date`
    ].join(" \xB7 ");
    return {
      partnerId: r.partner_id,
      code: r.code,
      who: who.join(" \xB7 "),
      money: money2,
      currency: r.currency,
      payableCents: payable,
      canPay: r.currency !== null && payable > 0,
      payLabel: `Mark ${moneyWords(Math.max(payable, 0), cur)} as paid`,
      tone: r.status !== "active" ? "danger" : r.under_review ? "warn" : payable > 0 ? "info" : "plain",
      status: r.status,
      first,
      statusChoices: partnerStatusChoices(r.status).map((s) => ({ status: s, label: PARTNER_STATUS_VERBS[s] }))
    };
  });
}
export function platformPartnerSummary(rows) {
  const partners = new Set(rows.map((r) => r.partner_id)).size;
  if (!partners) return "No partners yet.";
  const byCur = /* @__PURE__ */ new Map();
  for (const r of rows)
    if (r.currency && r.payable_cents > 0) byCur.set(r.currency, (byCur.get(r.currency) ?? 0) + r.payable_cents);
  const review = [...new Map(rows.map((r) => [r.partner_id, r.under_review])).values()].reduce((n, v) => n + v, 0);
  const parts = [`${partners} partner${partners === 1 ? "" : "s"}`];
  parts.push(byCur.size ? `${[...byCur].map(([c, n]) => moneyWords(n, c)).join(" and ")} payable` : "nothing payable");
  if (review) parts.push(`${review} workspace${review === 1 ? "" : "s"} under review`);
  return parts.join(" \xB7 ");
}
const STANDING_LABELS = {
  qualified: "Qualified",
  review: "Under review",
  disqualified: "Disqualified"
};
const standingLabel = (standing) => STANDING_LABELS[standing] ?? standing;
const DECIDED_BY_WORDS = {
  person: " (decided by a person)",
  sweep: " (the nightly check)",
  joining: " (as the partner joined)"
};
const BY_ORIGIN = {
  link: (code) => `Brought by ${code}`,
  handover: (code) => `Set up and handed over by ${code}`,
  invite: (code) => `${code}, asked in by its owner`
};
export function platformPartnerStanding(w) {
  const label = w.standing ? standingLabel(w.standing) : "Not judged yet";
  const whose = (w.decided_by && DECIDED_BY_WORDS[w.decided_by]) ?? "";
  const why = w.standing ? w.standing_why ? `: ${w.standing_why}` : "" : ": judged once it has paid";
  return {
    by: (BY_ORIGIN[w.origin ?? "link"] ?? BY_ORIGIN.link)(w.code),
    standing: `${label}${whose}${why}`,
    tone: w.standing === "review" ? "warn" : w.standing === "disqualified" ? "danger" : w.standing === "qualified" ? "ok" : "plain",
    choices: partnerStandingChoices(w.standing).map((s) => ({ standing: s, label: PARTNER_STANDING_VERBS[s] }))
  };
}
const CODE_IGNORED_WHY = {
  unknown: "no partner has that code",
  paused: "that partner's account is paused",
  closed: "that partner's account is closed",
  self: "it was their own code"
};
const REVERSED_WORDS = {
  refund: "a payment was refunded",
  dispute: "a payment was disputed",
  dispute_won: "a dispute was won"
};
export function partnerEventBits(kind, p) {
  const text = (k) => typeof p[k] === "string" && p[k] ? p[k] : null;
  const known = (words, k) => {
    const said = text(k);
    const word = said !== null && Object.hasOwn(words, said) ? words[said] ?? null : null;
    return word === null ? [] : [word];
  };
  switch (kind) {
    case "partner.code_ignored":
      return known(CODE_IGNORED_WHY, "why");
    case "partner.reversed":
      return known(REVERSED_WORDS, "kind");
    case "partner.handover_sent":
      return p.again === true ? ["sent again"] : [];
    case "partner.invite_accepted":
      return p.earns === false ? ["it was already paying, so it earns no share"] : [];
    default:
      return [];
  }
}
export function partnerPayoutOutcomeWords(code, r) {
  if (r.changed)
    return `Nothing was recorded: what is payable to ${code} is now ${moneyWords(r.total_cents, r.currency)}, not what the card showed. Read the card again before you mark it.`;
  if (r.paid)
    return `Recorded: ${moneyWords(r.total_cents, r.currency)} paid to ${code}, settling ${r.earnings ?? 0} ledger ${r.earnings === 1 ? "line" : "lines"}.`;
  if (r.total_cents < 0)
    return `Nothing to pay: refunds since the last payout take ${moneyWords(-r.total_cents, r.currency)}, which comes off their next share.`;
  return "Nothing is payable to them in that currency, so nothing was recorded.";
}
export function partnerStandingOutcomeWords(r) {
  const label = standingLabel(r.standing).toLowerCase();
  if (r.standing === "disqualified")
    return r.voided ? `Disqualified. What it still held (${r.voided} ${r.voided === 1 ? "share" : "shares"}) is void; what was paid stays paid.` : "Disqualified. It earns nothing from now on; what was paid stays paid.";
  if (r.standing === "qualified")
    return r.matured ? `Qualified. ${r.matured} ${r.matured === 1 ? "share" : "shares"} past the hold ${r.matured === 1 ? "is" : "are"} payable now.` : "Qualified. Its shares become payable as each one's hold ends.";
  return `Now ${label}. What it holds waits until a person decides.`;
}
export const partnerPaneUrl = (origin) => `${origin.replace(/\/+$/, "")}/#/admin/partner`;
const money = (rows) => rows.map((r) => moneyWords(Math.abs(r.cents), r.currency)).join(" and ");
const workspaceWords = (name) => name && name.trim() ? name.trim() : "A workspace you brought";
const setUpWords = (name) => name && name.trim() ? name.trim() : "A workspace you set up";
const whyWords = (why) => why && why.trim() ? ` Why: ${why.trim()}` : "";
const REVERSAL_LINES = {
  refund: (n, a) => `${n === 1 ? "A refund" : `${n} refunds`} took back ${a}.`,
  dispute: (n, a) => `${n === 1 ? "A dispute" : `${n} disputes`} took back ${a} while ${n === 1 ? "it is" : "they are"} settled.`,
  dispute_won: (n, a) => `${n === 1 ? "A dispute" : `${n} disputes`} settled in the business's favor gave back ${a}.`
};
function standingLine(s) {
  const name = workspaceWords(s.workspace);
  if (s.standing === "review")
    return `${name} is under review: a person at Chanlytics looks at it before its share is paid.${whyWords(s.why)}`;
  if (s.standing === "disqualified") return `${name} is not eligible for a share.${whyWords(s.why)}`;
  return `${name} qualified: its shares are paid as each one's hold ends.${whyWords(s.why)}`;
}
function statusLine(s) {
  if (s.status === "paused")
    return `Your partner account is paused.${whyWords(s.why)} On the teams you joined you can read, not change, until it is restored.`;
  if (s.status === "closed") return `Your partner account is closed.${whyWords(s.why)}`;
  return "Your partner account is active again.";
}
function balanceRows(balance) {
  return balance.flatMap((b) => [
    { currency: b.currency, state: "held", earned_cents: b.held, next_payable_at: b.next_payable_at },
    { currency: b.currency, state: "payable", earned_cents: b.payable, next_payable_at: null },
    { currency: b.currency, state: "paid", earned_cents: b.paid, next_payable_at: null }
  ]);
}
export function partnerLetter(news, opts) {
  const stand = partnerEarningsWords(balanceRows(news.balance), opts.nowMs);
  const body = [
    `Since ${dayWords(opts.since)}:`,
    "",
    ...letterLines(news).map((l) => `- ${l}`),
    "",
    "Where you stand:",
    ...stand.none ? [`- ${PARTNER_WORDS.noneYet}`] : [stand.held, stand.payable, stand.paid].map((l) => `- ${l}`),
    "",
    `See it all: ${partnerPaneUrl(opts.origin)}`,
    "",
    "You get this email when something changes, at most once a day. To stop it, turn it off in Settings \u203A Partner."
  ].join("\n");
  return { subject: letterSubject(news), body };
}
const sharesOf = (news) => news.written.filter((w) => w.kind === "share");
const countOf = (rows) => rows.reduce((k, w) => k + w.count, 0);
const nonZero = (rows) => rows.filter((r) => r.cents !== 0);
function letterLines(news) {
  const lines = [];
  if (news.status) lines.push(statusLine(news.status));
  for (const p of news.paid)
    lines.push(`Paid: ${moneyWords(p.cents, p.currency)} on ${dayWords(p.sent_at)}, reference ${p.reference}.`);
  const shares = sharesOf(news);
  if (shares.length) {
    const n = countOf(shares);
    lines.push(
      `You earned ${money(shares)} from ${n === 1 ? "1 payment" : `${n} payments`}, held ${PARTNER_HOLD_DAYS} days.`
    );
  }
  for (const kind of PARTNER_REVERSAL_KINDS) {
    const of = news.written.filter((w) => w.kind === kind);
    if (of.length) lines.push(REVERSAL_LINES[kind](countOf(of), money(of)));
  }
  const matured = nonZero(news.matured);
  if (matured.length) lines.push(`${money(matured)} became payable.`);
  const voided = nonZero(news.voided);
  if (voided.length) lines.push(`${money(voided)} held will not be paid: its workspace is not eligible.`);
  for (const s of news.standing) lines.push(standingLine(s));
  for (const b of news.brought)
    lines.push(`${b && b.trim() ? b.trim() : "A new workspace"} signed up through your link.`);
  for (const a of news.accepted ?? [])
    lines.push(`${setUpWords(a)} has its owner now: they accepted it. Its share runs from its first payment.`);
  for (const d of news.declined ?? [])
    lines.push(`${setUpWords(d)} was declined by the owner you sent it to. Send it again, or to someone else.`);
  return lines;
}
const LETTER_SUBJECTS = [
  [(n) => n.status?.status === "closed", () => "Your Chanlytics partner account is closed"],
  [(n) => n.status?.status === "paused", () => "Your Chanlytics partner account is paused"],
  [(n) => n.paid.length > 0, (n) => `Chanlytics paid you ${money(n.paid)}`],
  [
    (n) => n.standing.some((s) => s.standing === "disqualified"),
    () => "A workspace you brought is not eligible for a share"
  ],
  [(n) => n.standing.some((s) => s.standing === "review"), () => "A workspace you brought is under review"],
  [(n) => (n.declined ?? []).length > 0, () => "A business declined the workspace you set up"],
  [(n) => (n.accepted ?? []).length > 0, () => "A business took over the workspace you set up"],
  [(n) => sharesOf(n).length > 0, (n) => `You earned ${money(sharesOf(n))}`]
];
function letterSubject(news) {
  const rule = LETTER_SUBJECTS.find(([holds]) => holds(news));
  return rule ? rule[1](news) : "What changed in your partner account";
}
