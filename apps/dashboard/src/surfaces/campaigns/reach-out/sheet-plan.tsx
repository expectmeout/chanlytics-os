/**
 * The reach-out sheet's plan (moved from legacy/pages/reach-out/reach-out-sheet.jsx, decision 0015; Reach out, Part 4 PR
 * 6): the pace, the mailboxes it writes from, and what one business's email reads as before it goes. The preview spends the
 * model (R12), so it is asked for by a press and never on its own.
 */
import { Fragment, useState } from "react";
import {
  mailboxDailyCap,
  mailboxWords,
  type MailboxConnectionDto,
  type MailboxProvider,
  type ReachOutDraft,
  type ReachOutPreviewDto,
  type ReachOutPreviewInput,
} from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { LinkButton } from "../../kit/link-button/link-button";
import { Picker } from "../../kit/picker/picker";
import { Switch } from "../../kit/switch/switch";
import { cmChevron, cmNumbers } from "../parts/picks";
import { connectedMailboxes } from "../../settings/connections/connected-mailboxes";
import { reachOuts } from "./surface";

type Words = typeof reachOuts.words;

interface PaceProps {
  W: Words;
  pace: { share: number; mailboxes: number; rises: number | null };
  gap: number;
  onGap: (minutes: number) => void;
  /** Its owner sends it (00429): their day's share, and no gap to choose. */
  ownerSends: boolean;
}

/**
 * The pace: the mailboxes' day and the gap, why it is recommended, and when the first run goes; for a reach-out its owner
 * sends, the day's share handed to them, with nothing to choose.
 */
export function RoPace({ W, pace, gap, onGap, ownerSends }: PaceProps) {
  if (ownerSends) {
    const owner = W.ownerPaceWords();
    return (
      <section className="pb-sec" data-testid="ro-pace">
        <span className="pb-sec-k">{W.REACH_OUT_SHEET_PARTS.pace}</span>
        <p className="pb-when" data-testid="ro-pace-owner">
          {owner.line}
        </p>
        <p className="pb-rules-line">
          <b>{W.REACH_OUT_SHEET_PARTS.recommended}</b> · {owner.why}
        </p>
        <p className="pb-note">{W.REACH_OUT_SHEET_WORDS.first}</p>
      </section>
    );
  }
  const words = W.paceWords({ share: pace.share, mailboxes: pace.mailboxes, rises: pace.rises, gapMinutes: gap });
  const gaps = W.REACH_OUT_GAP_MINUTES.map((m) => ({ v: m, t: `${m} min` }));
  return (
    <section className="pb-sec" data-testid="ro-pace">
      <span className="pb-sec-k">{W.REACH_OUT_SHEET_PARTS.pace}</span>
      <p className="pb-when">
        {words.parts[1]}
        {words.parts[2]}
        <Picker
          label="How long between emails"
          value={String(gap)}
          onValueChange={(v) => onGap(Number(v))}
          groups={cmNumbers(gaps)}
          chevron={cmChevron()}
          data-testid="ro-gap"
        />
        {words.parts[4]}
      </p>
      <p className="pb-rules-line">
        <b>{W.REACH_OUT_SHEET_PARTS.recommended}</b> · {words.why}
      </p>
      <p className="pb-note">{W.REACH_OUT_SHEET_WORDS.first}</p>
    </section>
  );
}

interface FromProps {
  W: Words;
  mailboxes: MailboxConnectionDto[];
  providers: MailboxProvider[];
  unread: string | null;
  draft: ReachOutDraft;
  /** Its owner sends it (00429): chosen, or the one way it can go with no mailbox connected. */
  ownerSends: boolean;
  onPick: (ids: string[]) => void;
  onOwner: (on: boolean) => void;
}

/** What a mailbox writes in a day as the picker says it, or why it writes nothing now (contracts' words). */
function mailboxDayWords(m: MailboxConnectionDto, now: number): string {
  if (m.state !== "connected") return mailboxWords(m, now).pill;
  return `${mailboxDailyCap(m)} a day${m.customer_domain ? " · customer domain" : ""}`;
}

