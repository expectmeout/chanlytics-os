/**
 * The message as the customer receives it (moved from legacy/components/message-preview.jsx, decision 0015).
 *
 * Every composer on Campaigns showed one: the Broadcasts composer, the playbook
 * composer, the template composer and every card on Messages. All four drew the
 * same rectangle -- `.wa-bubble`, --bg-sunken on --bg-raised, tail on the
 * bottom-left corner, the business's name inside it in the accent colour, and
 * the literal word "now" stamped on a send that goes out on Tuesday. A preview
 * that looks like a disabled input answers "what does the template say". The
 * question an owner is actually asking is "what is it like to receive this",
 * and the answer to that is a chat, not a field:
 *
 *   - the business's name in the chat header, where WhatsApp puts it, with the
 *     "Business account" line the customer sees under it (the name inside the
 *     bubble is WhatsApp's GROUP-chat treatment, which a broadcast never is);
 *   - the incoming bubble's notch at the TOP-left, which is the corner WhatsApp
 *     notches on a message the customer receives;
 *   - the real send time, from the business's clock, never "now";
 *   - a booking link drawn as a link, because that is the pixel the whole
 *     message exists for;
 *   - what fills per person tinted, so the eye can see what varies;
 *   - and, where the page can name the people, one of them at a time.
 *
 * Nothing here is WhatsApp's colour or WhatsApp's furniture: the frame is this
 * product's own tokens, in both themes. It is a truthful drawing of a message,
 * not a costume.
 *
 * A campaign that goes by more than WhatsApp reaches each person on one channel, and the preview is that channel's
 * version of the message (parts/preview-by.ts): a text is the same bubble with its own words and the STOP line under
 * them, an email is a mail (`mail`: its subject, its words and the foot the sender adds), each named in a quiet label
 * (`via`). The slots are the same numbered ones on every channel, so they stay the composer's controls in each.
 */
import { Fragment, useMemo } from "react";
import type { ReactNode } from "react";
import { PREVIEW_WORDS, personInitials } from "@chanlytics/contracts";
import { pageClock } from "@/legacy-bridge/zone";
import { Icon } from "../../kit/icon/icon";
import { cx } from "../../kit/variants";

interface MpPart {
  kind: "text" | "slot";
  text: string;
  /** A slot's place among the message's values, from 0 ({{1}} is 0). */
  at?: number;
}

// A body's numbered slots, split into parts. bcRender, pbRender and tcRender
// were three copies of one regex that returned a STRING, which is why no
// composer could mark what varies -- once the values are substituted there is
// nothing left to point at. This keeps the seam.
export const mpParts = (body: string | null | undefined, values?: readonly unknown[] | null): MpPart[] => {
  const out: MpPart[] = [];
  const src = String(body ?? "");
  let last = 0;
  for (const m of src.matchAll(/\{\{(\d+)\}\}/g)) {
    if (m.index > last) out.push({ kind: "text", text: src.slice(last, m.index) });
    const at = Number(m[1]) - 1;
    const v = values && values[at];
    // A slot nobody has filled keeps its own marker: the composer's job is to
    // show a hole as a hole, not to quietly render "{{2}}" as words.
    out.push({ kind: "slot", text: typeof v === "string" && v !== "" ? v : m[0], at });
    last = m.index + m[0].length;
  }
  if (last < src.length) out.push({ kind: "text", text: src.slice(last) });
  return out;
};

// The words alone, for the places that want a line rather than a preview.
export const mpFill = (body: string | null | undefined, values?: readonly unknown[] | null) =>
  mpParts(body, values)
    .map((p) => p.text)
    .join("");

