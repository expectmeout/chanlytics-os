/**
 * The row over the reply box, and the thread's draft as the box holds it (decision 0093): the draft in the state it is in, never
 * in the box until it is asked for, and what says whose its words are once it is. Moved out of composer.tsx, which draws the
 * boxes and calls these.
 */
import { SECOND_MS, THREAD_PANE_WORDS, type ReplyDraftView } from "@chanlytics/contracts";
import { useEffect, useState } from "react";
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";
import { rewriteDraft, tryDraftAgain, useDraft, wantDrafts } from "../../today/need-you/drafts";
import { FOCUS_COMPOSER_MS } from "../constants";
import { ixOnPhone } from "../rules";
import { gate } from "../shell";
import type { Thread } from "../types";
import type { BoxRef, ComposerDraw } from "./composer";
import { draftWantOfThread } from "./kept-draft";

/** How long Undo stands after Use draft. */
const UNDO_DRAFT_MS = 6 * SECOND_MS;

/** Whether the box holds the draft as it was written: one changed word and the words are the member's. */
export const holdsDraft = (c: Pick<ComposerDraw, "drafted" | "text">): boolean =>
  !!c.drafted && c.text.trim() === c.drafted.trim();

/** Whether the row over the box says something of the draft: where it is coming, ready to use, or could not be written. */
const pillSays = (v: ReplyDraftView | null): boolean =>
  v?.state === "writing" || v?.state === "ready" || v?.state === "failed";

/**
 * The draft's place over the reply box (decision 0093): the thread's one draft in the state it is in, and never in the box
 * until it is asked for. Being written, it says so; ready, Use draft, which puts it in with Undo to give back what was
 * there; not written, why, and Try again where that can change it.
 */
function DraftPill({ c }: { c: ComposerDraw }) {
  const W = THREAD_PANE_WORDS;
  const v = c.draft;
  const [busy, setBusy] = useState(false);
  if (v?.state === "writing")
    return (
      <span className="ix-composer-said" data-state="writing" data-testid="ix-draft-pill">
        <Icon name="spark" size={12} className="ix-composer-drafted-spark" />
        {W.drafting}
      </span>
    );
  if (v?.state === "failed")
    return (
      <span className="ix-composer-said" data-state="failed" data-testid="ix-draft-pill">
        <Icon name="spark" size={12} className="ix-composer-drafted-spark" />
        {v.why}
        {v.again && c.want ? (
          <Button
            variant="quiet"
            size="text"
            className="ix-composer-why ix-press"
            disabled={busy}
            onClick={() => {
              if (!c.want) return;
              setBusy(true);
              void tryDraftAgain(c.want).finally(() => setBusy(false));
            }}
            data-testid="ix-draft-again"
            {...gate("approve", "have the reply drafted again")}
          >
            {W.tryAgain}
          </Button>
        ) : null}
      </span>
    );
  if (v?.state !== "ready") return null;
  return (
    <Button
      variant="soft"
      size="sm"
      className="ix-press"
      aria-label={W.useDraftLabel}
      title={c.drafted?.split("\n").filter(Boolean).slice(0, 2).join("\n")}
      onClick={c.putDraft}
      data-testid="ix-draft-pill"
    >
      <Icon name="spark" size={12} />
      {W.useDraft}
    </Button>
  );
}

/**
 * The one row over the reply box, on a desk and a phone, in a chat's line and an email's box: the draft at its start, as its
 * pill or, once it is in the box unchanged, what says whose it is; Hand back at its end.
 */
export function overRow(c: ComposerDraw) {
  const W = THREAD_PANE_WORDS;
  const inBox = holdsDraft(c);
  const says = inBox || pillSays(c.draft);
  if (!says && !c.undo && !c.aside) return null;
  return (
    <div className="ix-composer-over" data-testid="ix-composer-over">
      {inBox ? draftedLine(c) : says ? <DraftPill c={c} /> : null}
      {c.undo ? (
        <Button
          variant="quiet"
          size="text"
          className="ix-composer-why ix-press"
          aria-label={W.undoDraftLabel}
          onClick={c.undo}
          data-testid="ix-draft-undo"
        >
          {W.undoDraft}
        </Button>
      ) : null}
      <span className="ix-composer-gap" />
      {c.aside}
      <span className="ix-composer-live" aria-live="polite">
        {c.draft?.state === "ready" && !inBox ? W.draftLanded : ""}
      </span>
    </div>
  );
}

/**
 * Over the words, while the box holds Ask's draft as it was written: whose they are, Why this? and Rewrite (the thread
 * canvas, 1 Nov 2026). The draft sat in the box unlabelled and read as the member's own typing; once it is changed, it is
 * theirs.
 */
