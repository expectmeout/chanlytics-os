/**
 * The template reply box (moved out of composer.tsx, the phone canvas's C1): outside WhatsApp's window the one send that
 * works is an approved template, so the box says what it will send. Its picker offers the messages this person can be
 * sent, what fits first, each with what it says; the chosen one's sentence stands as she will read it, the person's and
 * the business's facts filled in and the member's words written in its blank where it has one; Send is at its foot.
 */
import {
  inboxTemplateParts,
  inboxTemplates,
  isIdentifierName,
  noTemplateWords,
  shortName,
  TEMPLATE_WORDS_MAX,
  templateWords,
  THREAD_PANE_WORDS,
  type InboxBlank,
  type TemplateHolds,
  type TemplatePart,
} from "@chanlytics/contracts";
import { Fragment, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { FailedRead } from "../../kit/empty/empty";
import { Icon } from "../../kit/icon/icon";
import { Menu, type MenuGroup, type MenuOption } from "../../kit/menu/menu";
import { Button } from "../../kit/button/button";
import { canDo, gate } from "../shell";
import { inboxData } from "../store";
import type { ApprovedTemplate, Thread } from "../types";
import { surfaceValue } from "../../surface-values";
import { personOnThread } from "../../people/want-person";
import { ixBandCallBack } from "./band";
import { growWithWords, isPromise, IxWhy, type OnSend } from "./send-words";

/** The templates this person can be sent: what the composer offers, which one is chosen, its name and its blank. */
interface TemplateChoice {
  choice: ReturnType<typeof inboxTemplates<ApprovedTemplate>> | null;
  list: ApprovedTemplate[] | null;
  chosen: ApprovedTemplate | null;
  chosenAt: number;
  chosenTitle: string | null;
  /** The chosen template's one blank of words the member writes (contracts inboxBlankOf); none for most. */
  blank: InboxBlank | null;
}

/**
 * Their visit as People's row holds it (People's, or the thread's own read of them: people/want-person.ts), as the template
 * picker weighs it: one ahead, else one behind, else none known.
 */
function visitOf(thread: Thread | null): "ahead" | "behind" | null {
  const person = thread ? personOnThread(thread.real ? thread.conversationId : null, thread.clientId)?.row : null;
  return person?.nextVisitLine ? "ahead" : person?.lastVisitLine ? "behind" : null;
}

/**
 * What a template's slots are filled with on this screen, as the reply route fills them: their first name (none for a
 * number or an address), and the business's name and booking link as the settings read resolved them.
 */
function factsFor(thread: Thread | null) {
  const facts = surfaceValue("settings")?.facts?.facts;
  const who = thread?.who ?? "";
  return {
    firstName: who && !isIdentifierName(who) ? shortName(who) : null,
    businessName: facts?.business_name.value ?? null,
    bookingLink: facts?.booking_link.value ?? null,
  };
}

/**
 * The templates this person can be sent, in the owner's words, what fits first, and why the rest are not offered: the
 * composer offered every approved one, in the order they came, and "How did it go" stood first under a price question
 * two days before the visit (I4; the phone canvas, C1).
 */
function templateChoice(
  real: boolean,
  templates: ApprovedTemplate[] | null,
  thread: Thread | null,
  picked: number,
): TemplateChoice {
  const choice =
    real && templates && thread
      ? inboxTemplates(templates, { who: thread.who, offersOk: !!thread.offersOk, visit: visitOf(thread) })
      : null;
  const list = real ? (choice ? choice.sendable.map((s) => s.template) : templates) : null;
  const chosenAt = list && list.length ? Math.min(picked, list.length - 1) : -1;
  const chosen = list && chosenAt >= 0 ? (list.at(chosenAt) ?? null) : null;
  const row = choice && chosenAt >= 0 ? choice.sendable.at(chosenAt) : undefined;
  return { choice, list, chosen, chosenAt, chosenTitle: row?.title ?? null, blank: row?.blank ?? null };
}

/**
 * What the send says where there is nothing it can send: no template approved, the read failed, or none can go to this
 * person; `undefined` where there is something to send. A caller with no WhatsApp thread whose call back the band offers
 * says nothing of what cannot be sent beneath it -- "No approved message can go to Emily Chen yet" under Call back.
 */
function templateGap(p: {
  real: boolean;
  quiet: boolean;
  thread: Thread | null;
  readTemplates: ApprovedTemplate[] | null | undefined;
  templates: ApprovedTemplate[] | null;
  /** Why the messages left out of the picker were, where the read counted them. */
  held: TemplateHolds | null | undefined;
  have: TemplateChoice;
}): ReactNode | undefined {
  const { real, quiet, thread, readTemplates, templates, held, have } = p;
  const { choice, list } = have;
  // Nothing approved yet. Say so, rather than offering a send that cannot
  // happen: outside the window this is the only thing WhatsApp will deliver,
  // so an operator needs to know the gap is at Meta and not on this screen --
  // and which gap, where the read counted them (noTemplateWords: waiting, refused,
  // paused, hidden).
  // The window itself is the bar's to say (ThreadBar): it was said here too.
  if (real && templates && templates.length === 0) {
    return quiet ? null : <span className="ix-tpl-none">{noTemplateWords(held)}</span>;
  }
  if (real && readTemplates === null) {
    return quiet ? null : (
      <FailedRead
        kind="line"
        title="Couldn't read your approved templates"
        body="Outside the 24-hour window only an approved template sends, so none can be offered until they're read."
        surface="settings"
        testid="ix-tpl-failed"
      />
    );
  }
  if (real && choice && choice.sendable.length === 0) {
    return quiet ? null : (
      <span className="ix-tpl-none">
        No approved message can go to {thread && thread.who} yet.
        {choice.hidden ? <IxWhy said={choice.hidden} testid="ix-tpl-hidden" /> : null}
      </span>
    );
  }
  // Still being read, by a box that says nothing (the band's Call back is the one way to them): nothing yet. Any other box
  // draws its frame meanwhile (templateReading). "Checking which templates are approved…" was the machinery talking.
  if (real && !list) return null;
  return undefined;
}

/**
 * The box while the templates are read: its own shape, the message's place and a Send that waits, so the thread is drawn
 * at the height it will hold and nothing moves when they land. It drew nothing until they did, and the box then pushed the
 * conversation up 145 to 162 px (the Inbox load review, 28 Oct 2026). The thread the Inbox opens on waits for them now
 * (the settings read: inbox/surface.ts openingThreadWaits); this stands where that wait ran out, or a thread opened later
 * before they were read (a phone's list waits for none of it).
 */
function templateReading() {
  return (
    <div className="ix-composer ix-composer-row ix-composer-tpl" aria-busy="true" data-testid="ix-composer-tpl-reading">
      <div className="ix-tpl-head">
        <span className="ix-tpl-name" aria-hidden="true">
          <Icon name="note" size={12} />
          <span className="ix-tpl-sk ix-tpl-sk-name" />
        </span>
        <span className="ix-tpl-note">{THREAD_PANE_WORDS.reopens}</span>
      </div>
      <div className="ix-tpl-foot">
        <span className="ix-tpl-fill" aria-hidden="true">
          <span className="ix-tpl-sk" />
          <span className="ix-tpl-sk ix-tpl-sk-short" />
        </span>
        <Button variant="primary" className="ix-composer-send" disabled>
          Send
        </Button>
      </div>
    </div>
  );
}

/** The box with a call offered above it, where there is one (`lead`). */
function withLead(lead: ReactNode, box: ReactNode) {
  if (!lead) return box;
  return (
    <>
      <div className="ix-composer ix-composer-lead">
        <div className="ix-composer-foot">
          <div className="ix-composer-actions">{lead}</div>
        </div>
      </div>
      {box}
    </>
  );
}

/** The templates the menu lists: the ones this person can be sent, else every one approved. */
function templateOptions(
  have: TemplateChoice,
): Array<{ template: ApprovedTemplate; label: string; fits: boolean; sample: boolean }> {
  const { choice, list } = have;
  return choice
    ? choice.sendable
    : (list || []).map((t) => ({ template: t, label: `${t.name} · ${t.language}`, fits: false, sample: false }));
}

/**
 * A template's words as this person reads them, its blank said by its label, underlined as a place the member's words go:
 * the menu's line under its name. Nothing where the template says nothing it can show.
 */
function templateSaid(t: ApprovedTemplate, facts: ReturnType<typeof factsFor>): ReactNode {
  const parts = inboxTemplateParts(t, facts);
  if (!parts.length) return undefined;
  return parts.map((part, i) =>
    part.blank !== undefined ? (
      <span key={i} className="ix-tpl-said-blank">
        {THREAD_PANE_WORDS.blank(part.blank)}
      </span>
    ) : (
      <Fragment key={i}>{part.words}</Fragment>
    ),
  );
}

/**
 * What the chosen message's name opens: the messages this person can be sent, one row each, its name on one line and what
 * it says under it (they were names alone, so a template went out unread; then the words stood beside the name and
 * squeezed it to nothing, 21 Oct 2026), a sample's name with the quiet word, what fits now first under its heading, the
 * chosen one picked, and under them, once, which were not offered and why. On a phone it is the kit's sheet. A person who
 * can be sent one message is offered no menu unless something was kept back.
 */
function templateMenu(
  have: TemplateChoice,
  choose: (at: number) => void,
  facts: ReturnType<typeof factsFor>,
): MenuGroup[] {
  const options = templateOptions(have);
  const W = THREAD_PANE_WORDS;
  const groups: MenuGroup[] = [];
  if (options.length > 1) {
    const option = (o: (typeof options)[number], at: number): MenuOption => ({
      value: String(at),
      label: o.label,
      ...(o.sample ? { hint: W.sample } : {}),
      sub: templateSaid(o.template, facts),
    });
    const set = (list: MenuOption[], header?: string): MenuGroup => ({
      ...(header ? { header } : {}),
      choose: {
        value: String(have.chosenAt),
        onChoose: (value) => choose(Number(value)),
        tick: <Icon name="check" size={13} />,
        options: list,
      },
    });
    const fits = options.flatMap((o, at) => (o.fits ? [option(o, at)] : []));
    const rest = options.flatMap((o, at) => (o.fits ? [] : [option(o, at)]));
    // A heading only where it parts two kinds: one kind is just the list.
    if (fits.length && rest.length) groups.push(set(fits, W.fitsNow), set(rest, W.others));
    else groups.push(set([...fits, ...rest]));
  }
  // Why the rest were not offered, said once under the list; alone, where one message is offered and some were kept back.
  const hidden = have.choice?.hidden;
  if (hidden) {
    const last = groups.pop();
    groups.push(last ? { ...last, caption: hidden } : { items: [], caption: hidden });
  }
  return groups;
}

/** The chosen message's name, a door to the others where there are others: the menu named for what sending does. */
function templatePick(shown: string, more: MenuGroup[], first: string) {
  const name = (
    <>
      <Icon name="note" size={12} />
      <span className="ix-tpl-title">{shown}</span>
      {more.length > 0 && <Icon name="chevron-down" size={11} />}
    </>
  );
  return more.length > 0 ? (
    <Menu
      align="start"
      head={{ title: THREAD_PANE_WORDS.pickTitle(first), close: <Icon name="x" size={13} /> }}
      trigger={
        <Button
          variant="quiet"
          size="sm"
          className="ix-tpl-name"
          aria-label={`Message to send: ${shown}. Choose another`}
          title="Choose another message"
        >
          {name}
        </Button>
      }
      groups={more}
    />
  ) : (
    <span className="ix-tpl-name">{name}</span>
  );
}

/**
 * The template's sentence as she will read it (the phone canvas, C1): its own words in the dim ink, and, where it has a
 * blank, the member's words written in its place on a line of their own, in the ink. A box for the words alone left the
 * owner sending a sentence they had not read.
 */
function templateSentence(
  parts: TemplatePart[],
  blank: { words: string; write: (v: string) => void; ref: RefObject<HTMLTextAreaElement | null> },
) {
  return (
    <p className="ix-tpl-fill" data-testid="ix-tpl-fill">
      {parts.map((part, i) =>
        part.blank !== undefined ? (
          <textarea
            key={`blank-${i}`}
            ref={blank.ref}
            className="ix-tpl-blank"
            value={blank.words}
            onChange={(e) => blank.write(e.target.value)}
            placeholder={THREAD_PANE_WORDS.blank(part.blank)}
            aria-label={`${part.blank}: your words, in the middle of the message`}
            maxLength={TEMPLATE_WORDS_MAX}
            rows={1}
            data-testid="ix-tpl-blank"
          />
        ) : (
          <span key={`words-${i}`}>{part.words}</span>
        ),
      )}
    </p>
  );
}

/**
 * The template send, drawn as the reply box is: the one capsule, the message to send at its head (its name opens the
 * others, where there are others) with what sending it does, then its sentence as she will read it, with the member's
 * words in its blank, and Send at the foot's right. Outside the window the box says what it will send instead of waiting
 * for words, and the bottom of every thread is the same shape. `lead` is a call to offer above it.
 */
export const TemplateComposer = ({
  onSend = () => {},
  threadId,
  real = false,
  thread = null,
  lead = null,
}: {
  onSend?: OnSend;
  threadId: string;
  real?: boolean;
  thread?: Thread | null;
  lead?: ReactNode;
}) => {
  const [sending, setSending] = useState(false);
  // The workspace's OWN approved templates, published by the seam. The button
  // used to name one by a hardcoded literal — booking_link_v1/en_US — which is
  // right for exactly one workspace and a guaranteed failure for every other,
  // including every newly created one, which has no template row at all.
  // undefined: still being read. null: the read failed (surface-data.ts), which is not "none approved".
  const readTemplates = inboxData().templates;
  const templates = Array.isArray(readTemplates) ? readTemplates : null;
  const [picked, setPicked] = useState(0);
  // The member's words for the chosen template's blank, as WhatsApp will take them (contracts templateWords).
  const [words, setWords] = useState("");
  const blankRef = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => growWithWords(blankRef, true), [words]);

  // On a seeded thread there is nothing to look up and nothing to send; keep
  // the mockup's own affordance.
  const have = templateChoice(real, templates, thread, picked);
  const { chosen, chosenTitle, blank } = have;
  const said = templateWords(words);

  const fire = () => {
    if (sending || !canDo("approve")) return;
    if (real && !chosen) return;
    // A blank left empty: the words go in the middle of the message, so the box asks for them where they go.
    if (blank && !said) {
      if (blankRef.current) blankRef.current.focus();
      return;
    }
    const r = onSend(threadId, chosen ? { template: chosen, ...(blank ? { words: said } : {}) } : { template: true });
    if (isPromise(r)) {
      setSending(true);
      void r
        .then((ok) => {
          if (ok !== false) setWords("");
        })
        .finally(() => setSending(false));
    }
  };

  // A caller with no WhatsApp thread whose call back the band offers: the call is what to do, so the reply box says
  // nothing of what cannot be sent beneath it -- "No approved message can go to Emily Chen yet" under Call back.
  const quiet = real && !!thread && thread.hasChat === false && ixBandCallBack(thread);
  if (real && !quiet && readTemplates === undefined) return withLead(lead, templateReading());
  const gap = templateGap({ real, quiet, thread, readTemplates, templates, held: inboxData().templatesHeld, have });
  // Nothing to offer and nothing to say (the band's Call back is the one way to them): no box at all. An empty one stood
  // under the card as a strip of its padding, read as a reply box cut off at the screen's foot (Ruben, 23 Oct 2026).
  if (gap === null && !lead) return null;
  if (gap !== undefined) {
    return (
      <div className="ix-composer">
        <div className="ix-composer-foot">
          <div className="ix-composer-actions">
            {lead}
            {gap}
          </div>
        </div>
      </div>
    );
  }

  const facts = factsFor(thread);
  const more = templateMenu(
    have,
    (at) => {
      setPicked(at);
      setWords("");
    },
    facts,
  );
  const shown = chosenTitle || (chosen ? chosen.name : "Booking link");
  const parts = chosen ? inboxTemplateParts(chosen, facts) : [];
  const send = (
    <Button
      variant="primary"
      className="ix-composer-send"
      onClick={fire}
      disabled={sending || (!!blank && !said)}
      title={
        chosen
          ? `Sends your approved template "${chosenTitle || chosen.name}" — the only message WhatsApp delivers outside the 24-hour window`
          : "Sends your approved booking-link template — the only message WhatsApp delivers outside the 24-hour window"
      }
      {...gate("approve")}
    >
      {sending ? "Sending…" : "Send"}
    </Button>
  );
  const capsule = (
    <div className="ix-composer ix-composer-row ix-composer-tpl" data-testid="ix-composer-tpl">
      <div className="ix-tpl-head">
        {templatePick(shown, more, facts.firstName ?? thread?.who ?? "")}
        <span className="ix-tpl-note">{THREAD_PANE_WORDS.reopens}</span>
      </div>
      <div className="ix-tpl-foot">
        {parts.length ? (
          templateSentence(parts, { words, write: setWords, ref: blankRef })
        ) : (
          <span className="ix-tpl-fill" />
        )}
        {send}
      </div>
    </div>
  );
  return withLead(lead, capsule);
};
