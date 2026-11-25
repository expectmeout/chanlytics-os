/**
 * The world the tests of answer/ share. Split by behaviour from ask-answer.test.mjs on 25 Nov 2026 (layer 14: a test
 * file over 1,600 lines is two files); its header, as it was:
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 *
 */
/**
 * Ask's answer as the Line draws it (docs/superpowers/specs/2026-09-23-ask-the-line-design.md, section 5): every
 * answer made before the Line read back in the prose form, one door per place, the three quick answers from Today's
 * queue, and the model's own: the format it writes, how the server reads it back, its Say while it streams, and the
 * v1 fields it is stored beside. Run on the contract itself.
 */
import assert from "node:assert/strict";
import { ASK_ANSWER_CAPS, emptyReadSet, normalizeAnswer, noteRows } from "@chanlytics/contracts";
import { ASK_ANSWER_FORMAT } from "../../../apps/dashboard/src/server/ask/answer-format.ts";

export const ID = "11111111-1111-4111-8111-111111111111";

export const ID2 = "22222222-2222-4222-8222-222222222222";

export const v1 = (over = {}) => ({
  text: "Nora asked about Saturday; nobody else is waiting.",
  citations: [
    { kind: "thread", id: ID, label: "Nora", to: `inbox/th-${ID}` },
    { kind: "page", id: "reports", label: "Reports", to: "reports" },
  ],
  navigate: null,
  followups: ["Reply to Nora?", "What did the receptionist tell Nora?"],
  language: "en",
  ...over,
});

export const SEARCH = {
  id: "q-s-s1",
  name: "personal trainers",
  question: "Most of the first 25 are gyms, not trainers. Keep them?",
  to: "clients/leads:s-s1:c-excluded",
};

export const waiting = (people, runs = 0, more = 0, searches = []) => ({
  people: people.map((who, i) => ({
    id: `c${i}`,
    kind: "thread",
    who,
    channel: "WhatsApp",
    when: "waited 3d",
    line: "“Can I come at 3?”",
    to: `inbox/th-c${i}`,
  })),
  more,
  runs: Array.from({ length: runs }, (_, i) => ({
    id: `r${i}`,
    label: "Win-back · quiet 30 days",
    reach: 1,
    to: `campaigns/sequences/q${i}/runs/r${i}`,
  })),
  searches,
  windows: [],
});

/** A reply window closing, in the people's row shape. */
export const closing = (who, i = 0) => ({
  id: `w${i}`,
  kind: "thread",
  who,
  channel: "WhatsApp",
  when: "closes in 2h",
  line: "",
  to: `inbox/th-w${i}`,
});

/* ------------------------------------------------------------ what the model writes */

export const C = ASK_ANSWER_CAPS;

export const CALL = ID2;

export const PERSON = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

export const UNREAD = "44444444-4444-4444-8444-444444444444";

/** A row as a reader returns it (contracts AskRowRef): where it opens is the reader's to say. */
export const ref = (kind, id, route, label = "") => ({ kind, id, route, label });

/** A thread's RowRef, as the Inbox's read gives it. */
export const threadRef = (id) => ref("thread", id, `inbox/th-${id}`);

/** The read set holding these rows, each as its reader gave it: a thread, its conversation, a call, a person, and more. */
export const reads = (...more) => {
  const read = emptyReadSet();
  noteRows(read, [
    threadRef(ID),
    ref("conversation", ID, `conversations/${ID}`),
    ref("call", CALL, `conversations/cv-${CALL}`),
    ref("person", PERSON, `clients/${PERSON}`),
    ...more,
  ]);
  return read;
};

export const NONE = { kind: "none", id: "", label: "" };

export const BREAKDOWN = {
  label: "customer messages",
  total: 16,
  parts: [
    { label: "answered", value: 12, warn: false },
    { label: "handed over", value: 3, warn: true },
    { label: "unanswered", value: 1, warn: false },
  ],
  source: { kind: "page", id: "reports", label: "Reports" },
};