// A run of text with its web addresses lifted out. WhatsApp turns a URL into a
// tappable link and the customer sees it as one; the preview drew it as prose,
// so the most important thing in a win-back message looked like the least.
// A bare domain counts: five of the seven starters put a booking link in a slot
// and it is written "booksy.com/luna-studio", with no scheme and no www.
const MP_URL = /(https?:\/\/[^\s]+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}(?:\/[^\s]*)?)/gi;
const mpLinked = (text: string, keyer: () => string): ReactNode[] => {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of String(text ?? "").matchAll(MP_URL)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(
      <a
        key={keyer()}
        className="mp-link"
        href={m[0].startsWith("http") ? m[0] : `https://${m[0]}`}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => e.preventDefault()}
      >
        {m[0]}
      </a>,
    );
    last = m.index + m[0].length;
  }
  if (last < String(text ?? "").length) out.push(text.slice(last));
  return out;
};

const MP_BUTTON_ICON: Record<string, string> = { url: "external", reply: "chat", call: "phone" };
const mpInitials = (name: string | null | undefined) => personInitials(name, undefined);

// `at` is when the message really goes, in ms. Null means the page does not know
// yet, and the stamp says nothing rather than making a time up.
const mpStamp = (at: number | null | undefined) => (at === null || at === undefined ? null : pageClock().time(at));
const mpDay = (at: number | null | undefined) => (at === null || at === undefined ? null : pageClock().dayLabel(at));

/** A button under the bubble, as WhatsApp draws it. */
interface MpButton {
  text: string;
  kind: string;
}

/** An email's own furniture: its subject, and the foot the sender adds under the words (contracts emailFoot). */
interface MpMail {
  subject: string | null;
  foot: string;
}

export interface MessagePreviewProps {
  from?: string | null;
  body?: string | null;
  values?: readonly unknown[] | null;
  header?: string | null;
  footer?: string | null;
  buttons?: MpButton[] | null;
  at?: number | null;
  held?: string | null;
  compact?: boolean;
  /** Where the person reads it, as a quiet label over the preview ("By email"); none draws none (parts/preview-by.ts). */
  via?: string | null;
  /** The line under the business's name in the frame: WhatsApp's "Business account" unless the channel says otherwise. */
  kind?: string;
  /** An email: drawn as a mail, its subject over the words and its foot under them, not as a bubble. */
  mail?: MpMail | null;
  /** Under the preview: why the person's own channel could not be drawn, where it could not. */
  note?: string | null;
  /**
   * Each slot drawn by the composer that fills it (its place among the values, and the words it shows now): a slot
   * the owner can change is a control in the bubble, where the message reads (the compact composer, C2's round 2:
   * "the bubble IS the fields"); its words come plain, since a link inside a control is none. Without it a slot is
   * its tinted words, as a customer reads them.
   */
  slot?: ((at: number, text: string) => ReactNode) | null;
  /**
   * No chat head over it (the business's name and "Business account"): a composer's preview, where the walk over the
   * bubble says who reads it and the sheet's head already says who sends it (Ruben, 11 Oct 2026, "Option B").
   */
  bare?: boolean;
  /**
   * The bubble alone on the page's own ground, with no chat drawn round it and no head: a message said where it stands in
   * a flow (a sequence's step, sequences/step-words.tsx), whose line already says what it is and who reads it.
   */
  plain?: boolean;
  children?: ReactNode;
  testid?: string | null;
}

/** How the chat is drawn round the bubble: whole, bare (no head), or plain (the bubble alone, which is bare too). */
const lookOf = (p: { bare?: boolean; plain?: boolean }): { bare: boolean; cls: string | null } =>
  p.plain ? { bare: true, cls: "mp-plain" } : { bare: !!p.bare, cls: p.bare ? "mp-bare" : null };

/** What a screen reader says of the bubble: one label, so the preview is heard as a preview. */
function bubbleLabel(m: {
  from: string | null | undefined;
  header: string | null;
  footer: string | null;
  words: string;
  rows: readonly MpButton[];
}) {
  const { from, header, footer, words, rows } = m;
  return `Preview — ${from || "your business"} sends: ${header ? `${header}. ` : ""}${words}${footer ? `. ${footer}` : ""}${rows.length ? `. Buttons: ${rows.map((b) => b.text).join(", ")}` : ""}`;
}

/** Where the person reads it, a quiet label over the preview ("By email"). */
function mpVia(via: string | null) {
  return via ? (
    <span className="mp-via" data-testid="mp-via">
      {via}
    </span>
  ) : null;
}

