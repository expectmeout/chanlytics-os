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

const TRY_CARD = REACH_OUT_SETTINGS_WORDS.try;

/** A tried email, or what stood in its way, by the business it was asked for. */
type Tried = { at: number; preview: ReachOutPreviewDto | null; refused: string | null };

/** One email for the business at `at`, written as the sequence would write it now. */
async function previewAt(seq: NonNullable<ReachOutSettingsDto["sequence"]>, at: number, signedBy: string | null) {
  const answer = await api()("POST reach-outs/preview", {
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
  return answer.ok ? { preview: answer.data.preview, refused: null } : { preview: null, refused: answer.message };
}

/** The tried email in its parts, each marked by where it came from. */
const TriedEmail = ({ preview, claims }: { preview: ReachOutPreviewDto; claims: readonly string[] }) => (
  <div className="ro-try-mail" data-testid="rec-try-mail">
    <p className="ro-try-head">
      <span>{TRY_CARD.to}</span> {preview.lead?.email}
      <br />
      <span>{TRY_CARD.subject}</span> <b>{preview.subject}</b>
    </p>
    <p className="ro-try-body">
      {tryPartsOf(preview.body ?? "", preview.opening, claims).map((p, i) =>
        p.source === "words" ? (
          <span key={i}>{p.text}</span>
        ) : (
          <mark key={i} className={`ro-from ro-from-${p.source}`} data-testid={`rec-try-mark-${p.source}`}>
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
  const tried = useTried(fold.open, seq, signedBy, { at, round });
  return (
    <OutreachCard id="try" title={TRY_CARD.title} sub={TRY_CARD.sub}>
      <RecordRow
        id="try_lead"
        label={TRY_CARD.key}
        value={TRY_CARD.value}
        act={{ label: TRY_CARD.act, icon: "chevron", onClick: () => fold.request() }}
      />
      {fold.open ? (
        <RecordSheet
          id="try_lead"
          title={TRY_CARD.title}
          onClose={fold.close}
          foot={seq ? <TryFoot seq={seq} again={() => setRound((n) => n + 1)} close={fold.close} /> : null}
          testid="rec-try-sheet"
        >
          <div className="bt-stack" data-testid="rec-try-body">
            {!seq ? (
              <TryNone />
            ) : !tried ? (
              <p className="bt-fold-note">…</p>
            ) : (
              <TriedBody
                seq={seq}
                tried={tried}
                claims={claims}
                another={() => setAt((n) => Math.min(n + 1, REACH_OUT_PREVIEW_INDEX_MAX))}
              />
            )}
          </div>
        </RecordSheet>
      ) : null}
    </OutreachCard>
  );
}

type TriedSequence = NonNullable<ReachOutSettingsDto["sequence"]>;

/** The email tried for the business at `at`, asked again whenever the sheet opens, another is asked for, or a rewrite. */
function useTried(
  open: boolean,
  seq: TriedSequence | null,
  signedBy: string | null,
  { at, round }: { at: number; round: number },
): Tried | null {
  const [tried, setTried] = useState<Tried | null>(null);
  useEffect(() => {
    if (!open || !seq) return;
    let live = true;
    setTried(null);
    previewAt(seq, at, signedBy).then(
      (answer) => {
        if (live) setTried({ at, ...answer });
      },
      () => {
        if (live) setTried({ at, preview: null, refused: TRY_CARD.unavailable });
      },
    );
    return () => {
      live = false;
    };
  }, [open, seq, at, round, signedBy]);
  return tried;
}

/** With no running sequence to leads there is nothing to try: say to start one. */
const TryNone = () => (
  <>
    <p className="bt-fold-note" data-testid="rec-try-none">
      {TRY_CARD.none}
    </p>
    {/* Held to its own width: the stack would stretch it across the sheet. */}
    <span>
      <Button size="sm" onClick={() => navigate(newForLeadsRoute())} data-testid="rec-try-new">
        {TRY_CARD.noneAct}
      </Button>
    </span>
  </>
);

/** The sheet's foot: write it again, or open the sequence it was written from. */
const TryFoot = ({ seq, again, close }: { seq: TriedSequence; again: () => void; close: () => void }) => (
  <span data-foot-pair>
    <Button size="sm" onClick={again} data-testid="rec-try-again">
      {TRY_CARD.rewrite}
    </Button>
    <Button
      size="sm"
      variant="primary"
      onClick={() => {
        close();
        navigate(sequenceRoute(seq.root_id));
      }}
      data-testid="rec-try-open"
    >
      {TRY_CARD.open}
    </Button>
  </span>
);

/** What the preview's check said: why it was held, that it could not be written, or that it passed. */
function checkLine(tried: Tried): string {
  const preview = tried.preview;
  const reason = preview?.refused ?? preview?.detail ?? null;
  if (tried.refused) return tried.refused;
  if (preview?.unavailable) return TRY_CARD.unavailable;
  return reason ? TRY_CARD.held(reason) : TRY_CARD.checked;
}

/** The tried email: whose it is, where each line came from, what the check said, and the step after it. */
const TriedBody = ({
  seq,
  tried,
  claims,
  another,
}: {
  seq: TriedSequence;
  tried: Tried;
  claims: readonly string[];
  another: () => void;
}) => {
  const preview = tried.preview;
  return (
    <>
      <p className="ro-try-lead" data-testid="rec-try-lead">
        <b>{preview?.lead?.business_name ?? seq.name}</b>
        <Button size="sm" variant="quiet" onClick={another} data-testid="rec-try-another">
          {TRY_CARD.another}
        </Button>
      </p>
      <p className="ro-legend" aria-hidden="true">
        <mark className="ro-from ro-from-them">{TRY_CARD.legend.them}</mark>{" "}
        <mark className="ro-from ro-from-proof">{TRY_CARD.legend.proof}</mark> <span>{TRY_CARD.legend.words}</span>
      </p>
      {preview?.body ? <TriedEmail preview={preview} claims={claims} /> : null}
      <p className="bt-fold-note" data-testid="rec-try-check">
        {checkLine(tried)}
      </p>
      {preview?.angle ? <p className="bt-fold-note">{TRY_CARD.leans(preview.angle)}</p> : null}
      {seq.next ? (
        <p className="bt-fold-note" data-testid="rec-try-next">
          <b>{TRY_CARD.next(seq.next.after_days)}</b>
          <br />
          {seq.next.body.split("\n")[0]}
        </p>
      ) : null}
      <p className="bt-fold-note">{TRY_CARD.hint}</p>
    </>
  );
};
