/**
 * The lead sheet's quick look (the canvas "Lead to sequence, redesigned", its PhoneHalf and DeskOne boards): what a
 * decision needs, in the order the eye wants it. Who they are, as a record's raised head (the face, the name, the word for
 * where they stand beside it, one line of what and where with the rating); the verdict, then the reason in plain type; one
 * line for the checks (how many passed, what did not, in amber), which raises the sheet onto Fit; Website, Call and Maps,
 * each opening outside the app; and the email the sequence writes to, with how its mailbox checked, which raises the
 * sheet onto Contact. Over it in a pile, how far through it is and Undo; at its end, what went where.
 *
 * Hookless: the sheet (sheet.tsx) holds what is open and hands it down. Every word is contracts' (lead-sheet.ts,
 * lead-sheet-card.ts).
 */
import type { ReactNode } from "react";
import {
  LEAD_SHEET_CARD_WORDS as CW,
  LEAD_SHEET_WORDS as W,
  LEAD_WORDS,
  leadSheetChecksSaid,
  type LeadCardReasonVM,
  type LeadPeekVM,
  type LeadPileEndVM,
  type LeadRowVM,
  type LeadSheetChecksLineVM,
  type LeadSheetEmailLineVM,
  type LeadVerdictVM,
  type PlaceTone,
} from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";
import { LinkButton } from "../../kit/link-button/link-button";
import { Meter } from "../../kit/meter/meter";
import { StatePill } from "../../kit/pill/state-pill";
import { gate } from "../../legacy-verbs";
import { LeadTile } from "../cells/tile";

/* ------------------------------------------------------------------------------------------------------- who -- */

/**
 * Who they are, as a record's raised head: the face (its photo opens large), the name (a door to the person they became)
 * and beside it the word for where they stand, which never wraps (a long name shortens instead), and under it what and
 * where with the rating, which wraps.
 */
export const SheetWho = (p: {
  vm: LeadPeekVM;
  row: Pick<LeadRowVM, "id" | "name" | "tile"> | null;
  word: { word: string; tone: PlaceTone };
  sub: string;
  onExpand: () => void;
  onOpenPerson: (id: string) => void;
  /** The ⋯ and, on a desk, Close, at the row's end. */
  end?: ReactNode;
}) => (
  <div className="lw-id" data-testid="peek-identity">
    {p.row ? (
      <LeadTile l={p.row} size={40} onExpand={() => p.onExpand()} />
    ) : (
      <span className="lw-id-ini" aria-hidden="true">
        {p.vm.tile.initials}
      </span>
    )}
    <span className="lw-id-words">
      <span className="lw-name-row">
        {p.vm.contactId ? (
          <LinkButton
            size="inherit"
            className="lw-name lw-name-go"
            title={LEAD_WORDS.openPerson}
            onClick={() => p.vm.contactId && p.onOpenPerson(p.vm.contactId)}
            data-testid="peek-name-person"
          >
            {p.vm.name}
          </LinkButton>
        ) : (
          <span className="lw-name" data-testid="peek-name">
            {p.vm.name}
          </span>
        )}
        <StatePill kind="tone" value={p.word.tone} label={p.word.word} testid="lead-sheet-word" />
      </span>
      <span className="lw-sub" data-testid="peek-sub">
        {p.sub}
      </span>
    </span>
    {p.end}
  </div>
);

/* --------------------------------------------------------------------------------------- the verdict and reason -- */

/**
 * The verdict first (Strong fit, Worth a look, Long shot, or Left out with the finder's reason in its words), then the
 * reason in plain type, where it came from on hover. They wrote back: what they said, as it was read.
 */
export const SheetVerdict = (p: {
  verdict: LeadVerdictVM;
  reason: LeadCardReasonVM | null;
  fallback: string;
  reply: string | null;
}) => {
  const text = p.reply ?? (p.reason ? p.reason.text : p.fallback);
  return (
    <div className="lw-verdict" data-testid="lead-sheet-verdict">
      <StatePill kind="tone" value={p.verdict.tone} label={p.verdict.word} testid="lead-sheet-fit" />
      {text ? (
        <p className="lw-rs" title={p.reason && !p.reply ? p.reason.from : undefined} data-testid="lead-pile-why">
          {text}
        </p>
      ) : null}
    </div>
  );
};

/** The checks in one line: how many passed, and what did not, in amber; it raises the sheet onto Fit. */
export const SheetChecksLine = ({ line, onOpen }: { line: LeadSheetChecksLineVM; onOpen: () => void }) => (
  <LinkButton
    size="inherit"
    className="lw-ln"
    onClick={onOpen}
    title={`${line.tip} · ${CW.openWhy}`}
    aria-label={leadSheetChecksSaid({ ...line, fit: null })}
    data-testid="lead-sheet-checks"
  >
    <span className="lw-dots" aria-hidden="true">
      {line.dots.map((d, i) => (
        <i key={i} className={d} />
      ))}
    </span>
    <span className="lw-ln-t">
      {line.words}
      {line.exception ? (
        <>
          {" · "}
          <span className="lw-amber">{line.exception}</span>
        </>
      ) : null}
    </span>
    <Icon name="chevron" size={10} />
  </LinkButton>
);