/** The body's parts as the preview draws them: a slot the composer fills is its control, else tinted words, links lifted out. */
function mpBody(parts: readonly MpPart[], slot: MessagePreviewProps["slot"], key: () => string): ReactNode[] {
  return parts.map((p, i) =>
    p.kind === "slot" && slot && p.at !== undefined ? (
      <Fragment key={i}>{slot(p.at, p.text)}</Fragment>
    ) : p.kind === "slot" ? (
      <span key={i} className="mp-slot">
        {mpLinked(p.text, key)}
      </span>
    ) : (
      <Fragment key={i}>{mpLinked(p.text, key)}</Fragment>
    ),
  );
}

/** The chat's head: the business's initials and name, and the line under it ("Business account"). */
function MpHead({ from, kind }: { from: string | null | undefined; kind: string }) {
  return (
    <figcaption className="mp-head">
      <span className="mp-avatar" aria-hidden="true">
        {mpInitials(from)}
      </span>
      <span className="mp-who">
        <span className="mp-name">{from || "Your business"}</span>
        <span className="mp-kind">{kind}</span>
      </span>
    </figcaption>
  );
}

interface MailFrameProps {
  bare: boolean;
  from: string | null | undefined;
  kind: string;
  mail: MpMail;
  parts: readonly MpPart[];
  values: readonly unknown[] | null;
  words: string;
  slot: MessagePreviewProps["slot"];
  when: string | null;
  keyer: () => string;
}

/** An email as its person reads it: who from, when, the subject, the words, and the foot the sender adds. */
function MailFrame({ bare, from, kind, mail, parts, values, words, slot, when, keyer }: MailFrameProps) {
  const subject = mail.subject ? mpFill(mail.subject, values) : null;
  const label = `Preview — ${from || "your business"} emails${subject ? `: ${subject}` : ""}. ${words}. ${mail.foot.replace(/\n/g, " ")}`;
  return (
    <figure className="mp-frame mp-mail-frame">
      {bare ? null : <MpHead from={from} kind={kind} />}
      <div className="mp-mail" role={slot ? "group" : "img"} aria-label={label}>
        {when && (
          <span className="mp-mail-when" aria-hidden="true">
            {when}
          </span>
        )}
        {subject && (
          <span className="mp-subject" aria-hidden={slot ? undefined : "true"}>
            {subject}
          </span>
        )}
        <span className="mp-body" aria-hidden={slot ? undefined : "true"}>
          {mpBody(parts, slot, keyer)}
        </span>
        <span className="mp-mail-foot" aria-hidden="true" data-testid="mp-mail-foot">
          {mail.foot}
        </span>
      </div>
    </figure>
  );
}

interface BubbleFrameProps {
  bare: boolean;
  from: string | null | undefined;
  kind: string;
  header: string | null;
  footer: string | null;
  rows: readonly MpButton[];
  parts: readonly MpPart[];
  words: string;
  slot: MessagePreviewProps["slot"];
  stamp: string | null;
  day: string | null;
  held: string | null;
  keyer: () => string;
}