function draftedLine(c: ComposerDraw) {
  const W = THREAD_PANE_WORDS;
  const [open, setOpen] = c.why;
  const [rewriting, setRewriting] = c.rewrite;
  return (
    <div className="ix-composer-drafted" data-testid="ix-composer-drafted">
      <span className="ix-composer-drafted-words">
        <Icon name="spark" size={12} className="ix-composer-drafted-spark" />
        {W.drafted}
      </span>
      <Button
        variant="quiet"
        size="text"
        className="ix-composer-why ix-press"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        data-testid="ix-composer-why"
      >
        {W.whyThis}
      </Button>
      <Button
        variant="quiet"
        size="text"
        className="ix-composer-why ix-press"
        aria-expanded={rewriting}
        onClick={() => setRewriting(!rewriting)}
        data-testid="ix-composer-rewrite"
        {...gate("approve", "have the draft written again")}
      >
        {W.rewrite}
      </Button>
    </div>
  );
}

/** Why this?, opened: the rule every draft is written by, and what this one was handed (the kept `used`), said by code. */
export function whySaid(c: ComposerDraw) {
  const W = THREAD_PANE_WORDS;
  if (!c.why[0] || !holdsDraft(c)) return null;
  const used = c.draft?.state === "ready" ? (c.draft.draft.used ?? []) : [];
  return (
    <div className="ix-composer-why-said" data-testid="ix-composer-why-said">
      <span className="ix-composer-why-lead">{W.draftWhy}</span>
      {used.length || c.signed ? <span>{W.draftUsed(used, !!c.signed)}</span> : null}
    </div>
  );
}

/** The line that has the receptionist write the box's draft again, as the member asks (Rewrite, above). */
export function RewriteLine({ c }: { c: ComposerDraw }) {
  const W = THREAD_PANE_WORDS;
  const [asked, setAsked] = useState("");
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const go = async () => {
    const how = asked.trim();
    if (!how || busy || !c.want) return;
    setBusy(true);
    setSaid(null);
    const r = await rewriteDraft(c.want, how);
    setBusy(false);
    if (r.ok) {
      c.write(r.words);
      setAsked("");
      c.rewrite[1](false);
    } else setSaid(r.why);
  };
  return (
    <div className="ix-steer ix-composer-rewrite-line" data-testid="ix-composer-rewrite-line">
      <Icon name="spark" size={13} className="ix-steer-spark" />
      <input
        className="ix-steer-input"
        value={asked}
        onChange={(e) => setAsked(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void go();
        }}
        placeholder={W.rewriteAsk}
        maxLength={500}
        disabled={busy}
        aria-label={W.rewriteLabel}
      />
      <Button
        variant="soft"
        size="sm"
        className="ix-press"
        onClick={go}
        disabled={busy || !asked.trim()}
        {...gate("approve")}
      >
        {busy ? W.rewriting : W.rewrite}
      </Button>
      {said ? (
        <span className="ix-composer-rewrite-said" role="status">
          {said}
        </span>
      ) : null}
    </div>
  );
}

/**
 * The thread's draft as the box holds it: in whichever state it is (kept-draft.ts), read by the thread where the first reads
 * did not hold it; Use draft, which puts its words in; and Undo, which gives back what they replaced for a few seconds.
 */
export function useThreadDraft(thread: Thread, box: { text: string; write: (v: string) => void; taRef: BoxRef }) {
  const { text, write, taRef } = box;
  const want = draftWantOfThread(thread);
  const draft = useDraft(want);
  const wantKey = want ? `${want.conversationId}:${want.forMessageId ?? ""}` : "";
  useEffect(() => {
    if (want) void wantDrafts([want]);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- asked by its key: the thread drawn again for its message asks nothing
  }, [wantKey]);
  const drafted = draft?.state === "ready" ? draft.draft.words.text : null;
  const [undoTo, setUndoTo] = useState<string | null>(null);
  const [landed, setLanded] = useState(false);
  useEffect(() => {
    if (undoTo === null) return;
    const gone = window.setTimeout(() => setUndoTo(null), UNDO_DRAFT_MS);
    return () => window.clearTimeout(gone);
  }, [undoTo]);
  const putDraft = () => {
    if (!drafted) return;
    setUndoTo(text);
    write(drafted);
    setLanded(true);
    // A desk writes on from its end. A phone keeps its keys down: the draft may be sent as it is.
    if (ixOnPhone()) return;
    window.setTimeout(() => {
      const field = taRef.current;
      if (!field) return;
      field.focus({ preventScroll: true });
      field.setSelectionRange(field.value.length, field.value.length);
    }, FOCUS_COMPOSER_MS);
  };
  const undo =
    undoTo === null
      ? null
      : () => {
          write(undoTo);
          setUndoTo(null);
        };
  return { want, draft, drafted, putDraft, undo, landed, settled: () => setLanded(false) };
}
