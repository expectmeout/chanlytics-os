/**
 * New's small parts (decision 0065; the New canvas, artifact 3eGjrhpQABiRHEgmiy27Kb): the line Ask drafted from, the toggle
 * between people and leads, a choice said as a word to press, who it reaches, what Ask checked, a card for what stops or
 * bends a draft, and a step as one person or business reads it. Hookless; every word is contracts' (new-words.ts).
 */
import type { ReactNode } from "react";
import {
  NEW_WORDS as W,
  exampleParams,
  type NewAudience,
  type NewCheck,
  type NewDraftDto,
  type NewReach,
  type NewStep,
} from "@chanlytics/contracts";
import { Button } from "../../../kit/button/button";
import { Icon } from "../../../kit/icon/icon";
import { LinkButton } from "../../../kit/link-button/link-button";
import { Segmented } from "../../../kit/segmented/segmented";
import { cx } from "../../../kit/variants";
import { MessagePreview } from "../../parts/message-preview";

/** The owner's line, kept on top, with its way to say it again (or what Ask is doing with it). */
export function SaidLine(p: {
  said: string;
  doing?: string | null;
  onAgain?: (() => void) | null;
  again?: string;
  /** Its act a button (Stop, while Ask drafts), not words to press. */
  button?: boolean;
}) {
  return (
    <div className="sq-nw-said" data-testid="sq-nw-said">
      <Icon name="sparkle" size={14} />
      <p className="sq-nw-said-words">{p.said}</p>
      <span className="sq-nw-said-by">
        {p.doing ? (
          <span className="sq-nw-busy" role="status">
            {p.doing}
          </span>
        ) : (
          <span>{W.say.asked}</span>
        )}
        {p.onAgain && p.button ? (
          <Button size="sm" onClick={p.onAgain} data-testid="sq-nw-again">
            {p.again ?? W.say.sayAgain}
          </Button>
        ) : p.onAgain ? (
          <LinkButton onClick={p.onAgain} data-testid="sq-nw-again">
            {p.again ?? W.say.sayAgain}
          </LinkButton>
        ) : null}
      </span>
    </div>
  );
}

/** Who it is for, people or leads: the one toggle, beside Who and when. */
export function AudienceToggle(p: {
  audience: NewAudience;
  onAudience: (a: NewAudience) => void;
  wide?: boolean;
  readOnly?: boolean;
}) {
  return (
    <Segmented
      label={W.draft.who}
      value={p.audience}
      onValueChange={(v) => p.onAudience(v === "leads" ? "leads" : "people")}
      readOnly={p.readOnly}
      className={cx("sq-nw-aud", p.wide && "is-wide")}
      options={[
        { value: "people", label: W.draft.audience.people, testid: "sq-nw-to-people" },
        { value: "leads", label: W.draft.audience.leads, testid: "sq-nw-to-leads" },
      ]}
    />
  );
}

/** The caption over Who and when, with the toggle at its end. */
export function WhoCaption({ children }: { children?: ReactNode }) {
  return (
    <div className="sq-nw-caprow">
      <p className="sq-nw-cap">{W.draft.who}</p>
      {children}
    </div>
  );
}

/**
 * A choice said as a word in the sentence, pressed to change it: the kit's capsule with its caret, and quiet (no ground of
 * its own) where it is not made yet; the kind, the sentence's first word, a size up.
 */
export function WordPick(p: { label: string; onPick: () => void; empty?: boolean; big?: boolean; testid: string }) {
  return (
    <Button
      size={p.big ? "md" : "sm"}
      variant={p.empty ? "quiet" : "secondary"}
      className="sq-nw-word"
      onClick={p.onPick}
      data-testid={p.testid}
    >
      {p.label}
      <Icon name="chevron-down" size={p.big ? 14 : 13} />
    </Button>
  );
}