/** A message as its person reads it in a chat: the business's name in the header, the bubble, its buttons, and Not sent where it is not. */
function BubbleFrame({
  bare,
  from,
  kind,
  header,
  footer,
  rows,
  parts,
  words,
  slot,
  stamp,
  day,
  held,
  keyer,
}: BubbleFrameProps) {
  return (
    <figure className="mp-frame">
      {bare ? null : <MpHead from={from} kind={kind} />}
      <div className="mp-thread">
        {day && <span className="mp-day">{day}</span>}
        {/* One label for a screen reader, so the preview is heard as a preview
            and not as the page telling the operator something; where its slots are the composer's controls, it is
            a group of them, read as it is. */}
        <div
          className="mp-bubble"
          role={slot ? "group" : "img"}
          aria-label={bubbleLabel({ from, header, footer, words, rows })}
        >
          {/* WhatsApp draws a text heading in bold at the top of the bubble. */}
          {header && (
            <span className="mp-header" aria-hidden="true">
              {header}
            </span>
          )}
          <span className="mp-body" aria-hidden={slot ? undefined : "true"}>
            {mpBody(parts, slot, keyer)}
          </span>
          {footer && (
            <span className="mp-foot" aria-hidden="true">
              {footer}
            </span>
          )}
          {stamp && (
            <span className="mp-stamp" aria-hidden="true">
              {stamp}
            </span>
          )}
        </div>
        {/* Under the bubble, divided, the way WhatsApp draws them. For an
            appointment business the "Book now" button IS the message, and it
            was the one part of it the operator could not see. */}
        {rows.length > 0 && (
          <div className="mp-buttons" aria-hidden="true" data-testid="mp-buttons">
            {rows.map((b, i) => (
              <span key={i} className="mp-button">
                <Icon name={MP_BUTTON_ICON[b.kind] || "external"} size={11} />
                {b.text}
              </span>
            ))}
          </div>
        )}
        {held && (
          <span className="mp-mark" data-testid="mp-held">
            <Icon name="x" size={11} /> {PREVIEW_WORDS.notSent}
          </span>
        )}
      </div>
    </figure>
  );
}

/**
 * One message, as the customer receives it.
 *
 *   from     the business's name (never a sample filed with Meta)
 *   body     the template's body, slots and all
 *   values   one filled value per slot, in order; a missing one stays a hole
 *   header   a text heading above the words, or null
 *   footer   the line under the words, or null
 *   buttons  the buttons under it: [{ text, kind: url|reply|call }]
 *   at       when it really goes, in ms; null draws no time
 *   held     why this person is not sent to, or null
 *   compact  a narrower frame, for a card or a row
 *   via      where the person reads it, a quiet label over it (a campaign that goes by more than WhatsApp)
 *   kind     the line under the business's name: WhatsApp's "Business account" unless the channel says otherwise
 *   mail     an email: its subject and foot, drawn as a mail and not a bubble
 */
export function MessagePreview({
  from,
  body,
  values = null,
  header = null,
  footer = null,
  buttons = null,
  at = null,
  held = null,
  compact = false,
  via = null,
  kind = PREVIEW_WORDS.kind.whatsapp,
  mail = null,
  note = null,
  slot = null,
  bare: bareOwn,
  plain,
  children = null,
  testid = null,
}: MessagePreviewProps) {
  const look = lookOf({ bare: bareOwn, plain });
  const parts = useMemo(() => mpParts(body, values), [body, values]);
  const stamp = mpStamp(at);
  const day = mpDay(at);
  const words = mpFill(body, values);
  const rows: MpButton[] = Array.isArray(buttons) ? buttons : [];
  let seq = 0;
  const keyer = () => `l${seq++}`;
  return (
    <div
      className={cx("mp", compact && "mp-compact", held && "mp-held", look.cls)}
      data-testid={testid || "message-preview"}
    >
      {mpVia(via)}
      {mail ? (
        <MailFrame
          bare={look.bare}
          from={from}
          kind={kind}
          mail={mail}
          parts={parts}
          values={values}
          words={words}
          slot={slot}
          when={day && stamp ? `${day} · ${stamp}` : (day ?? stamp)}
          keyer={keyer}
        />
      ) : (
        <BubbleFrame
          bare={look.bare}
          from={from}
          kind={kind}
          header={header}
          footer={footer}
          rows={rows}
          parts={parts}
          words={words}
          slot={slot}
          stamp={stamp}
          day={day}
          held={held}
          keyer={keyer}
        />
      )}
      {/* Why the channel's own version is not drawn: the page holds none for it, so WhatsApp's words stand (preview-by.ts); and
          Not sent under a stand-in, which a bubble marked held already says. */}
      {note && !(held && !mail && note === PREVIEW_WORDS.notSent) && (
        <p className="mp-note warn" data-testid="mp-version-note">
          {note}
        </p>
      )}
      {children}
    </div>
  );
}
