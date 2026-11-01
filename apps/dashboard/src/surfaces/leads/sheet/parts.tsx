/**
 * The lead sheet's top (the canvas "Lead sheet, redesigned", 1 Nov 2026): who they are, with no pill beside the name to
 * cut it; the doors out to what they are (Website, Call where the dock is not already saying it, Maps) and More, the rare
 * acts behind one labelled caret; and the one card, which says what this lead needs from you now and carries the email
 * where the email is what you are deciding on. Over it in a pile, how far through it is and Undo; at its end, what went
 * where.
 *
 * Hookless: the sheet (sheet.tsx) holds what is open and hands it down. Every word is contracts' (lead-sheet-now.ts,
 * lead-sheet.ts).
 */
import type { ReactNode } from "react";
import {
  LEAD_CARD_WORDS,
  LEAD_SHEET_WORDS as W,
  LEAD_WORDS,
  type LeadCardPart,
  type LeadNowFactVM,
  type LeadNowVM,
  type LeadPeekVM,
  type LeadPileEndVM,
  type LeadRowVM,
} from "@chanlytics/contracts";
import { EmailParts, emailParagraphs } from "../../campaigns/sequences/place/email-as";
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";
import { LinkButton } from "../../kit/link-button/link-button";
import { Meter } from "../../kit/meter/meter";
import { StatePill } from "../../kit/pill/state-pill";
import { gate } from "../../legacy-verbs";
import { LeadTile } from "../cells/tile";
import type { SheetMail } from "./facts";

/* ------------------------------------------------------------------------------------------------------- who -- */

/**
 * Who they are: the face (its photo opens large), the name (a door to the person they became), and under it what and
 * where with the rating, which wraps. A desk's Close stands at the row's end.
 */
