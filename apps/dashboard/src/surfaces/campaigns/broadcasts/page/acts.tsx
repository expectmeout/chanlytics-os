/**
 * What a press on the broadcasts page does (moved from legacy/pages/broadcasts.jsx, decision 0015): stop and approve on
 * a run, the send itself, and the starter set added from the send screen. Each says so the moment the server takes it.
 */
import type { Output } from "@/client/api";
import { starterWords } from "../../templates/composer";
import { templates } from "../../templates/verbs";
import { broadcasts } from "../verbs";
import type { SendBody } from "../verbs";
import { bcWhenWords } from "../when";
import type { BcActRow, BcApproving, BcBase, BcReach, BcRunActs, BcSendActs, BcSlotWords } from "./types";

// Stop and approve, on a run: each said the moment the server takes it.
export function bcRunActs({
  canSend,
  stopping,
  setStopping,
  setArmId,
  flash,
  approvingRef,
  setApproving,
}: Pick<BcBase, "canSend" | "stopping" | "setStopping" | "setArmId" | "flash"> &
  Pick<BcApproving, "approvingRef" | "setApproving">): BcRunActs {
  const cancel = async (row: BcActRow) => {
    if (stopping || !canSend) return false;
    setStopping(row.id);
    // Said the moment the server takes it, from what it answered; the ledger repaints from the re-read behind it.
    let said = false;
    const say = (data: Output<"POST broadcasts/[id]/cancel">) => {
      said = true;
      setStopping(null);
      setArmId(null);
      flash({
        tone: "ok",
        msg: (
          <>
            <b>{row.name}</b>{" "}
            {data.was === "sending"
              ? "stops after this batch"
              : data.was === "pending_approval"
                ? "skipped — nothing will send"
                : "canceled — nothing will send"}
          </>
        ),
      });
    };
    const r = await broadcasts.cancel(row.id, { onAccepted: say });
    if (!r.ok) {
      setStopping(null);
      setArmId(null);
      flash({ tone: "danger", msg: <>{r.message}</> });
    } else if (!said) say(r.data);
    return r.ok;
  };
  const approve = async (row: BcActRow, words: string | null = null) => {
    if (!canSend || approvingRef.current) return false;
    approvingRef.current = row.id;
    setApproving(row.id);
    // Said the moment the server takes it, from what it answered: how many, and when it really goes.
    let said = false;
    const say = (data: Output<"POST broadcasts/[id]/approve">) => {
      said = true;
      approvingRef.current = null;
      setApproving(null);
      flash({
        tone: "ok",
        msg:
          typeof words === "string" ? (
            <>{words}</>
          ) : (
            <>
              <b>{row.name}</b> approved — {data.recipient_count} {data.recipient_count === 1 ? "person" : "people"},{" "}
              {bcWhenWords(data)}
            </>
          ),
      });
    };
    const r = await broadcasts.approve(row.id, { onAccepted: say });
    if (!r.ok) {
      approvingRef.current = null;
      setApproving(null);
      flash({ tone: "danger", msg: <>{r.message}</> });
    } else if (!said) say(r.data);
    return r.ok;
  };
  return { cancel, approve };
}

// The send, and the starter set added from the send screen.
export function bcSendActs({
  ready,
  canSend,
  setBusy,
  tpl,
  specs,
  active,
  whenAt,
  name,
  setArmed,
  flash,
  work,
  clearWords,
  setWriting,
  data,
  cancel,
  addingStarters,
  setAddingStarters,
}: Pick<
  BcBase,
  | "canSend"
  | "setBusy"
  | "whenAt"
  | "name"
  | "setArmed"
  | "flash"
  | "work"
  | "clearWords"
  | "setWriting"
  | "data"
  | "addingStarters"
  | "setAddingStarters"
> &
  Pick<BcSlotWords, "ready" | "specs"> &
  Pick<BcReach, "tpl" | "active"> &
  Pick<BcRunActs, "cancel">): BcSendActs {
  const submit = async (scheduled: boolean) => {
    // `ready` says both are there (bcSlotWordsOf); the two are named again for the compiler.
    if (!ready || !canSend || !tpl || !active) return;
    setBusy(true);
    const r = await broadcasts.send({
      template_id: tpl.id,
      params: specs as SendBody["params"],
      audience: { kind: active.kind, id: active.id },
      scheduled_for: scheduled && whenAt !== null ? new Date(whenAt).toISOString() : null,
      name: name.trim() || null,
    });
    setBusy(false);
    setArmed(false);
    if (!r.ok) {
      flash({ tone: "danger", msg: <>{r.message}</> });
      return;
    }
    work.done();
    clearWords();
    // Sent, the screen closes onto the ledger, where the run now is -- and "See who" opens it.
    setWriting(false);
    const n = r.data.recipient_count;
    // Outside nine to twenty by the business's clock the send moved to the next
    // nine o'clock: the receipt says when it really goes (bcWhenWords).
    const words = bcWhenWords(r.data);
    // The one door out, offered where the send is announced rather than 400px
    // down the page. It is not an Undo and is not called one: a message already
    // out stays out, which is what the row's own Stop says, so the toast carries
    // the same verb and the same promise. A scheduled run has sent nothing yet.
    const waits = words !== "sending now";
    flash({
      msg: (
        <>
          <b>{r.data.name || "Broadcast"}</b> · {n} {n === 1 ? "person" : "people"} —{" "}
          {words === "sending now" && data.chunk ? `sending now, ${data.chunk} at a time` : words}
        </>
      ),
      action: canSend
        ? {
            label: waits ? "Cancel it" : "Stop it",
            onClick: () =>
              cancel({ id: r.data.id, name: r.data.name || "Broadcast", state: waits ? "scheduled" : "sending" }),
          }
        : null,
      links: [{ label: "See who", to: `broadcasts/run:${r.data.id}` }],
    });
  };
  const addStarters = async () => {
    if (addingStarters) return;
    setAddingStarters(true);
    const r = await templates.addStarters({ languages: ["en_US"] });
    setAddingStarters(false);
    flash({ tone: r.ok ? "ok" : "danger", msg: r.ok ? <>{starterWords(r.data)}</> : <>{r.message}</> });
  };
  return { submit, addStarters };
}