/* ------------------------------------------------------------------------------------------ the quick acts -- */

/**
 * Website, Call and Maps: each opens outside the app (the site in a tab of its own; your phone, then "How did it go?";
 * the Google listing, which has both the map and the reviews). One that has nothing to open is not drawn.
 */
export function SheetQuick(p: { vm: LeadPeekVM; onCall: () => void }) {
  const site = p.vm.links.website;
  const phone = p.vm.reach.phone;
  const maps = p.vm.links.maps ?? (p.vm.where && p.vm.where.href ? { label: "", href: p.vm.where.href } : null);
  if (!site && !(phone && phone.tel) && !maps) return null;
  return (
    <div className="lw-quick" data-testid="lead-sheet-quick">
      {site ? (
        <Button
          variant="secondary"
          size="sm"
          href={site.href}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="lead-sheet-website"
        >
          <Icon name="globe" size={14} />
          {W.quick.website}
        </Button>
      ) : null}
      {phone && phone.tel ? (
        <Button
          variant="secondary"
          size="sm"
          onClick={p.onCall}
          aria-keyshortcuts="C"
          data-testid="lead-sheet-call"
          {...gate("approve", "call this lead")}
        >
          <Icon name="phone" size={14} />
          {W.quick.call}
        </Button>
      ) : null}
      {maps ? (
        <Button
          variant="secondary"
          size="sm"
          href={maps.href}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="lead-sheet-maps"
        >
          <Icon name="map" size={14} />
          {W.quick.maps}
        </Button>
      ) : null}
    </div>
  );
}

/** The email the sequence writes to, and how its mailbox checked: it raises the sheet onto Contact. */
export const SheetEmailLine = ({ line, onOpen }: { line: LeadSheetEmailLineVM; onOpen: () => void }) => (
  <LinkButton
    size="inherit"
    className="lw-ln"
    onClick={onOpen}
    title={CW.openContact}
    aria-label={`${line.address ?? ""} ${line.words}. ${CW.opens("Contact")}`}
    data-testid="lead-sheet-contact"
  >
    <Icon name="mail" size={14} />
    <span className="lw-ln-t" data-testid="lead-sheet-contact-email">
      {line.address ?? line.words}
    </span>
    {line.address ? (
      <span className={line.tone === "warn" ? "lw-ln-w lw-amber" : "lw-ln-w"} data-testid="lead-sheet-email-check">
        {line.tone === "ok" ? <Icon name="check" size={12} /> : null}
        {line.words}
      </span>
    ) : null}
  </LinkButton>
);

/* ---------------------------------------------------------------------------------------------------- the pile -- */

/** The pile's line over the card: how far through it is, a meter, and Undo naming what it takes back. */
export const SheetProgress = (p: {
  words: string;
  share: number;
  undo: { what: string | null; go: () => void; busy: boolean } | null;
  extra?: ReactNode;
}) => (
  <div className="lw-prog" data-testid="lead-pile-progress">
    <span className="lw-prog-n" data-testid="lead-pile-progress-line">
      {p.words}
    </span>
    <Meter
      className="lw-prog-bar"
      size="sm"
      parts={[
        { share: Math.max(0, p.share), tone: "ok" },
        { share: Math.max(0, 1 - p.share), tone: "rest" },
      ]}
      aria-label={p.words}
    />
    {p.undo ? (
      <Button
        variant="quiet"
        size="sm"
        className="lw-undo"
        disabled={p.undo.busy}
        onClick={p.undo.go}
        aria-keyshortcuts="Z"
        aria-label={p.undo.what ? `Undo · ${p.undo.what}` : "Undo"}
        data-testid="lead-pile-undo"
      >
        <Icon name="undo" size={12} />
        <span>Undo</span>
        {p.undo.what ? <span className="lw-undo-w">{` · ${p.undo.what}`}</span> : null}
      </Button>
    ) : null}
    {p.extra}
  </div>
);

/** The end of the pile: what went where, by sequence, each row with its own act, and the next step under them. */
export const SheetEnd = (p: {
  end: LeadPileEndVM;
  busy: boolean;
  onAct: (row: LeadPileEndVM["rows"][number]) => void;
}) => (
  <div className="lw-end" data-testid="lead-pile-end">
    <p className="lw-end-t">{p.end.title}</p>
    <div className="lw-end-l">
      {p.end.rows.map((r) => (
        <div key={r.key} className="lw-end-r" data-testid={`lead-pile-end-${r.key}`}>
          <Icon name={r.icon} size={15} />
          <span>{r.words}</span>
          {r.word ? <StatePill kind="tone" value={r.tone} label={r.word} /> : null}
          {r.act ? (
            <Button
              size="sm"
              variant="secondary"
              disabled={p.busy}
              onClick={() => p.onAct(r)}
              data-testid={`lead-pile-end-${r.act.kind}`}
              {...(r.act.kind === "approve" ? gate("approve", "approve a batch") : {})}
            >
              {r.act.label}
            </Button>
          ) : null}
        </div>
      ))}
    </div>
    {p.end.note ? <p className="lw-end-n">{p.end.note}</p> : null}
  </div>
);
