/**
 * The runs the broadcasts page lists and opens (moved from legacy/pages/broadcasts.jsx, decision 0015): the ledger's
 * runs and the list under the band, the sheet of a run waiting on you, the send screen filled with what a run sent, and
 * the run's own screen.
 */
import type { BroadcastDto, BroadcastVM } from "@chanlytics/contracts";
import { gate } from "../../../legacy-verbs";
import { surfaceValue } from "../../../surface-values";
import { BcRunCard, bcOrigin } from "../ledger";
import { BC_LIVE, BC_NONE, BcRunVerbs, BroadcastDetail } from "../run";
import type { BcApproving, BcBase, BcLedgerOf, BcRunActs, BcSheet, BcV } from "./types";
import { BC_TEXT, bcKey, bcSlots } from "./words";

/** What the acts on a run's card and sheet read of the page. */
type RunActsIn = Pick<BcBase, "canSend" | "armId" | "setArmId" | "stopping" | "openRun"> &
  Pick<BcApproving, "approving"> &
  BcRunActs;

// The ledger's runs: what is open, what went, the list under the band, and the run the address opens.
export function bcLedgerOf({
  data,
  origin,
  band,
  canSend,
  now,
  openRun,
  armId,
  setArmId,
  stopping,
  approving,
  approve,
  cancel,
  openId,
}: Pick<BcBase, "data" | "origin" | "band" | "now" | "openId"> & RunActsIn): BcLedgerOf {
  const rows = data.rows || [];
  const open = rows.filter((r) => r.open);
  const history = rows.filter((r) => !r.open);
  const shownHistory = origin ? history.filter((r) => bcOrigin(r) === origin) : history;
  // The list under the band: a band's runs when one is pressed; else everything
  // open -- what waits on you first, then what is going out, then what is to come
  // -- and the latest five gone, with the way to the rest.
  const RANK: Record<string, number> = { pending_approval: 0, sending: 1, scheduled: 2 };
  const openRows = open
    .slice()
    .sort(
      (a, b) =>
        (RANK[a.state] ?? 3) - (RANK[b.state] ?? 3) ||
        String(a.scheduled_for || "").localeCompare(String(b.scheduled_for || "")),
    );
  const recent = shownHistory.slice(0, 5);
  const runs = band
    ? rows.filter((r) => r.state === band && (r.open || !origin || bcOrigin(r) === origin))
    : [...openRows, ...recent];
  const sentN = rows.filter((r) => r.state === "sent").length;
  const runCard = (row: BroadcastVM) => (
    <BcRunCard
      key={row.id}
      row={row}
      canSend={canSend}
      now={now}
      onOpen={() => openRun(row.id)}
      armed={armId === row.id}
      onArm={(on) => setArmId(on ? row.id : null)}
      stopping={stopping === row.id}
      approving={approving === row.id}
      approve={approve}
      cancel={cancel}
    />
  );
  // The run open on its own screen, when the list holds it: its verbs go at the head of its report. A run older than
  // the newest fifty is read by its id alone, and has finished.
  const openRow = openId ? rows.find((r) => r.id === openId) || null : null;
  return { rows, open, history, shownHistory, openRows, recent, runs, sentN, runCard, openRow };
}

// A run waiting on you, open: its sheet. Where it sits among the runs waiting (the ledger's order), its playbook
// and its template for the words, and the acts -- which, when they land, open the next run waiting, or the ledger.
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
}: Pick<BcBase, "data"> & Pick<BcLedgerOf, "openRows"> & RunActsIn) {
  const sheetFor = (row: BroadcastVM | null): BcSheet | null => {
    if (!row || row.state !== "pending_approval") return null;
    const queue = openRows.filter((r) => r.state === "pending_approval");
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
    const onward = () => openRun(next ? next.id : null);
    return {
      position: at >= 0 ? [at + 1, queue.length] : null,
      canSend,
      playbook: pb,
      template,
      businessName: data.businessName || "",
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

/** What the "send it again" button sets on the send screen. */
type AgainIn = Pick<
  BcBase,
  | "canSend"
  | "templates"
  | "audiences"
  | "link"
  | "setAud"
  | "setTplId"
  | "setSources"
  | "setParams"
  | "setName"
  | "setWhenAt"
  | "setWriting"
  | "openRun"
>;

// Send it again: the send screen, filled with what this run sent -- its template, its list and its values -- when
// all three can still go. A template WhatsApp no longer approves or a broadcast cannot fill, a list since deleted, or
// a playbook's run (whose playbook sends it again) offers no button rather than a composer quietly filled with
// something else.
export function bcAgainOf({
  canSend,
  templates,
  audiences,
  link,
  setAud,
  setTplId,
  setSources,
  setParams,
  setName,
  setWhenAt,
  setWriting,
  openRun,
}: AgainIn) {
  const againFor = (b: BroadcastDto) => {
    if (!canSend || b.playbook_id) return null;
    const t = templates.find((x) => x.id === b.template_id);
    const a = audiences.find((x) => bcKey(x) === bcKey(b.audience || {}));
    if (!t || !a) return null;
    // What filled each slot, where the slot may still take it; else its first choice. A run whose first name was
    // filled by the booking link is sent again with each person's own.
    const may = bcSlots(t, link) || BC_NONE;
    const kinds = (b.params || []).map((p, i) => {
      const c = may[i] || BC_TEXT;
      return p && c.includes(p.kind) ? p.kind : c[0];
    });
    const typedBack = (b.params || []).map((p, i) => (kinds[i] === "text" && p && p.kind === "text" ? p.value : ""));
    return (
      <button
        className="btn"
        data-testid="bc-again"
        onClick={() => {
          setAud(bcKey(a));
          setTplId(t.id);
          setSources((x) => ({ ...x, [t.id]: kinds }));
          setParams((x) => ({ ...x, [t.id]: typedBack }));
          setName("");
          setWhenAt(null);
          setWriting(true);
          openRun(null);
        }}
        {...gate("approve", "send a broadcast")}
      >
        Send it again
      </button>
    );
  };
  return { againFor };
}

/** What the run's own screen reads of the page and of the acts above. */
type SoloIn = Pick<BcBase, "openRun"> &
  Pick<BcLedgerOf, "openRow"> &
  RunActsIn &
  Pick<BcV, "againFor" | "sheetFor"> & { openId: string };

// The run's own screen: its report, with its verbs at the head when it is still live.
export function bcRunSolo({
  openId,
  openRun,
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
    <section className="bc-run-solo" id={`bc-run-${openId}`} data-testid="bc-run-solo">
      <BroadcastDetail
        id={openId}
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
      />
    </section>
  );
}
