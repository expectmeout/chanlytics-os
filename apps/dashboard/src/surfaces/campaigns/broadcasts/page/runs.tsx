/**
 * The runs Sent's sheets open (moved from legacy/pages/broadcasts.jsx, decision 0015): the run the address opens and those
 * still to go out, the sheet of a run waiting on you, Send it again, and the run's own screen. Sent's list went to each
 * sequence's History (decision 0060, D3): a run is opened from there, or from a link, a bell row or Ask's card.
 */
import { runTooLate, sendOnceRoute, type BroadcastDto, type BroadcastVM } from "@chanlytics/contracts";
import { Button } from "../../../kit/button/button";
import { keepTabDraft } from "../../../kit/record/work";
import { gate, navigate } from "../../../legacy-verbs";
import { surfaceValue } from "../../../surface-values";
import { BC_LIVE, BC_NONE, BcRunVerbs, BroadcastDetail } from "../run";
import type { BcApproving, BcBase, BcKept, BcRunActs, BcRunsOf, BcSheet, BcV } from "./types";
import { cmOfferedBy } from "../../parts/channels";
import { approvalDaysNow } from "../when-words";
import { BC_TEXT, bcKey, bcSlots } from "./words";

/** What the acts on a run's card and sheet read of the page. */
type RunActsIn = Pick<BcBase, "canSend" | "armId" | "setArmId" | "stopping" | "openRun"> &
  Pick<BcApproving, "approving"> &
  BcRunActs;

// The runs a sheet reads: those still to go out, what waits on you first, then what is going out, then what is to come; and
// the run the address opens, when the read holds it (a run older than the newest fifty is read by its id alone).
export function bcRunsOf({ data, openId }: Pick<BcBase, "data" | "openId">): BcRunsOf {
  const rows = data.rows || [];
  const RANK: Record<string, number> = { pending_approval: 0, sending: 1, scheduled: 2 };
  const openRows = rows
    .filter((r) => r.open)
    .sort(
      (a, b) =>
        (RANK[a.state] ?? 3) - (RANK[b.state] ?? 3) ||
        String(a.scheduled_for || "").localeCompare(String(b.scheduled_for || "")),
    );
  const openRow = openId ? rows.find((r) => r.id === openId) || null : null;
  return { rows, openRows, openRow };
}

// A run waiting on you, open: its sheet. Where it sits among the runs waiting (the order above), its playbook and its
// template for the words, and the acts -- which, when they land, open the next run waiting, or leave this run open as it
// now is (going, or skipped), with the toast that says so: closing then goes back to where it was opened from. They closed
// onto Sequences, and the toast went with the page.
export function bcSheetOf({
  openRows,
  data,
  openRun,
  canSend,
  armId,
  setArmId,
  stopping,
  approving,
  approve,
  cancel,
}: Pick<BcBase, "data"> & Pick<BcRunsOf, "openRows"> & RunActsIn) {
  const sheetFor = (row: BroadcastVM | null): BcSheet | null => {
    if (!row || row.state !== "pending_approval") return null;
    // Those an OK can still send: one whose day has passed waits on nobody (contracts runTooLate), and is neither counted
    // in "1 of N" nor opened next (the framework's rating, 19 Oct 2026).
    const days = approvalDaysNow();
    const queue = openRows.filter((r) => r.state === "pending_approval" && !runTooLate(r, days));
    const at = queue.findIndex((r) => r.id === row.id);
    const rest = queue.filter((r) => r.id !== row.id);
    const next = rest[Math.min(Math.max(at, 0), rest.length - 1)] || null;
    // The surfaces this page does not own, read as they stand as the sheet is drawn (as the JSX read the window's).
    const playbooks = surfaceValue("playbooks");
    const pb =
      playbooks && Array.isArray(playbooks.rows) ? playbooks.rows.find((p) => p.id === row.playbook_id) || null : null;
    const pool = [...(data.templates || BC_NONE), ...(surfaceValue("settings")?.templatesAll || BC_NONE)];
    const template =
      pool.find((t) => t.id === row.template_id) ||
      pool.find((t) => t.name === row.template_name && t.language === row.template_language) ||
      null;
    const onward = () => {
      if (next) openRun(next.id);
    };
    return {
      position: at >= 0 ? [at + 1, queue.length] : null,
      canSend,
      playbook: pb,
      template,
      businessName: data.businessName || "",
      businessAddress: data.businessAddress ?? null,
      paused: data.ready ? data.ready.paused === true : null,
      armed: armId === row.id,
      onArm: (on: boolean) => setArmId(on ? row.id : null),
      stopping: stopping === row.id,
      approving: approving === row.id,
      approve: async (words?: unknown) => {
        if (await approve(row, typeof words === "string" ? words : null)) onward();
      },
      skip: async () => {
        if (await cancel(row)) onward();
      },
    };
  };
  return { sheetFor };
}