export const SheetWho = (p: {
  vm: LeadPeekVM;
  row: Pick<LeadRowVM, "id" | "name" | "tile"> | null;
  sub: string;
  onExpand: () => void;
  onOpenPerson: (id: string) => void;
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
      <span className="lw-sub" data-testid="peek-sub">
        {p.sub}
      </span>
    </span>
    {p.end}
  </div>
);

/* --------------------------------------------------------------------------------------------------- the doors -- */

/**
 * The doors out: the site in a tab of its own, your phone, then "How did it go?", and the Google listing, which has both
 * the map and the reviews, with More at the row's end. One that has nothing to open is not drawn, and Call stands down
 * where it is the dock's press: a door never repeats the dock.
 */
export function SheetDoors(p: { vm: LeadPeekVM; callDoor: boolean; onCall: () => void; more: ReactNode }) {
  const site = p.vm.links.website;
  const phone = p.vm.reach.phone;
  const maps = p.vm.links.maps ?? (p.vm.where && p.vm.where.href ? { label: "", href: p.vm.where.href } : null);
  return (
    <div className="lw-doors" data-testid="lead-sheet-quick">
      {site ? (
        <Button
          variant="secondary"
          size="sm"
          href={site.href}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="lead-sheet-website"
        >
          <Icon name="globe" size={13} />
          {W.doors.website}
        </Button>
      ) : null}
      {p.callDoor && phone && phone.tel ? (
        <Button
          variant="secondary"
          size="sm"
          onClick={p.onCall}
          aria-keyshortcuts="C"
          data-testid="lead-sheet-call"
          {...gate("approve", "call this lead")}
        >
          <Icon name="phone" size={13} />
          {W.doors.call}
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
          <Icon name="map" size={13} />
          {W.doors.maps}
        </Button>
      ) : null}
      <span className="lw-doors-sp" />
      {p.more}
    </div>
  );
}

/* --------------------------------------------------------------------------------------------------- the email -- */

/** The opening as it goes: still being written, the words the check refused marked, or its words as they stand. */
function OpeningOf({ mail, part }: { mail: SheetMail; part: Extract<LeadCardPart, { kind: "opening" }> }) {
  if (mail.writing)
    return (
      <span className="lw-open" data-testid="lead-card-opening">
        {W.mail.writing}
      </span>
    );
  const o = mail.opening;
  if (!o)
    return (
      <span className={part.text ? "lw-opening" : "lw-open"} data-testid="lead-card-opening">
        {part.text ?? LEAD_CARD_WORDS.opening}
      </span>
    );
  return (
    <span className="lw-opening" data-testid="lead-card-opening">
      {o.before}
      {o.said ? (
        <mark className="lw-refused" data-testid="lead-card-refused">
          {o.said}
        </mark>
      ) : null}
      {o.after}
    </span>
  );
}

/** A paragraph of the email: its opening as it goes, and the rest in plain words, a slot with no value as the hole it is. */
const mailParagraph = (mail: SheetMail, para: readonly LeadCardPart[], at: number) => {
  const opening = para.find((x) => x.kind === "opening");
  return (
    <p key={at}>
      {opening && opening.kind === "opening" ? (
        <OpeningOf mail={mail} part={opening} />
      ) : (
        <EmailParts parts={para} plain />
      )}
    </p>
  );
};

/** The email on the card: as it goes, a few lines of it until it is asked for whole. */
function SheetEmail(p: { mail: SheetMail; whole: boolean; onWhole: () => void; onRewrite: (() => void) | null }) {
  const { mail } = p;
  const clip = p.whole ? "" : mail.tall ? " is-clipped is-tall" : " is-clipped";
  return (
    <div className="lw-now-mail" data-testid="lead-card-email">
      <p className="lw-now-to" data-testid="lead-card-to">
        {mail.to}
      </p>
      {mail.subject ? (
        <p className="lw-now-subj" data-testid="lead-card-subject">
          <EmailParts parts={mail.subject} plain />
        </p>
      ) : null}
      <div className={`lw-now-body${clip}`} data-testid="lead-card-body">
        {emailParagraphs(mail.body).map((para, at) => mailParagraph(mail, para, at))}
      </div>
      <div className="lw-now-acts">
        <LinkButton onClick={p.onWhole} data-testid="lead-sheet-read-all">
          {p.whole ? W.mail.less : W.mail.readAll}
        </LinkButton>
        {p.onRewrite ? (
          <LinkButton
            onClick={p.onRewrite}
            data-testid="lead-sheet-rewrite"
            {...gate("approve", "rewrite the opening")}
          >
            {W.mail.rewrite}
          </LinkButton>
        ) : null}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------------------------------- the card -- */

/** A way to reach them, where it decides what happens next. */
const factRow = (f: LeadNowFactVM) => (
  <div key={f.kind} className="lw-now-fact" data-testid={`lead-sheet-fact-${f.kind}`}>
    <Icon name={f.kind === "phone" ? "phone" : "mail"} size={14} />
    <span className="lw-now-fact-v">{f.value}</span>
    <span className={f.tone === "ok" ? "lw-now-fact-s lw-green" : "lw-now-fact-s"}>
      {f.busy ? <span className="lw-spin" aria-hidden="true" /> : null}
      {f.note}
    </span>
  </div>
);

/**
 * The one card: its word and what stands at its end, the line under it, what they said or what could not be told, the
 * ways to reach them where they decide it, and the email where the email is the question. An amber edge where it needs
 * you, as a step's box on the record has.
 */
export const SheetNow = (p: {
  now: LeadNowVM;
  mail: SheetMail | null;
  whole: boolean;
  onWhole: () => void;
  onRewrite: (() => void) | null;
}) => {
  const { now } = p;
  return (
    <section className={now.need ? "lw-now is-need" : "lw-now"} aria-label={now.word} data-testid="lead-sheet-verdict">
      <div className="lw-now-top">
        <span className="lw-now-word" data-tone={now.tone} data-testid="lead-sheet-word">
          {now.word}
        </span>
        {now.end ? <span className="lw-now-end">{now.end}</span> : null}
      </div>
      {now.say ? (
        <p className="lw-now-say" data-testid="lead-pile-why">
          {now.say}
        </p>
      ) : null}
      {now.quote ? (
        <p className="lw-now-quote" data-testid="lead-sheet-quote">
          {now.quote}
        </p>
      ) : null}
      {now.unsure ? (
        <p className="lw-now-unsure" data-testid="lead-sheet-unsure">
          {now.unsure}
        </p>
      ) : null}
      {now.facts.map(factRow)}
      {p.mail ? <SheetEmail mail={p.mail} whole={p.whole} onWhole={p.onWhole} onRewrite={p.onRewrite} /> : null}
    </section>
  );
};

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