/** Who it reaches now, where the workspace counted it, and who it leaves out. */
export function ReachLine(p: { reach: NewReach | null; audience: NewAudience; list?: boolean }) {
  const { reach, audience } = p;
  if (!reach) return null;
  return (
    <p className={cx("sq-nw-reach", reach.can === 0 && "is-none")} data-testid="sq-nw-reach">
      <span className="sq-nw-dot" aria-hidden="true" />
      <span>
        <b>{reach.can}</b>
        {reach.of !== null ? ` ${p.list ? W.reach.ofList(reach.of) : W.reach.of(reach.of)}` : null}{" "}
        {audience === "leads" ? W.reach.ready : W.reach.canHear}
      </span>
      {reach.left ? <span className="sq-nw-reach-left">{reach.left}</span> : null}
    </p>
  );
}

/** What Ask checked: a tick each, amber where it still needs the owner. */
export function ChecksList({ checks }: { checks: readonly NewCheck[] }) {
  if (checks.length === 0) return null;
  return (
    <>
      <p className="sq-nw-cap">{W.draft.checked}</p>
      <ul className="sq-nw-checks" data-testid="sq-nw-checks">
        {checks.map((c, i) => (
          <li key={i} className={cx("sq-nw-check", c.tone === "warn" && "is-warn")}>
            <Icon name={c.tone === "warn" ? "alert" : "check"} size={12} />
            <span>
              {c.words}
              {c.detail ? <small>{c.detail}</small> : null}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

/** A card that stops or bends the draft: amber where it needs the owner, red where something failed. */
export function CaseNote(p: {
  tone: "warn" | "bad" | "plain";
  title: string;
  words?: ReactNode;
  acts?: ReactNode;
  glyph?: string;
  testid: string;
}) {
  return (
    <div className="sq-nw-case" data-tone={p.tone} role={p.tone === "bad" ? "alert" : undefined} data-testid={p.testid}>
      <p className="sq-nw-case-head">
        <Icon name={p.glyph ?? (p.tone === "plain" ? "info" : "alert")} size={15} />
        {p.title}
      </p>
      {p.words ? <p className="sq-nw-case-words">{p.words}</p> : null}
      {p.acts ? <div className="sq-nw-case-acts">{p.acts}</div> : null}
    </div>
  );
}

/** Words with named values ({{opening}}), each value tinted as a value is everywhere. */
function withValues(text: string): ReactNode[] {
  return text.split(/(\{\{[^{}]+\}\})/g).map((part, i) =>
    /^\{\{[^{}]+\}\}$/.test(part) ? (
      <span key={i} className="mp-slot">
        {part.slice(2, -2).trim()}
      </span>
    ) : (
      part
    ),
  );
}

/** A lead's email as the business reads it: its subject over its words, each value by name. */
function EmailWords({ subject, body, empty }: { subject: string | null; body: string; empty?: string }) {
  return (
    <div className="sq-nw-mail">
      {subject ? <p className="sq-nw-mail-subject">{withValues(subject)}</p> : null}
      <p className={cx("sq-nw-mail-body", !body && "is-blank")}>{body ? withValues(body) : empty}</p>
    </div>
  );
}

/** A step as one person or business reads it: its message's bubble or email, or the task it hands over. */
export function StepWords({ step, draft }: { step: NewStep; draft: Pick<NewDraftDto, "business" | "audience"> }) {
  if (step.does !== "message")
    return (
      <p className="sq-nw-task">
        <Icon name={step.does === "call" ? "phone" : "note"} size={14} />
        {step.does === "call" ? W.hand.call : W.hand.note}
      </p>
    );
  if (draft.audience === "leads")
    return <EmailWords subject={step.email?.subject ?? null} body={step.email?.body ?? ""} empty={W.draft.toWrite} />;
  const m = step.message;
  if (!m) return <p className="sq-nw-mail-body is-blank">{W.draft.pickMessage}</p>;
  const values = exampleParams(m.params, draft.business);
  // A message Ask wrote for email alone reads as the email it is, its values filled as one person's are.
  const email = m.written && !m.written.versions.whatsapp && !m.written.versions.sms ? m.written.versions.email : null;
  if (email)
    return <MessagePreview plain mail={{ subject: email.subject, foot: "" }} body={email.body} values={values} />;
  return <MessagePreview plain body={m.body} values={values} />;
}
