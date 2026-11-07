/**
 * How it reaches out (decision 0113): Try it on a lead. At rest a card of one row, as How it answers' Rehearse is; open,
 * the kit's sheet, with one real email: the newest running sequence's first email for the first business its search
 * would write to, through the preview door the sequence's sheet was built with (POST reach-outs/preview: the check's own
 * writer and reader and the sender's own assembly, nothing stored, Ask's day spent as a lead's draft spends it). The
 * opening written for them and each claim the words carry are marked where they stand (contracts tryPartsOf); what the
 * check said is said under it; Another lead goes to the next business, Write another asks for this one again.
 */
import { useEffect, useState } from "react";
import {
  REACH_OUT_PREVIEW_INDEX_MAX,
  REACH_OUT_SETTINGS_WORDS,
  newForLeadsRoute,
  sequenceRoute,
  tryPartsOf,
  type ReachOutPreviewDto,
  type ReachOutSettingsDto,
} from "@chanlytics/contracts";
import { api } from "@/bridge/api";
import { navigate } from "../../frame-verbs";
import { Button } from "../../kit/button/button";
import { useRecordFold } from "../../kit/record/hooks";
import { recFolds } from "../../kit/record/registry";
import { RecordRow } from "../../kit/record/row";
import { RecordSheet } from "../../kit/record/sheet";
import { OutreachCard } from "./card";

const W = REACH_OUT_SETTINGS_WORDS.try;

/** A tried email, or what stood in its way, by the business it was asked for. */
type Tried = { at: number; preview: ReachOutPreviewDto | null; refused: string | null };

/** One email for the business at `at`, written as the sequence would write it now. */
async function previewAt(seq: NonNullable<ReachOutSettingsDto["sequence"]>, at: number, signedBy: string | null) {
  const r = await api()("POST reach-outs/preview", {
    body: {
      search_id: seq.search_id ?? "",
      index: at,
      include_unconfirmed: seq.include_unconfirmed,
      words: seq.first,
      signed_by: seq.signed_by ?? signedBy,
      signs_with: seq.signs_with,
      mailbox_id: seq.mailbox_id,
      language: "en",
    },
  });
  return r.ok ? { preview: r.data.preview, refused: null } : { preview: null, refused: r.message };
}

/** The tried email in its parts, each marked by where it came from. */
const TriedEmail = ({ preview, claims }: { preview: ReachOutPreviewDto; claims: readonly string[] }) => (
  <div className="ro-try-mail" data-testid="rec-try-mail">
    <p className="ro-try-head">
      <span>{W.to}</span> {preview.lead?.email}
      <br />
      <span>{W.subject}</span> <b>{preview.subject}</b>
    </p>
    <p className="ro-try-body">
      {tryPartsOf(preview.body ?? "", preview.opening, claims).map((p, i) =>
        p.source === "words" ? (
          <span key={i}>{p.text}</span>
        ) : (
          <mark key={i} className={`ro-mark ro-mark-${p.source}`} data-testid={`rec-try-mark-${p.source}`}>
            {p.text}
          </mark>
        ),
      )}
    </p>
  </div>
);

/** Try it: the card at rest, and its sheet while it is open. */
export function TryCard({
  read,
  signedBy,
  claims,
}: {
  read: ReachOutSettingsDto | null;
  signedBy: string | null;
  claims: readonly string[];
}) {
  const fold = useRecordFold("try_lead", { dirty: false });
  useEffect(() => recFolds.drawn("try_lead"), []);
  const seq = read?.sequence?.search_id ? read.sequence : null;
  const [at, setAt] = useState(0);
  const [round, setRound] = useState(0);
  const [tried, setTried] = useState<Tried | null>(null);
  useEffect(() => {
    if (!fold.open || !seq) return;
    let live = true;
    setTried(null);
    previewAt(seq, at, signedBy).then(
      (r) => {
        if (live) setTried({ at, ...r });
      },
      () => {
        if (live) setTried({ at, preview: null, refused: W.unavailable });
      },
    );
    return () => {
      live = false;
    };
  }, [fold.open, seq, at, round, signedBy]);
  const preview = tried?.preview ?? null;
  const why = preview?.refused ?? preview?.detail ?? null;
  return (
    <OutreachCard id="try" title={W.title} sub={W.sub}>
      <RecordRow
        id="try_lead"
        label={W.key}
        value={W.value}
        act={{ label: W.act, icon: "chevron", onClick: () => fold.request() }}
      />
      {fold.open ? (
        <RecordSheet
          id="try_lead"
          title={W.title}
          onClose={fold.close}
          foot={
            seq ? (
              <span data-foot-pair>
                <Button size="sm" onClick={() => setRound((n) => n + 1)} data-testid="rec-try-again">
                  {W.rewrite}
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => {
                    fold.close();
                    navigate(sequenceRoute(seq.root_id));
                  }}
                  data-testid="rec-try-open"
                >
                  {W.open}
                </Button>
              </span>
            ) : null
          }
          testid="rec-try-sheet"
        >
          <div className="bt-stack" data-testid="rec-try-body">
            {!seq ? (
              <>
                <p className="bt-fold-note" data-testid="rec-try-none">
                  {W.none}
                </p>
                <Button size="sm" onClick={() => navigate(newForLeadsRoute())} data-testid="rec-try-new">
                  {W.noneAct}
                </Button>
              </>
            ) : !tried ? (
              <p className="bt-fold-note">…</p>
            ) : (
              <>
                <p className="ro-try-lead" data-testid="rec-try-lead">
                  <b>{preview?.lead?.business_name ?? seq.name}</b>
                  <Button
                    size="sm"
                    variant="quiet"
                    onClick={() => setAt((n) => Math.min(n + 1, REACH_OUT_PREVIEW_INDEX_MAX))}
                    data-testid="rec-try-another"
                  >
                    {W.another}
                  </Button>
                </p>
                <p className="ro-legend" aria-hidden="true">
                  <mark className="ro-mark ro-mark-them">{W.legend.them}</mark>{" "}
                  <mark className="ro-mark ro-mark-proof">{W.legend.proof}</mark> <span>{W.legend.words}</span>
                </p>
                {preview?.body ? <TriedEmail preview={preview} claims={claims} /> : null}
                <p className="bt-fold-note" data-testid="rec-try-check">
                  {tried.refused ?? (preview?.unavailable ? W.unavailable : why ? W.held(why) : W.checked)}
                </p>
                {preview?.angle ? <p className="bt-fold-note">{W.leans(preview.angle)}</p> : null}
                {seq.next ? (
                  <p className="bt-fold-note" data-testid="rec-try-next">
                    <b>{W.next(seq.next.after_days)}</b>
                    <br />
                    {seq.next.body.split("\n")[0]}
                  </p>
                ) : null}
                <p className="bt-fold-note">{W.hint}</p>
              </>
            )}
          </div>
        </RecordSheet>
      ) : null}
    </OutreachCard>
  );
}
