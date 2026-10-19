import { isReachOutRun } from "../reach-out/reach-out-rules.js";
import { RUN_WAITING_WORDS, heldEmailsWords, runApprovedTail, runStopWords } from "../shell/campaign-rooms.js";
import { plural } from "../shared/words.js";
import { runDraftedEmails, runHeldEmails } from "../waits/waits.js";
import { waitEndsWords } from "../waits/wait-rules.js";
export function todayRunWords(r) {
  const reach = isReachOutRun(r.audience);
  const one = r.recipient_count === 1;
  const people = reach ? `${r.recipient_count} ${one ? "business" : "businesses"}` : `${r.recipient_count} ${one ? "person" : "people"}`;
  const kind = reach ? "Reach-out" : "Campaign";
  const sent = `${r.counts.sent} sent`;
  const held = `${heldEmailsWords(r.held ?? 0)}. The rest of the run goes as planned.`;
  const drafted = `${plural(r.drafted ?? 0, "email", "emails")} to send from your inbox, each written and checked.`;
  const waiting = `${people}. ${waitEndsWords(!reach && r.playbook_id ? "batch_ask" : "leads_batch")}.`;
  return {
    people,
    waiting: {
      meta: `${kind} \xB7 ready`,
      sentence: waiting,
      // The run's one phrase for it (broadcasts.ts BROADCAST_STATE_LABELS), which Sent, Campaigns and the drawer say too.
      status: [RUN_WAITING_WORDS]
    },
    late: { meta: `${kind} \xB7 too late to approve`, status: ["Too late to approve"] },
    soon: {
      meta: `${kind} \xB7 sends ${r.when}`,
      // The verb of Sent's own cancel of a run still to come (campaign-rooms.ts RUN_STOP_WORDS), not a second one.
      sentence: `${people}. ${runStopWords("scheduled").verb} it if you'd rather not.`,
      status: ["Scheduled", `sends ${r.when}`]
    },
    done: { counts: r.counts.replied ? `${sent}, ${r.counts.replied} replied` : sent, still: r.state === "sending" },
    held: {
      meta: `${kind} \xB7 going`,
      sentence: held,
      status: ["Held for your say"]
    },
    drafted: {
      meta: `${kind} \xB7 to send`,
      sentence: drafted,
      status: ["Handed to you"]
    },
    brief: runHeldEmails(r) > 0 ? { waits: "waiting for you", sentence: held } : runDraftedEmails(r) > 0 ? { waits: "waiting for you", sentence: drafted } : { waits: RUN_WAITING_WORDS.toLowerCase(), sentence: waiting }
  };
}
export function todayRunsSub(n) {
  return n ? `${n} run${n === 1 ? "" : "s"} waiting` : null;
}
export function todayLateRunsSub(n) {
  return n ? `${n} run${n === 1 ? "" : "s"} too late to approve` : null;
}
export function todayRunApproved(label, n, when) {
  return { lead: label, rest: runApprovedTail(n, when) };
}
