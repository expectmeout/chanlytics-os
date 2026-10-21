import { agoWords } from "../shared/time.js";
import { consolePathOf } from "./console.js";
export function reportCode(n) {
  return `R-${n}`;
}
const PAGE_WORDS = {
  today: "Today",
  inbox: "Inbox",
  conversations: "Conversations",
  clients: "People",
  people: "People",
  leads: "Leads",
  calendar: "Calendar",
  campaigns: "Campaigns",
  reports: "Reports",
  admin: "Settings",
  settings: "Settings",
  live: "Live",
  start: "Setup"
};
export function pageWords(page) {
  return page ? PAGE_WORDS[page] ?? page.charAt(0).toUpperCase() + page.slice(1) : "No page";
}
export function unmailedOf(dto) {
  return dto.mailed_at ? null : dto.mail_error ? `Not in the inbox: ${dto.mail_error}` : "Not in the inbox yet";
}
export function errorWordsOf(dto) {
  if (!dto.error_id) return null;
  const said = [dto.error_name, dto.error_message].filter(Boolean).join(": ");
  return `${dto.error_id} \xB7 ${said || "an error"}`;
}
export function reportOf(dto, nowMs) {
  return {
    id: dto.id,
    code: reportCode(dto.number),
    words: dto.words,
    who: dto.email ?? "Someone signed out",
    workspace: dto.name ?? "No workspace",
    slug: dto.slug,
    page: pageWords(dto.page),
    errorId: dto.error_id,
    error: errorWordsOf(dto),
    when: agoWords(Date.parse(dto.created_at), nowMs),
    unmailed: unmailedOf(dto)
  };
}
export function supportClusters(rows, nowMs) {
  const byError = /* @__PURE__ */ new Map();
  for (const r of rows) {
    if (!r.error_id) continue;
    byError.set(r.error_id, [...byError.get(r.error_id) ?? [], r]);
  }
  return [...byError.entries()].map(([errorId, list]) => {
    const names = [...new Set(list.map((r) => r.name ?? "No workspace"))];
    const times = list.map((r) => Date.parse(r.created_at)).sort((a, b) => a - b);
    const first = list[0];
    return {
      errorId,
      page: pageWords(first?.page),
      error: first?.error_message || first?.error_name || "An error",
      workspaces: names,
      reports: list.length,
      first: agoWords(times[0] ?? nowMs, nowMs),
      last: agoWords(times[times.length - 1] ?? nowMs, nowMs)
    };
  }).filter((c) => c.workspaces.length >= 2).sort((a, b) => b.workspaces.length - a.workspaces.length || b.reports - a.reports);
}
export const SETUP_ASK_WORDS = {
  line: "Asked for a phone line",
  port: "Asked to bring their phone number",
  forwarding: "Asked for help with forwarding in their phone system",
  repair: "Asked for their settings to be repaired",
  name: "Asked to change the name the carriers hold"
};
const ASKED_SOMETHING = "Asked a person for something";
export function askTitle(workspace, what) {
  const said = SETUP_ASK_WORDS[what] ?? ASKED_SOMETHING;
  return `${workspace} ${said.charAt(0).toLowerCase()}${said.slice(1)}`;
}
export function askCode(id) {
  return `A-${id.replace(/-/g, "").slice(0, 6)}`;
}
export function askDoneOf(what, row, askAtMs, signals) {
  if (what === "line")
    return {
      done: !!row?.line_e164 && row.line_kind !== "forwarded",
      byHand: false,
      words: "Done when the workspace has a line"
    };
  if (what === "forwarding") {
    const at = signals?.forwarding_verified_at ? Date.parse(signals.forwarding_verified_at) : NaN;
    return {
      done: Number.isFinite(at) && at >= askAtMs,
      byHand: false,
      words: "Done when a test call comes through the forwarding"
    };
  }
  const byHand = {
    port: "Mark it done once the number has moved",
    repair: "Mark it done once the receptionist reads the settings again",
    name: "Mark it done once the new campaign is approved"
  };
  return { done: false, byHand: true, words: byHand[what] ?? "Mark it done once it is" };
}
export const SUPPORT_TOPICS = [
  "whatsapp",
  "forwarding",
  "line",
  "email",
  "calendar",
  "conversations",
  "answers",
  "facts",
  "language",
  "campaigns",
  "leads",
  "people",
  "reviews",
  "team",
  "billing",
  "other"
];
export const SUPPORT_TOPIC_WORDS = {
  whatsapp: "WhatsApp",
  forwarding: "Forwarding",
  line: "A line or number",
  email: "Email",
  calendar: "Calendar",
  conversations: "Inbox and handing over",
  answers: "How it answers",
  facts: "Hours and prices",
  language: "Language",
  campaigns: "Campaigns",
  leads: "Leads",
  people: "People and lists",
  reviews: "Reviews",
  team: "Team and alerts",
  billing: "Billing",
  other: "Other"
};
const TOPIC_MATCH = [
  ["whatsapp", /whats\s?app|\bwa\b|meta business|facebook/i],
  [
    "billing",
    /invoice|bill(ing|ed)?\b|charged?\b|\bcard\b|payment|refund|subscription|receipt|\btrial\b|my plan|cancel/i
  ],
  [
    "forwarding",
    /forward|ring\s?central|vonage|8x8|phone system|voicemail|calls? (go|ring|come)|keep my (own |current )?number/i
  ],
  ["language", /spanish|español|espanol|french|portuguese|chinese|language|translat|bilingual|english/i],
  [
    "campaigns",
    /campaign(?! (registration|approval|vetting))|sequence|broadcast|follow[- ]?ups?|\bdrip\b|newsletter|\bblast\b/i
  ],
  ["line", /\bline\b|phone number|\bnumber\b|\bport(ing)?\b|carrier|\bsms\b|\btext(s|ing)?\b|10dlc|a2p|registration/i],
  ["calendar", /calendar|appointment|\bbook(ing|ed|s)?\b|schedul|availability|google cal/i],
  ["team", /\bteam\b|staff|invite|member|alert|notif|\bbell\b|hand ?off|escalat|who gets/i],
  ["email", /\bemails?\b|mailbox|gmail|outlook|smtp|\bdomain\b/i],
  ["leads", /\bleads?\b|finder|prospect|find (new )?(businesses|customers|clients)/i],
  ["reviews", /\breviews\b|review (link|request)|\bratings?\b|\bstars?\b|business profile/i],
  ["people", /\bpeople\b|contacts?\b|\bimport|\bcsv\b|spreadsheet|\blists?\b|pipeline|\bdeals?\b/i],
  ["conversations", /\binbox\b|conversation|\bthread|take (it )?over|took over|hand(ed)? (it )?back|\bheld\b|on hold/i],
  [
    "facts",
    /\bhours\b|\bopen(ing)?\b|\bclosed?\b|price|pricing|\bcost|services?\b|\bmenu\b|address|location|\bfaq|facts/i
  ],
  [
    "answers",
    /autonomy|greeting|\bvoice\b|\btone\b|personality|on its own|without asking|approv|\bsounds?\b|how it (answers|replies|talks)/i
  ]
];
const TOPIC_OF_PAGE = { calendar: "calendar" };
export function supportTopicOf(words, page, kind) {
  if (kind === "billing") return "billing";
  const hit = TOPIC_MATCH.find(([, re]) => re.test(words));
  if (hit) return hit[0];
  return page && TOPIC_OF_PAGE[page] || "other";
}
export const ASK_TOPIC = {
  line: "line",
  port: "line",
  forwarding: "forwarding",
  repair: "facts",
  name: "line"
};
export function supportPathOf(code) {
  return `${consolePathOf("support")}?open=${encodeURIComponent(code)}`;
}
export function inboxSearchUrl(template, q) {
  return template && template.includes("{q}") ? template.replace("{q}", encodeURIComponent(q)) : null;
}
export function inboxHomeUrl(template) {
  if (!template || !template.includes("{q}")) return null;
  const base = template.split("#")[0] ?? template;
  return base === template ? base.replace("{q}", "") : `${base}#inbox`;
}
export const SUPPORT_KIND_WORDS = {
  how_to: "Question",
  setup: "Setup help",
  billing: "Billing",
  wrong: "Bug report",
  ask: "Setup ask"
};
export function cameInOf(reports, asks, nowMs) {
  const fromReports = reports.filter((r) => r.kind !== "wrong").map((r) => {
    const at = Date.parse(r.created_at);
    return {
      key: `r-${r.id}`,
      kind: "report",
      title: `\u201C${r.words.length > 60 ? `${r.words.slice(0, 59)}\u2026` : r.words}\u201D`,
      workspace: r.name ?? "No workspace",
      slug: r.slug,
      detail: [
        .../* @__PURE__ */ new Set([SUPPORT_KIND_WORDS[r.kind], SUPPORT_TOPIC_WORDS[supportTopicOf(r.words, r.page, r.kind)]])
      ].join(" \xB7 "),
      when: agoWords(at, nowMs),
      atMs: at,
      code: reportCode(r.number)
    };
  });
  const fromAsks = asks.map((a) => {
    const at = Date.parse(a.at);
    return {
      key: `a-${a.id}`,
      kind: "setup",
      title: askTitle(a.name, a.what),
      workspace: a.name,
      slug: a.slug,
      detail: "Something setup can't do yet",
      when: agoWords(at, nowMs),
      atMs: at,
      code: askCode(a.id)
    };
  });
  return [...fromReports, ...fromAsks].sort((a, b) => b.atMs - a.atMs);
}
export const FIND_KINDS = ["workspace", "owner", "line", "caller", "report"];
const FIND_KIND_WORDS = {
  workspace: "Workspaces",
  owner: "Owners",
  line: "A number",
  caller: "A customer of theirs who called it",
  report: "Reports"
};
export const FIND_LIMITS = { min: 2, max: 80, rows: 20 };
export function findDigits(q) {
  const digits = q.replace(/\D/g, "");
  return digits.length >= 4 && /^[\d\s()+.-]+$/.test(q.trim()) ? digits : null;
}
export function findGroups(rows) {
  return FIND_KINDS.map((kind) => ({
    kind,
    words: FIND_KIND_WORDS[kind],
    rows: rows.filter((r) => r.kind === kind)
  })).filter((g) => g.rows.length > 0);
}
export const SUPPORT_WORDS = {
  title: "Support",
  sub: "Questions and setup asks from members \xB7 you answer in the inbox",
  openInbox: "Open the inbox",
  search: "Their words, a workspace, a topic",
  kinds: "Kind",
  topic: "Topic",
  anyTopic: "Every topic",
  workspace: "Workspace",
  anyWorkspace: "Every workspace",
  views: "Support's views",
  toHealth: (n) => `${n} bug report${n === 1 ? "" : "s"} this week went to Health, where what isn't working is looked at.`,
  openHealth: "Open Health",
  columns: { what: "Who needs what", topic: "Topic", waiting: "Waiting", state: "State" },
  shown: (n) => `${n} shown`,
  older: "Older",
  keys: "\u2191\u2193 move \xB7 Enter opens \xB7 T take \xB7 A copy the reply \xB7 M mark answered",
  noneInView: {
    needs: "Nothing needs a person.",
    waiting: "Nothing is waiting on a workspace.",
    done: "Nothing was answered in the last thirty days."
  },
  noneMatch: "Nothing here matches.",
  cameInNone: "No question or setup ask came in this week.",
  due: (n) => `${n} past ${n === 1 ? "its" : "their"} day in Support`,
  failed: "the queue",
  pick: "Open a row to answer it.",
  from: "From",
  workspaceCard: "Workspace",
  facts: { plan: "Plan", answering: "Answering", texting: "Texting", heard: "Heard from" },
  setupDone: (done, total) => `Setup ${done} of ${total} done`,
  setupNext: (step) => `Next: ${step}`,
  setupAll: "Every step of their Setup is done.",
  setupFailed: "Their Setup couldn't be read just now.",
  notYet: "not yet",
  sentFrom: (page) => `Sent from ${page}`,
  copy: "Copy",
  copyAddress: "Copy address",
  nobodyHasIt: "Nobody has it",
  openSetup: "Open its Setup",
  openWorkspace: "Open the workspace",
  howToHelp: "How to help",
  checkFirst: "Check first",
  reply: "Reply",
  replyNote: "Their name is filled in. Copy it into the inbox: nothing is sent from the Console.",
  alsoSent: "Also sent",
  doneWhen: "Done when",
  answerInInbox: "Answer in the inbox",
  writeInInbox: "Write to them in the inbox",
  copyReply: "Copy the reply",
  replyCopied: "The reply is copied: paste it in the inbox.",
  markAnswered: "Mark answered",
  markDone: "Mark done",
  reopen: "Open it again",
  sendAgain: "Send to the inbox again",
  moveToHealth: "This is a bug: move it to Health",
  moveToSupport: "This is a question: move it to Support",
  answeredSaid: "Answered. It's in Done.",
  waitingSaid: "Answered. It waits on the workspace now.",
  doneSaid: "Done.",
  reopenedSaid: "It needs a person again.",
  resentSaid: "Sent to the inbox again.",
  movedSaid: "Moved. It's on Health now.",
  movedBackSaid: "Moved. It's on Support now.",
  noInbox: "The inbox's address isn't set here: copy the code and search the inbox with it.",
  copied: "The number is copied: search the inbox with it.",
  close: "Close",
  findEmpty: "Nothing matches.",
  findHint: "A name, a slug, an owner's email, a number, a report",
  findKeys: { move: "move", open: "open", close: "close" }
};
