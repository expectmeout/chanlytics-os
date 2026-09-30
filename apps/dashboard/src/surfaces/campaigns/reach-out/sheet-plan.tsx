/**
 * The reach-out sheet's plan (moved from legacy/pages/reach-out/reach-out-sheet.jsx, decision 0015; Reach out, Part 4 PR
 * 6): the pace, the domains it sends from, and what one business's email reads as before it goes. The preview spends the
 * model (R12), so it is asked for by a press and never on its own.
 */
import { useState } from "react";
import type { ReachOutDraft, ReachOutPreviewDto, ReachOutPreviewInput, SendingDomainDto } from "@chanlytics/contracts";
import { PbTok } from "../playbooks/words";
import { reachOuts } from "./surface";

type Words = typeof reachOuts.words;

interface PaceProps {
  W: Words;
  pace: { share: number; sentDays: number; domains: number };
  gap: number;
  onGap: (minutes: number) => void;
}

/** The pace: the domain's day and the gap, why it is recommended, and when the first run goes. */
export function RoPace({ W, pace, gap, onGap }: PaceProps) {
  const words = W.paceWords({ share: pace.share, sentDays: pace.sentDays, gapMinutes: gap });
  const gaps = W.REACH_OUT_GAP_MINUTES.map((m) => ({ v: m, t: `${m} min` }));
  return (
    <section className="pb-sec" data-testid="ro-pace">
      <span className="pb-sec-k">{W.REACH_OUT_SHEET_PARTS.pace}</span>
      <p className="pb-when">
        {words.parts[1]}
        {words.parts[2]}
        <PbTok
          value={gap}
          options={gaps}
          onChange={(v) => onGap(Number(v))}
          label="How long between emails"
          testid="ro-gap"
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
  domains: SendingDomainDto[];
  unread: string | null;
  draft: ReachOutDraft;
  onPick: (ids: string[]) => void;
}

/** From: every verified domain, or up to five picked; unread is said as reading, none verified as none, and Start waits. */
export function RoFrom({ W, domains, unread, draft, onPick }: FromProps) {
  const P = W.REACH_OUT_SHEET_PARTS;
  const verified = domains.filter((d) => d.state === "verified");
  const say = unread || (verified.length === 0 ? W.REACH_OUT_SHEET_WORDS.noDomain : null);
  if (say)
    return (
      <section className="pb-sec" data-testid="ro-from">
        <span className="pb-sec-k">{P.from}</span>
        <p className={unread ? "pb-note" : "pb-warn"} data-testid={unread ? "ro-unread" : "ro-no-domain"}>
          {say}
        </p>
      </section>
    );
  const picked = draft.domain_ids;
  const more = W.reachOutMayPickDomain(draft);
  const toggle = (id: string) => onPick(picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id]);
  return (
    <section className="pb-sec" data-testid="ro-from">
      <span className="pb-sec-k">{P.from}</span>
      <label className="ro-domain">
        <input
          type="checkbox"
          checked={picked.length === 0}
          onChange={() => onPick([])}
          data-testid="ro-domain-every"
        />{" "}
        {P.everyDomain}
      </label>
      {verified.map((d) => (
        <label key={d.id} className="ro-domain">
          <input
            type="checkbox"
            checked={picked.includes(d.id)}
            disabled={!more && !picked.includes(d.id)}
            onChange={() => toggle(d.id)}
            data-testid={`ro-domain-${d.id}`}
          />{" "}
          {d.from_name} · {d.address}
        </label>
      ))}
      {!more && (
        <p className="pb-note" data-testid="ro-domains-max">
          {P.domainsMax}
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
          <button
            type="button"
            className="cl-bucket-link"
            disabled={busy || lines.first}
            onClick={() => onMove(-1)}
            data-testid="ro-prev"
          >
            {PW.prev}
          </button>
          <button
            type="button"
            className="cl-bucket-link"
            disabled={busy || lines.last}
            onClick={() => onMove(1)}
            data-testid="ro-next"
          >
            {PW.next}
          </button>
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
        <button type="button" className="btn btn-sm" disabled={busy} onClick={onRewrite} data-testid="ro-rewrite">
          {PW.rewrite}
        </button>
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
        <button
          type="button"
          className="btn btn-sm"
          disabled={busy}
          onClick={() => go(shown ? shown.index : 0)}
          data-testid="ro-preview"
        >
          {changed ? PW.changed : PW.read}
        </button>
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
