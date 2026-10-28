import { reviewNoticeIsAbout } from "../google/google.js";
import { conversationOfNeedsKey, callOfKey, kindListDoor, unreadCount } from "./notifications.js";
const readyRunTitles = (label) => [`Campaign \u201C${label}\u201D is ready`, `Playbook \u201C${label}\u201D is ready`];
const AWAY_NOUN = {
  call: ["call", "calls"],
  job_failed: ["job did not finish", "jobs did not finish"],
  review: ["new rating on Google", "new ratings on Google"],
  calendar_people: ["person added from your calendar", "people added from your calendar"],
  booking_notice: ["booking email needs a look", "booking emails need a look"],
  handoff: ["conversation needs you", "conversations need you"],
  playbook: ["campaign is ready", "campaigns are ready"],
  // One sync can approve several at once, and several rejections read as one
  // problem with the wording, not as five separate pieces of news.
  template_ready: ["template is ready to send", "templates are ready to send"],
  template_blocked: ["template cannot be sent", "templates cannot be sent"],
  // "A run finished" is this repo's word for the event (activity.ts, kind
  // broadcast.sent), so the bell and the Activity log say the same thing about
  // the same fact.
  broadcast_sent: ["run finished", "runs finished"],
  broadcast_stopped: ["run did not go out", "runs did not go out"],
  note_for_you: ["note left for you", "notes left for you"],
  // A search that stopped to ask: it waits a day for the answer, then stops and keeps what it found.
  leads_question: ["search is waiting for your answer", "searches are waiting for your answer"],
  // Searches finish in runs (a morning's round of eight), and eight "is done" rows buried the bell's first screen.
  leads_ready: ["search finished", "searches finished"],
  // A reach-out that wrote to several businesses hears back from several (Reach out Part 5).
  reach_out_replied: ["reply from a lead", "replies from leads"],
  // A campaign's unsubscribes and STOPs come in a run (decision 0048): several are one pattern, in the Inbox's words.
  opted_out: ["person asked to stop", "people asked to stop"],
  // A day of bookings is one pattern, each its own visit (S1-01); a read of the calendar that found several is one row already.
  booking: ["new booking", "new bookings"],
  // Two invitations accepted the same morning read as a team that grew.
  member_joined: ["teammate joined", "teammates joined"],
  member_left: ["teammate left", "teammates left"],
  // A morning's corrections can suggest several notes: one pile, each kept or dismissed on the Autonomy pane.
  note_to_keep: ["note to keep for the receptionist", "notes to keep for the receptionist"],
  // One a morning, the member's own: a second is another day's.
  ask_cards: ["morning from Ask", "mornings from Ask"],
  // A morning's sign-ups on the website are one pile, each person on their own page.
  website_form: ["form sent on your website", "forms sent on your website"]
};
function groupTitle(members, noun, idOf) {
  const subjects = new Set(members.map((m) => m.about ? `${m.about.type}:${m.about.id}` : idOf(m))).size;
  return `${subjects} ${noun[subjects === 1 ? 0 : 1]}`;
}
const AWAY_TONE_RANK = { warn: 0, "": 1, ok: 2 };
const AWAY_GROUP_MIN = 2;
const AWAY_EMPTY_CLEAR = "All caught up.";
const AWAY_EMPTY_QUEUED = "Everything new is already in the queue above.";
function awayFoot(more, queued, drew) {
  if (more <= 0 || !drew) return null;
  const head = `${more} more in the bell`;
  if (queued <= 0) return head;
  return queued === more ? `${head}, already in the queue above` : `${head}, ${queued} of them already in the queue above`;
}
function groupDoor(kind, doors) {
  const first = doors[0];
  if (first !== void 0 && doors.every((d) => d === first)) return { door: first, action: null };
  const list = kindListDoor(kind);
  return list ? { door: list.to, action: list.action } : { door: first ?? null, action: null };
}
export function todayAwayGrouped(rows, inQueue = [], max = 5, older = 0) {
  const convs = new Set(
    inQueue.flatMap((q) => {
      const id = typeof q === "string" ? q : q.conversationId;
      return id ? [id] : [];
    })
  );
  const callsQueued = new Set(inQueue.flatMap((q) => typeof q === "string" || !q.callId ? [] : [q.callId]));
  const runsQueued = inQueue.flatMap((q) => typeof q === "string" || !q.runLabel ? [] : readyRunTitles(q.runLabel));
  const searchesQueued = new Set(inQueue.flatMap((q) => typeof q === "string" || !q.searchTo ? [] : [q.searchTo]));
  const reviewsDrawn = inQueue.flatMap((q) => typeof q === "string" || !q.review ? [] : [q.review]);
  const idOf = (r) => r.id ?? r.key ?? "";
  const door = (r) => r.to ?? (r.actions && r.actions[0] ? r.actions[0].to : void 0);
  const aboutQueued = (r) => {
    if (r.kind === "ask_cards") return true;
    if (r.kind === "playbook" && runsQueued.some((title) => r.title.startsWith(title))) return true;
    if (r.kind === "leads_question" && searchesQueued.has(door(r) ?? "")) return true;
    if (r.kind === "review" && reviewsDrawn.some((review) => reviewNoticeIsAbout(r.about, review))) return true;
    if (r.about && r.about.type === "conversation" && convs.has(r.about.id)) return true;
    if (r.about && r.about.type === "call" && callsQueued.has(r.about.id)) return true;
    const cv = conversationOfNeedsKey(idOf(r));
    if (cv !== null && convs.has(cv)) return true;
    const call = callOfKey(idOf(r));
    if (call !== null && callsQueued.has(call)) return true;
    const to = door(r);
    return !!to && to.startsWith("inbox/th-") && convs.has(to.slice("inbox/th-".length));
  };
  const fresh = rows.filter((r) => r.unread && !aboutQueued(r));
  const groups = bellSections(fresh).flatMap((section) => section.lines).map((line) => {
    const { row, members } = line;
    if (line.count < AWAY_GROUP_MIN)
      return { row, count: 1, title: null, ids: [idOf(row)], members, door: door(row) ?? null, action: null };
    return {
      row,
      count: line.count,
      title: line.title,
      ids: members.map(idOf),
      members,
      ...groupDoor(
        row.kind ?? "",
        members.map((m) => door(m))
      )
    };
  });
  const rank = (g) => AWAY_TONE_RANK[g.row.tone] ?? 1;
  const sorted = groups.map((g, i) => ({ g, i })).sort((x, y) => rank(x.g) - rank(y.g) || x.i - y.i).map((x) => x.g);
  const shown = sorted.slice(0, max);
  const stoodFor = shown.reduce((n, g) => n + g.count, 0);
  const total = unreadCount(rows) + older;
  const queued = unreadCount(rows) - fresh.length;
  const more = Math.max(0, total - stoodFor);
  const empty = fresh.length ? null : total === 0 ? { icon: "check", text: AWAY_EMPTY_CLEAR } : queued > 0 ? (
    // The queue above holds the new rows, and the older ones are said beside it: the head counted both.
    { icon: "arrow-up", text: older > 0 ? `${AWAY_EMPTY_QUEUED} ${bellOlderWords(older)}` : AWAY_EMPTY_QUEUED }
  ) : { icon: "bell", text: bellOlderWords(older) };
  return { groups: shown, total, more, queued, foot: awayFoot(more, queued, shown.length > 0), empty };
}
const bellOlderWords = (n) => n === 1 ? "1 older unread notice is not listed. Mark all read clears it." : `${n} older unread notices are not listed. Mark all read clears them.`;
export function bellSections(rows, older = 0) {
  const idOf = (r) => r.id ?? r.key ?? "";
  const part = (label, list) => {
    const order = [];
    const byKind = /* @__PURE__ */ new Map();
    for (const r of list) {
      const k = r.kind && AWAY_NOUN[r.kind] ? r.kind : `@${idOf(r)}`;
      if (!byKind.has(k)) {
        byKind.set(k, []);
        order.push(k);
      }
      byKind.get(k).push(r);
    }
    const lines = [];
    for (const k of order) {
      const members = byKind.get(k) ?? [];
      const noun = AWAY_NOUN[k];
      if (!noun || members.length < AWAY_GROUP_MIN) {
        for (const r of members) lines.push({ key: idOf(r), row: r, count: 1, title: null, members: [r] });
        continue;
      }
      lines.push({
        key: `${label}:${k}`,
        row: members[0],
        count: members.length,
        title: groupTitle(members, noun, idOf),
        members
      });
    }
    return { label, lines };
  };
  return [
    part(
      "New",
      rows.filter((r) => r.unread)
    ),
    part(
      "Earlier",
      rows.filter((r) => !r.unread)
    )
  ].filter((s) => s.lines.length > 0).concat(older > 0 ? [{ label: bellOlderWords(older), lines: [] }] : []);
}