/** The Connect buttons, one per provider this deployment offers. */
function RoConnect({ W, providers }: { W: Words; providers: MailboxProvider[] }) {
  const P = W.REACH_OUT_SHEET_PARTS;
  return (
    <p className="pb-note">
      {providers.map((p) => (
        <Fragment key={p}>
          <Button size="sm" onClick={() => connectedMailboxes.connect(p)} data-testid={`ro-connect-${p}`}>
            {p === "google" ? P.connectGoogle : P.connectMicrosoft}
          </Button>{" "}
        </Fragment>
      ))}
    </p>
  );
}

/**
 * From: you, from your own inbox (00429: each email handed to you written and checked), or the mailboxes it writes from:
 * every connected one, or up to ten picked, each with what it writes in a day. With none connected the owner sends it,
 * the one way it can go, and Connect is beside it where this deployment offers one; unread is said as reading, and
 * Start waits. Each business hears from one sender for its chain.
 */
export function RoFrom({ W, mailboxes, providers, unread, draft, ownerSends, onPick, onOwner }: FromProps) {
  const P = W.REACH_OUT_SHEET_PARTS;
  if (unread)
    return (
      <section className="pb-sec" data-testid="ro-from">
        <span className="pb-sec-k">{P.from}</span>
        <p className="pb-note" data-testid="ro-unread">
          {unread}
        </p>
      </section>
    );
  const none = mailboxes.length === 0;
  const owner = (
    <label className="ro-domain">
      <Switch
        checked={ownerSends}
        readOnly={none}
        onCheckedChange={(on) => onOwner(on)}
        labelledBy="ro-owner-sends-name"
        data-testid="ro-owner-sends"
      />
      <span id="ro-owner-sends-name">{P.youSend}</span>
    </label>
  );
  if (none || ownerSends)
    return (
      <section className="pb-sec" data-testid="ro-from">
        <span className="pb-sec-k">{P.from}</span>
        {owner}
        <p className="pb-note" data-testid="ro-owner-sends-words">
          {W.REACH_OUT_SHEET_WORDS.ownerSends}
        </p>
        {none && providers.length > 0 && (
          <>
            <p className="pb-note" data-testid="ro-no-mailbox">
              {W.REACH_OUT_SHEET_WORDS.ownerNoMailbox}
            </p>
            <RoConnect W={W} providers={providers} />
          </>
        )}
      </section>
    );
  const picked = draft.mailbox_ids;
  const more = W.reachOutMayPickMailbox(draft);
  const toggle = (id: string) => onPick(picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id]);
  const now = Date.now();
  return (
    <section className="pb-sec" data-testid="ro-from">
      <span className="pb-sec-k">{P.from}</span>
      {owner}
      <label className="ro-domain">
        <Switch
          checked={picked.length === 0}
          onCheckedChange={() => onPick([])}
          labelledBy="ro-mailbox-every-name"
          data-testid="ro-mailbox-every"
        />
        <span id="ro-mailbox-every-name">{P.everyMailbox}</span>
      </label>
      {mailboxes.map((m) => (
        <label key={m.id} className="ro-domain">
          <Switch
            checked={picked.includes(m.id)}
            readOnly={!more && !picked.includes(m.id)}
            onCheckedChange={() => toggle(m.id)}
            labelledBy={`ro-mailbox-${m.id}-name`}
            data-testid={`ro-mailbox-${m.id}`}
          />
          <span id={`ro-mailbox-${m.id}-name`}>
            {m.from_name} · {m.address} <small className="dim">· {mailboxDayWords(m, now)}</small>
          </span>
        </label>
      ))}
      {!more && (
        <p className="pb-note" data-testid="ro-mailboxes-max">
          {P.mailboxesMax}
        </p>
      )}
    </section>
  );
}

