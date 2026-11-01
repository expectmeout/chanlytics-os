/**
 * One email as one lead gets it (the canvas's EmailAs, "One place, two windows", 18 Oct 2026): its words in parts, each
 * part marked by where it comes from (words written once, a value from their record, the opening written for them from the
 * listing, a value they lack, which holds the email), with who it is from and to and its subject where it is drawn whole.
 * The lead sheet's Sequence section, the rail's step opened, the draft's preview and the step sheet draw it so.
 *
 * Hookless. Every word is contracts' (lead-card.ts).
 */
import type { ReactNode } from "react";
import { LEAD_CARD_WORDS, LEAD_SHEET_WORDS as W, type LeadCardEmailVM, type LeadCardPart } from "@chanlytics/contracts";
import { cx } from "../../../kit/variants";
import "./place.css";

/**
 * An email's words in parts: words, a value filled for them, the opening still to come, a slot with no value. `plain`
 * reads it as it goes, a value in the words round it, where the marks would only stand between you and the email.
 */
export const EmailParts = ({ parts, plain = false }: { parts: readonly LeadCardPart[]; plain?: boolean }) => (
  <>
    {parts.map((p, i) =>
      p.kind === "text" ? (
        <span key={i}>{p.text}</span>
      ) : p.kind === "value" ? (
        <span key={i} className={plain ? undefined : "lw-val"}>
          {p.text}
        </span>
      ) : p.kind === "opening" ? (
        // Said from their listing (decision 0078), it is a value from their record and wears its mark; still to come, the
        // line written when its batch is planned.
        <span key={i} className={p.text ? "lw-val" : "lw-open"} data-testid="lead-card-opening">
          {p.text ?? LEAD_CARD_WORDS.opening}
        </span>
      ) : (
        <span key={i} className="lw-hole" data-testid="lead-card-gap">
          {p.label}
        </span>
      ),
    )}
  </>
);

/** The words cut where the email breaks its lines: a paragraph each, the opening a line of its own. */
export const emailParagraphs = (parts: readonly LeadCardPart[]): LeadCardPart[][] => {
  const out: LeadCardPart[][] = [];
  let para: LeadCardPart[] = [];
  const next = () => {
    out.push(para);
    para = [];
  };
  for (const p of parts) {
    if (p.kind === "opening") {
      next();
      para.push(p);
      next();
      continue;
    }
    if (p.kind !== "text" || !p.text.includes("\n")) {
      para.push(p);
      continue;
    }
    p.text.split(/\n+/).forEach((piece, i) => {
      if (i > 0) next();
      if (piece) para.push({ kind: "text", text: piece });
    });
  }
  next();
  return out.filter((one) => one.length);
};

/** The subject as one line of words, where every part of it fills: what a step's title says for this lead. */
export const subjectWords = (parts: readonly LeadCardPart[] | null | undefined): string | null =>
  parts && parts.length && parts.every((p) => p.kind === "text" || p.kind === "value")
    ? parts
        .map((p) => (p.kind === "text" || p.kind === "value" ? p.text : ""))
        .join("")
        .trim() || null
    : null;

interface EmailAsProps {
  email: LeadCardEmailVM;
  /** Who it is from ("Ruben · your inbox"), where the email is drawn whole. */
  from?: string | null;
  /** Drawn whole: from, to and subject over the words, and the legend of where each part comes from. */
  whole?: boolean;
  /** Its words cut to a few lines, as a rail's step shows it. */
  short?: boolean;
  /** How it ends under the words (0077): the name it signs off with, or its mailbox's signature, where drawn whole. */
  ending?: string | null;
  /** The foot every email carries (why they hear from you, your address, how to stop), where it is drawn whole. */
  foot?: string | null;
  head?: ReactNode;
  testid?: string;
}

/** One email as one lead gets it: whole (from, to, subject, the words, what holds it) or as a rail's few lines. */
export function EmailAs({
  email,
  from = null,
  whole = false,
  short = false,
  ending = null,
  foot = null,
  head = null,
  testid,
}: EmailAsProps) {
  const paragraphs = emailParagraphs(email.body);
  return (
    <section
      className={cx("lw-mail", email.blocked && "warn", short && "is-short")}
      aria-label={email.head}
      data-testid={testid ?? "lead-card-email"}
    >
      {head}
      {whole ? (
        <dl className="lw-mail-meta">
          {from ? (
            <div>
              <dt>{W.emails.from}</dt>
              <dd>{from}</dd>
            </div>
          ) : null}
          {email.to ? (
            <div>
              <dt>{W.emails.to}</dt>
              <dd data-testid="lead-card-to">{email.to}</dd>
            </div>
          ) : null}
          {email.subject ? (
            <div>
              <dt>{LEAD_CARD_WORDS.subject}</dt>
              <dd data-testid="lead-card-subject">
                <EmailParts parts={email.subject} />
              </dd>
            </div>
          ) : null}
        </dl>
      ) : null}
      <div className={cx("lw-mail-b", whole && "full")} data-testid="lead-card-body">
        {(short ? paragraphs.slice(0, 2) : paragraphs).map((para, i) => (
          <p key={i}>
            <EmailParts parts={para} />
          </p>
        ))}
      </div>
      {whole && ending ? (
        <p className="lw-mail-end" data-testid="lead-card-ending">
          {ending}
        </p>
      ) : null}
      {whole && foot ? (
        <p className="lw-mail-foot" data-testid="lead-card-foot">
          {foot}
        </p>
      ) : null}
      {whole && email.note ? <p className="lw-mail-n">{email.note}</p> : null}
      {email.blocked ? (
        <p className="lw-mail-n warn" data-testid="lead-card-blocked">
          {email.blocked}
          {email.instead === "choose" ? ` ${LEAD_CARD_WORDS.choose}` : null}
        </p>
      ) : null}
      {whole ? (
        <p className="lw-legend" aria-hidden="true">
          <span>
            <span className="lw-val">{LEAD_CARD_WORDS.fromRecord}</span>
          </span>
          {/* The opening still to be written, where one is: one said from the listing is a value of their record. */}
          {email.body.some((p) => p.kind === "opening" && !p.text) ? (
            <span>
              <span className="lw-open">{LEAD_CARD_WORDS.writtenForThem}</span>
            </span>
          ) : null}
        </p>
      ) : null}
    </section>
  );
}