/** An answer as the model writes it: every key the format names, every list with an entry. */
export const written = (over = {}) => ({
  say: { headline: "Nora and Sam are waiting on you.", detail: "Nora asked about Saturday; Sam's call was missed." },
  show: {
    figures: [
      { value: "2", label: "waiting on you", note: "up from 1", source: { kind: "page", id: "inbox", label: "Inbox" } },
    ],
    items: [
      {
        title: "Nora",
        meta: "WhatsApp · 2h",
        line: "Asked about Saturday.",
        source: { kind: "thread", id: ID, label: "Nora" },
      },
    ],
    breakdown: BREAKDOWN,
    chart: {
      kind: "line",
      label: "messages a day",
      series: ["messages"],
      points: [
        { label: "Mon", values: [4] },
        { label: "Tue", values: [6] },
      ],
      source: { kind: "page", id: "reports", label: "Reports" },
    },
    list: { style: "numbers", entries: ["Reply to Nora.", "Call Sam back."] },
  },
  do: {
    open: { source: { kind: "call", id: CALL, label: "Sam's call" }, label: "Open it", now: false },
    next: ["Reply to Nora?"],
  },
  language: "en",
  ...over,
});

export const withShow = (show) => written({ show: { ...written().show, ...show } });

export const withOpen = (open) => written({ do: { open, next: [] } });

export const read1 = (raw, language = "en", set = reads()) => {
  const r = normalizeAnswer(JSON.stringify(raw), set, language);
  assert.equal(r.ok, true, r.error);
  return r;
};

export const at = (...path) => path.reduce((s, k) => (k === "[]" ? s.items : s.properties[k]), ASK_ANSWER_FORMAT);

/** The keys and leaf types of a schema, or of a value, as one tree; a list is its first entry's. */
export const schemaShape = (s) =>
  s.type === "object"
    ? Object.fromEntries(Object.entries(s.properties).map(([k, v]) => [k, schemaShape(v)]))
    : s.type === "array"
      ? [schemaShape(s.items)]
      : s.type;

export const valueShape = (v) =>
  Array.isArray(v)
    ? [valueShape(v[0])]
    : v && typeof v === "object"
      ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, valueShape(x)]))
      : typeof v;

/* ------------------------------------------------- fifteen names (Ask Rewired, PR 4.2; a visit and a review, 15 Oct) */

export const LEAD = "a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1";

export const SEARCH_ID = "b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2";

export const DEAL = "c3c3c3c3-c3c3-4c3c-8c3c-c3c3c3c3c3c3";

export const SAVED = "d4d4d4d4-d4d4-4d4d-8d4d-d4d4d4d4d4d4";

export const RUN = "e5e5e5e5-e5e5-4e5e-8e5e-e5e5e5e5e5e5";

export const PLAYBOOK = "f6f6f6f6-f6f6-4f6f-8f6f-f6f6f6f6f6f6";

export const TEMPLATE = "a7a7a7a7-a7a7-4a7a-8a7a-a7a7a7a7a7a7";

export const DOMAIN = "b8b8b8b8-b8b8-4b8b-8b8b-b8b8b8b8b8b8";

export const VISIT = "c9c9c9c9-c9c9-4c9c-8c9c-c9c9c9c9c9c9";

export const REVIEW = "dadadada-dada-4ada-8ada-dadadadadada";

/** One row of each new kind, as its reader returns it: the route is the reader's, never one the grammar derives. */
export const NEW_ROWS = [
  ref("lead", LEAD, `clients/leads:s-${SEARCH_ID}:p-${LEAD}`, "Bright Movers"),
  ref("search", SEARCH_ID, `clients/leads:s-${SEARCH_ID}`, "Movers in Queens"),
  ref("deal", DEAL, `clients/${PERSON}`, "Dana's move"),
  ref("list", "quiet", "clients/seg:quiet", "Gone quiet"),
  ref("list", SAVED, `clients/list:${SAVED}`, "Regulars"),
  ref("broadcast", RUN, `campaigns/sequences/${PLAYBOOK}/runs/${RUN}`, "Monday offer"),
  ref("playbook", PLAYBOOK, `outbound/${PLAYBOOK}`, "Win-back"),
  ref("template", TEMPLATE, "messages", "spring_offer"),
  ref("mailbox", DOMAIN, "admin/integrations", "sam@mail.example.com"),
  // 15 Oct 2026: a visit opens on its day with its sheet, and a review on the Reviews lens with its reply box.
  ref("visit", VISIT, `calendar/2026-10-16:a-${VISIT}`, "Dana Example · Thursday, October 16, 3:00 PM"),
  ref("review", REVIEW, `reports/reviews:${REVIEW}`, "Ana P. · ★★★★★"),
];

/* ------------------------------------------------------- the words' formatting */

export const runs = (t) => t.map((r) => (r.bold ? `**${r.text}**` : r.italic ? `_${r.text}_` : r.text)).join("");