/** One business's preview, as it was asked for, and the words it was written from. */
interface Shown {
  index: number;
  preview: ReachOutPreviewDto;
  words: string;
}

interface FrameProps {
  W: Words;
  shown: Shown;
  of: number;
  busy: boolean;
  onMove: (step: number) => void;
  onRewrite: () => void;
}

/** The preview's frame: one business's email as it reads, with its hold or refusal said. */
function RoFrame({ W, shown, of, busy, onMove, onRewrite }: FrameProps) {
  const PW = W.REACH_OUT_PREVIEW_WORDS;
  const v = shown.preview;
  const lines = W.previewLinesOf({ preview: v, index: shown.index, of });
  return (
    <div className="em-preview" data-testid="ro-preview-body">
      {lines.nobody && <p className="pb-note">{lines.nobody}</p>}
      {lines.reader && (
        <p className="em-reader" data-testid="ro-reader">
          {lines.reader}
          {v.angle && <span className="chip">{v.angle}</span>}
          <LinkButton disabled={busy || lines.first} onClick={() => onMove(-1)} data-testid="ro-prev">
            {PW.prev}
          </LinkButton>
          <LinkButton disabled={busy || lines.last} onClick={() => onMove(1)} data-testid="ro-next">
            {PW.next}
          </LinkButton>
        </p>
      )}
      {v.lead && v.body && (
        <div className="em-frame" data-testid="ro-frame">
          <p className="em-frame-head">
            <span>{W.REACH_OUT_SHEET_PARTS.toLine}</span> {v.lead.email}
          </p>
          {v.subject && (
            <p className="em-frame-head">
              <span>{W.REACH_OUT_SHEET_PARTS.subjectLine}</span> {v.subject}
            </p>
          )}
          <p className="em-frame-body">{v.body}</p>
        </div>
      )}
      {[lines.hold, lines.refused, lines.unavailable].filter(Boolean).map((t) => (
        <p key={t} className="pb-warn" data-testid="ro-preview-said">
          {t}
        </p>
      ))}
      {v.lead && (
        <Button size="sm" disabled={busy} onClick={onRewrite} data-testid="ro-rewrite">
          {PW.rewrite}
        </Button>
      )}
    </div>
  );
}

interface BeforeProps {
  W: Words;
  ask: (index: number) => ReachOutPreviewInput;
  of: number;
  stale: { key: string };
}

/** Before it goes: one business's email at a time, asked for by a press (it spends the model), never on its own. */
export function RoBefore({ W, ask, of, stale }: BeforeProps) {
  const PW = W.REACH_OUT_PREVIEW_WORDS;
  const [shown, setShown] = useState<Shown | null>(null);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const go = async (index: number) => {
    if (busy) return;
    setBusy(true);
    setSaid(null);
    const r = await reachOuts.preview(ask(index));
    setBusy(false);
    if (r && r.ok) setShown({ index, preview: r.data.preview, words: stale.key });
    else setSaid((r && r.message) || "");
  };
  const changed = shown && shown.words !== stale.key;
  return (
    <section className="pb-sec" data-testid="ro-before">
      <span className="pb-sec-k">{W.REACH_OUT_SHEET_PARTS.before}</span>
      {(!shown || changed) && (
        <Button size="sm" disabled={busy} onClick={() => go(shown ? shown.index : 0)} data-testid="ro-preview">
          {changed ? PW.changed : PW.read}
        </Button>
      )}
      {busy && (
        <p className="cm-standing" data-testid="ro-preview-busy">
          {PW.reading}
        </p>
      )}
      {said !== null && (
        <p className="pb-warn" role="alert" data-testid="ro-preview-refused">
          {said}
        </p>
      )}
      {shown && !changed && (
        <RoFrame
          W={W}
          shown={shown}
          of={of}
          busy={busy}
          onMove={(d) => go(shown.index + d)}
          onRewrite={() => go(shown.index)}
        />
      )}
      <p className="pb-note">{W.REACH_OUT_SHEET_WORDS.checkLater}</p>
    </section>
  );
}
