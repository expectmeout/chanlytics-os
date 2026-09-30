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
 */
import { Fragment, useMemo } from "react";
import type { ReactNode } from "react";
import { personInitials } from "@chanlytics/contracts";
import { pageClock } from "@/legacy-bridge/zone";
import { Icon } from "../../kit/icon/icon";

interface MpPart {
  kind: "text" | "slot";
  text: string;
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
    out.push({ kind: "slot", text: typeof v === "string" && v !== "" ? v : m[0] });
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

interface MessagePreviewProps {
  from?: string | null;
  body?: string | null;
  values?: readonly unknown[] | null;
  header?: string | null;
  footer?: string | null;
  buttons?: MpButton[] | null;
  at?: number | null;
  held?: string | null;
  compact?: boolean;
  children?: ReactNode;
  testid?: string | null;
}

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
  children = null,
  testid = null,
}: MessagePreviewProps) {
  const parts = useMemo(() => mpParts(body, values), [body, values]);
  const stamp = mpStamp(at);
  const day = mpDay(at);
  const words = mpFill(body, values);
  const rows: MpButton[] = Array.isArray(buttons) ? buttons : [];
  let seq = 0;
  const key = () => `l${seq++}`;
  return (
    <div
      className={`mp${compact ? " mp-compact" : ""}${held ? " mp-held" : ""}`}
      data-testid={testid || "message-preview"}
    >
      <figure className="mp-frame">
        <figcaption className="mp-head">
          <span className="mp-avatar" aria-hidden="true">
            {mpInitials(from)}
          </span>
          <span className="mp-who">
            <span className="mp-name">{from || "Your business"}</span>
            <span className="mp-kind">Business account</span>
          </span>
        </figcaption>
        <div className="mp-thread">
          {day && <span className="mp-day">{day}</span>}
          {/* One label for a screen reader, so the preview is heard as a preview
              and not as the page telling the operator something. */}
          <div className="mp-bubble" role="img" aria-label={bubbleLabel({ from, header, footer, words, rows })}>
            {/* WhatsApp draws a text heading in bold at the top of the bubble. */}
            {header && (
              <span className="mp-header" aria-hidden="true">
                {header}
              </span>
            )}
            <span className="mp-body" aria-hidden="true">
              {parts.map((p, i) =>
                p.kind === "slot" ? (
                  <span key={i} className="mp-slot">
                    {mpLinked(p.text, key)}
                  </span>
                ) : (
                  <Fragment key={i}>{mpLinked(p.text, key)}</Fragment>
                ),
              )}
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
              <Icon name="x" size={11} /> Not sent
            </span>
          )}
        </div>
      </figure>
      {children}
    </div>
  );
}

interface PreviewPerson {
  label: string;
  position: string;
}

interface PreviewStepperProps {
  people?: readonly PreviewPerson[] | null;
  index: number;
  onStep: (index: number) => void;
  note?: ReactNode;
  tone?: string | null;
}

/**
 * Who is looking at it: one person at a time, out of the ones this send reaches.
 *
 * An audience chip showed a count and never a person, so the last thing an owner
 * saw before pressing Send was a number. These are rows the page already holds --
 * the same rows the count is a length of.
 */
export function PreviewStepper({ people, index, onStep, note = null, tone = null }: PreviewStepperProps) {
  if (!people || people.length < 2) return null;
  const p = people[index] || people[0];
  if (!p) return null;
  const go = (d: number) => () => onStep((index + d + people.length) % people.length);
  return (
    <>
      <div className="mp-step" data-testid="mp-step">
        {/* The icon set has one chevron and it points right; the back button
            mirrors it rather than adding a second glyph for one arrow. */}
        <button
          type="button"
          className="mp-step-btn mp-step-back"
          onClick={go(-1)}
          aria-label="The person before this one"
        >
          <Icon name="chevron" size={13} />
        </button>
        <span className="mp-step-who">
          <span className="mp-step-name">{p.label}</span>
          <span className="mp-step-pos tabular">{p.position}</span>
        </span>
        <button type="button" className="mp-step-btn" onClick={go(1)} aria-label="The next person">
          <Icon name="chevron" size={13} />
        </button>
      </div>
      {note && (
        <p className={`mp-note${tone ? ` ${tone}` : ""}`} data-testid="mp-note">
          {note}
        </p>
      )}
    </>
  );
}
