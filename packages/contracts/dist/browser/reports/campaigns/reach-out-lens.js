import { mailboxHoldWords } from "../../email/mailbox-connections.js";
import { stepLabelOf } from "../../reach-out/reach-out-sheet.js";
import { clockDate, clockNear } from "../../shared/clock.js";
import { pct, sumOf } from "../../shared/numbers.js";
import { isCount } from "../../shared/unknown.js";
import { plural } from "../../shared/words.js";
import { mixOf, noMix } from "../report-mix.js";
import {
  REPORT_MIN_N,
  compareWords,
  isThinShare,
  shareSaid,
  shareWasWords
} from "../report-tiles.js";
import { dayPointOf, endedOn, rangeLabelOf, withinWords } from "../reports.js";
import { sequenceRoute } from "../../sequences/sequence-address.js";
const NO_BUSINESSES = "This database does not count businesses yet.";
const MAILBOXES_LINE = "Where it left from, and how it landed. Past 3% bounced, a mailbox holds itself.";
const STANDS_NOW = "as they stand now";
const SOURCES_LINE = "A business counts once, at the last email that wrote to it. What came of each is as it stands now.";
const DASH = "\u2014";
const NO_EMAILS = {
  written: 0,
  delivered: 0,
  bounced: 0,
  wrote_back: 0,
  interested: 0,
  booked: 0,
  said_no: 0,
  handed: 0
};
const pctText = (n, d) => {
  const share = pct(n, d);
  return share === null ? DASH : `${share}%`;
};
const tenthOf = (n, d) => d > 0 ? Math.round(n / d * 1e3) / 10 : null;
const countedBusinesses = (c) => isCount(c.businesses) ? c.businesses : void 0;
function wholeOf(raw) {
  const { businesses, ...counts } = raw.totals ?? {};
  return {
    timezone: raw.timezone || "UTC",
    days: raw.days ?? 30,
    today: raw.today ?? "",
    end: raw.end ?? raw.today ?? "",
    since: raw.since ?? "",
    has_reach_out: raw.has_reach_out === true,
    totals: { ...NO_EMAILS, ...counts, ...isCount(businesses) ? { businesses } : {} },
    ...raw.before ? { before: raw.before } : {},
    series: raw.series ?? [],
    chains: raw.chains ?? [],
    angles: raw.angles ?? [],
    other_angles: raw.other_angles ?? { written: 0, wrote_back: 0 },
    no_angle: raw.no_angle ?? 0,
    mailboxes: raw.mailboxes ?? []
  };
}
function whenOf(dto) {
  const until = endedOn(dto);
  const oneDay = dto.days === 1 ? withinWords(1, until) : null;
  return { until, within: oneDay ?? `in these ${plural(dto.days, "day")}`, these: oneDay ?? "in these days" };
}
function writtenMeta(counts) {
  const { written } = counts;
  const businesses = countedBusinesses(counts);
  if (businesses !== void 0) return `${plural(businesses, "business", "businesses")} written to`;
  return written === 0 ? "none in this period" : plural(written, "email");
}
function stripFigures(dto) {
  const { written, delivered, bounced } = dto.totals;
  const range = rangeLabelOf(dto.days);
  const prior = dto.before !== void 0 && dto.before.written > 0 ? dto.before : null;
  const emails = plural(written, "email");
  return [
    {
      id: "emails-written",
      metric: "emails_written",
      label: "Emails written",
      value: String(written),
      meta: writtenMeta(dto.totals),
      compare: prior && compareWords(written, prior.written, range, true)
    },
    {
      id: "emails-landed",
      metric: "emails_landed",
      label: "Landed",
      value: pctText(delivered, written),
      meta: written > 0 ? `${delivered} of ${emails} delivered` : "nothing written",
      compare: prior && shareWasWords(written, { part: prior.delivered, of: prior.written }, range),
      // A share of the emails written: of fewer than five, it says nothing (the kit greys it).
      n: written,
      minN: REPORT_MIN_N
    },
    {
      id: "emails-bounced",
      metric: "emails_bounced",
      label: "Bounced",
      value: String(bounced),
      meta: bounced > 0 ? `${bounced} of ${emails} bounced` : "none bounced",
      compare: prior && compareWords(bounced, prior.bounced, range, true)
    }
  ];
}
function emailsPart(dto, when) {
  const { written, delivered, bounced } = dto.totals;
  if (written === 0) return noMix(`Nothing was written ${when.these}.`);
  const entries = [
    ["written", "Written", written],
    ["delivered", "Delivered", delivered],
    ["bounced", "Bounced", bounced]
  ];
  const shares = written >= REPORT_MIN_N ? `: ${pct(delivered, written)}% were delivered and ${pct(bounced, written)}% bounced` : "";
  return mixOf(
    entries,
    `Of ${plural(written, "email")} written ${when.within}${shares}. No opens: only what came back.`
  );
}
function businessesPart(dto, when) {
  const { wrote_back, interested, booked, won, said_no } = dto.totals;
  const businesses = countedBusinesses(dto.totals);
  if (businesses === void 0) return noMix(NO_BUSINESSES);
  if (businesses === 0) return noMix(`No business was written to ${when.these}.`);
  const entries = [
    ["written_to", "Written to", businesses],
    ["wrote_back", "Wrote back", wrote_back],
    ["interested", "Interested", interested],
    ["booked", "Booked", booked],
    // Won (00426): a deal naming the business, won; not said where the database does not count it.
    ...isCount(won) ? [["won", "Won", won]] : [],
    ["said_no", "Said no", said_no]
  ];
  const shares = businesses >= REPORT_MIN_N ? `: ${pct(wrote_back, businesses)}% wrote back and ${pct(interested, businesses)}% were interested` : "";
  const line = `Of ${plural(businesses, "business", "businesses")} written to ${when.within}${shares}. Each counts once, at the last email that wrote to it; a question counts as interested. Who wrote back, was interested, booked${isCount(won) ? ", won" : ""} or said no is as it stands now.`;
  return mixOf(entries, line);
}
function angleRow(id, label, businesses, wroteBack) {
  const of = `${wroteBack} of ${businesses}`;
  const display = businesses === 0 ? DASH : businesses >= REPORT_MIN_N ? `${of}  ${pctText(wroteBack, businesses)}` : of;
  return { id, label, value: pct(wroteBack, businesses) ?? 0, display, n: businesses, minN: REPORT_MIN_N };
}
function anglesPart(dto, when) {
  const other = dto.other_angles;
  const listed = dto.angles.map((a) => ({
    id: a.angle,
    label: a.angle,
    businesses: countedBusinesses(a),
    wroteBack: a.wrote_back
  }));
  if (other.written > 0)
    listed.push({
      id: "other",
      label: "Other angles",
      businesses: countedBusinesses(other),
      wroteBack: other.wrote_back
    });
  if (listed.length === 0)
    return {
      rows: [],
      line: null,
      empty: `No email ${when.these} had an opening, so there is no angle to compare.`
    };
  if (listed.some((a) => a.businesses === void 0)) return { rows: [], line: null, empty: NO_BUSINESSES };
  const unangled = dto.no_angle ? ` ${plural(dto.no_angle, "email")} had no opening, so no angle.` : "";
  return {
    rows: listed.map((a) => angleRow(a.id, a.label, a.businesses ?? 0, a.wroteBack)),
    line: `The opening written for each business, and who answered, ${STANDS_NOW}.${unangled}`,
    empty: null
  };
}
function answeredCell(wroteBack, businesses) {
  if (businesses === void 0 || businesses === 0) return String(wroteBack);
  const said = shareSaid(pct(wroteBack, businesses), wroteBack, businesses) ?? String(wroteBack);
  return isThinShare(businesses, REPORT_MIN_N) ? said : `${said} (${wroteBack})`;
}
function cellsOf(c, businesses) {
  const landed = shareSaid(pct(c.delivered, c.written), c.delivered, c.written) ?? DASH;
  const answered = answeredCell(c.wrote_back, businesses);
  return {
    written: String(c.written),
    delivered: landed,
    businesses: businesses === void 0 ? DASH : String(businesses),
    wroteBack: answered,
    interested: String(c.interested),
    booked: String(c.booked),
    won: isCount(c.won) ? String(c.won) : DASH,
    saidNo: String(c.said_no),
    bounced: String(c.bounced)
  };
}
const HAND_CELLS = {
  written: DASH,
  delivered: DASH,
  businesses: DASH,
  wroteBack: DASH,
  interested: DASH,
  booked: DASH,
  won: DASH,
  saidNo: DASH,
  bounced: DASH
};
function summed(steps) {
  const total = { ...NO_EMAILS };
  for (const s of steps) {
    total.written += s.written;
    total.delivered += s.delivered;
    total.bounced += s.bounced;
    total.wrote_back += s.wrote_back;
    total.interested += s.interested;
    total.booked += s.booked;
    total.said_no += s.said_no;
    total.handed += s.handed;
  }
  return steps.every((s) => isCount(s.won)) ? { ...total, won: sumOf(steps.map((s) => s.won ?? 0)) } : total;
}
function chainBusinesses(steps) {
  if (!steps.every((s) => s.hand !== null || countedBusinesses(s) !== void 0)) return void 0;
  return sumOf(steps.map((s) => countedBusinesses(s) ?? 0));
}
function chainSourceLine(c, nowMs, tz) {
  const last = c.last_at ? Date.parse(c.last_at) : NaN;
  const meta = [
    "To leads",
    plural(c.steps.length, "step"),
    plural(c.runs, "run"),
    c.search ? c.search.name : null,
    c.state === "running" ? null : "paused"
  ];
  return {
    id: c.root_id,
    kind: "chain",
    name: c.name,
    meta: meta.filter(Boolean).join(" \xB7 "),
    to: sequenceRoute(c.root_id),
    ...cellsOf(summed(c.steps), chainBusinesses(c.steps)),
    last: Number.isFinite(last) ? clockDate(last, tz, nowMs) : ""
  };
}
function stepSourceLine(root, s) {
  const line = {
    id: `${root}:${s.id}`,
    kind: "step",
    name: `${s.n + 1} \xB7 ${stepLabelOf({ n: s.n, hand: s.hand ? { kind: s.hand } : null })}`,
    to: null,
    last: ""
  };
  if (s.hand) return { ...line, meta: `${s.handed} handed to you`, ...HAND_CELLS };
  return { ...line, meta: "", ...cellsOf(s, countedBusinesses(s)) };
}
function sourceLines(dto, nowMs) {
  return dto.chains.flatMap((c) => [
    chainSourceLine(c, nowMs, dto.timezone),
    ...c.steps.map((s) => stepSourceLine(c.root_id, s))
  ]);
}
function mailboxStateWords(d, nowMs, tz) {
  if (d.yours) return "You send these";
  if (d.address === null || d.state === "removed") return "Since removed";
  if (d.state === "connected") return "Connected";
  if (d.state === "held") {
    const held = d.held_at ? Date.parse(d.held_at) : NaN;
    const since = Number.isFinite(held) ? ` since ${clockNear(held, tz, nowMs)}` : "";
    return `Held${since}: ${mailboxHoldWords(d.held_why)}`;
  }
  if (d.state === "reconnect") return "Signed out: reconnect it";
  return "Paused";
}
function mailboxCell(n, sent, share) {
  return shareSaid(share(n, sent), n, sent) ?? DASH;
}
function mailboxRows(dto, nowMs) {
  return dto.mailboxes.map(
    (d) => d.yours ? (
      // Sent from their own inbox (00429): a bounce or a complaint reaches them, never us, so no share is said.
      {
        id: "your-inbox",
        address: "Your own inbox",
        state: mailboxStateWords(d, nowMs, dto.timezone),
        held: false,
        sent: d.sent,
        landed: DASH,
        bounced: DASH,
        complained: DASH
      }
    ) : {
      id: d.address ?? "removed",
      address: d.address ?? "A mailbox since removed",
      state: mailboxStateWords(d, nowMs, dto.timezone),
      held: d.state === "held",
      sent: d.sent,
      landed: mailboxCell(d.delivered, d.sent, pct),
      bounced: mailboxCell(d.bounced, d.sent, tenthOf),
      complained: mailboxCell(d.complained, d.sent, tenthOf)
    }
  );
}
function periodLines(dto, when) {
  const handed = dto.totals.handed;
  return {
    written: handed ? `${plural(handed, "business", "businesses")} handed to you as a call or a note, too.` : "",
    mailboxes: MAILBOXES_LINE,
    empty: `No sequence to leads wrote ${withinWords(dto.days, when.until)}.`,
    sources: SOURCES_LINE
  };
}
export function toReachOutLensVM(raw, nowMs = Date.now()) {
  const dto = wholeOf(raw);
  const when = whenOf(dto);
  const points = dto.series.map((d) => {
    const point = dayPointOf(d.day);
    return { ...point, written: d.written, writtenWords: `${point.label}: ${d.written} written` };
  });
  return {
    present: dto.has_reach_out,
    empty: dto.totals.written === 0 && dto.totals.handed === 0,
    days: dto.days,
    totals: dto.totals,
    strip: stripFigures(dto),
    emails: emailsPart(dto, when),
    businesses: businessesPart(dto, when),
    angles: anglesPart(dto, when),
    mailboxes: mailboxRows(dto, nowMs),
    points,
    table: { columns: ["Day", "Written"], rows: points.map((p) => [p.label, p.written]) },
    sources: sourceLines(dto, nowMs),
    lines: periodLines(dto, when)
  };
}