/** What Send it again reads of the page. */
type AgainIn = Pick<BcBase, "canSend" | "templates" | "audiences" | "link" | "review">;

// Send it again: New's Send once (sequence-address sendOnceRoute), filled with what this run sent -- its template, its list and its
// values -- when all three can still go: kept as the tab keeps a send half-written, which the composer opens on
// (state.tsx useBcList). A message with no version a broadcast can send or fill, a list since deleted, or a playbook's
// run (whose playbook sends it again) offers no button rather than a composer quietly filled with something else.
export function bcAgainOf({ canSend, templates, audiences, link, review }: AgainIn) {
  const againFor = (b: BroadcastDto) => {
    if (!canSend || b.playbook_id) return null;
    // The message it sent, by its name and language: a WhatsApp version added since moves the id the picker lists it by.
    const t = cmOfferedBy(templates, b.template_name, b.template_language);
    const a = audiences.find((x) => bcKey(x) === bcKey(b.audience || {}));
    if (!t || !a) return null;
    // What filled each slot, where the slot may still take it; else its first choice. A run whose first name was
    // filled by the booking link is sent again with each person's own.
    const may = bcSlots(t, { bookingLink: link, reviewLink: review }) || BC_NONE;
    const kinds = (b.params || []).map((p, i) => {
      const c = may[i] || BC_TEXT;
      return p && c.includes(p.kind) ? p.kind : c[0];
    });
    const typedBack = (b.params || []).map((p, i) => (kinds[i] === "text" && p && p.kind === "text" ? p.value : ""));
    const send: BcKept = {
      aud: bcKey(a),
      tplId: t.id,
      sources: { [t.id]: kinds },
      params: { [t.id]: typedBack },
      name: "",
      whenAt: null,
    };
    return (
      <Button
        data-testid="bc-again"
        onClick={() => {
          keepTabDraft("broadcast", send);
          navigate(sendOnceRoute());
        }}
        {...gate("approve", "send a message")}
      >
        Send it again
      </Button>
    );
  };
  return { againFor };
}

/** What the run's own screen reads of the page and of the acts above. */
type SoloIn = Pick<BcBase, "openRun" | "flash"> &
  Pick<BcRunsOf, "openRow"> &
  RunActsIn &
  Pick<BcV, "againFor" | "sheetFor"> & { openId: string };

// The run's own pane beside Sequences' list (the report draws it, whatever state it is in): its verbs at its head while it is
// still live, and the name its row has for it while the report is read.
export function bcRunSolo({
  openId,
  openRun,
  flash,
  openRow,
  canSend,
  armId,
  setArmId,
  stopping,
  approving,
  approve,
  cancel,
  againFor,
  sheetFor,
}: SoloIn) {
  return (
    <BroadcastDetail
      // One run's filter and expanded rows are state of that run: keyed by it, the next run opens fresh.
      key={openId}
      id={openId}
      name={openRow ? openRow.name : null}
      onClose={() => openRun(null)}
      acts={
        openRow && BC_LIVE.has(openRow.state) ? (
          <BcRunVerbs
            row={openRow}
            canSend={canSend}
            armed={armId === openRow.id}
            onArm={(on) => setArmId(on ? openRow.id : null)}
            stopping={stopping === openRow.id}
            approving={approving === openRow.id}
            approve={approve}
            cancel={cancel}
          />
        ) : null
      }
      again={againFor}
      sheet={sheetFor(openRow)}
      flash={flash}
    />
  );
}
