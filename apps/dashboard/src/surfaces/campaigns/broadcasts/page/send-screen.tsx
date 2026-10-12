/**
 * The send screen as one sentence (moved from legacy/pages/broadcasts.jsx, decision 0015; then onto the kit, Claude
 * Video/docs/2026-10-02-campaigns-on-the-kit.md §3.3; Ruben, 11 Oct 2026, "Option B"): "Send [A quick note] to [Regulars]
 * by [WhatsApp], [now]." Each choice is a word of the sentence that is pressed; one quiet line under it says how many of
 * the list can hear it and opens who is held back; the message, folded under its first words, opens onto the bubble with
 * each slot the control that fills it; one line says when it goes and from which number; and the foot holds the one act,
 * which says what it will do ("Send to 14 now", "Schedule for tomorrow at 9:00 AM"). It stood as five rows (To, Send by,
 * Says, When, Name), each a word at the left, with a count, a bar, a clause and a link on its first. What stops the send
 * stands over the sentence, one callout each. Plain functions that return the elements they draw, called from
 * BroadcastsReal with the page's state.
 */
import type { ReactNode } from "react";
import {
  CAMPAIGN_ROOMS,
  HEARD_UNREAD_WORDS,
  LIFECYCLE_WORDS,
  NO_TEMPLATE_WORDS,
  PREVIEW_WORDS,
  STARTER_LINE_WORDS,
  allowanceBeforeSend,
  heardTooWords,
  heldBackWords,
  messageHolds,
  monthSentAt,
  offersNote,
} from "@chanlytics/contracts";
import type { ParamSourceKind, TemplateGroup } from "@chanlytics/contracts";
import { pageClock } from "@/legacy-bridge/zone";
import { Button } from "../../../kit/button/button";
import { Confirm } from "../../../kit/confirm/confirm";
import { FailedRead } from "../../../kit/empty/empty";
import { Field } from "../../../kit/field/field";
import { Icon } from "../../../kit/icon/icon";
import { LinkButton } from "../../../kit/link-button/link-button";
import { Picker } from "../../../kit/picker/picker";
import { Switch } from "../../../kit/switch/switch";
import { UnsavedAsk } from "../../../kit/record/work";
import { gate, gateTitle, routeDoor } from "../../../legacy-verbs";
import { MessagePreview, PreviewStepper } from "../../parts/message-preview";
import { CM_NO_MESSAGE_YET, cmNothingOpen, cmReadyOf, cmTick } from "../../parts/channels";
import { CmLangGlyph } from "../../parts/picker";
import { cmChevron, cmGroups, cmSearch } from "../../parts/picks";
import { CmPreviewFold } from "../../parts/preview-fold";
import { CmReachLine } from "../../parts/reach";
import { CmViaWord } from "../../parts/send-by";
import { CmSlot } from "../../parts/slot";
import { CmPane } from "../../parts/split";
import { TemplateComposer } from "../../templates/composer";
import { starters } from "../../templates/verbs";
import type { BroadcastTemplate } from "../surface";
import { broadcasts } from "../verbs";
import { BcWhenPick, bcNowNote } from "../when";
import { BcAudiencePick, BcHeldBox } from "./audience";
import type { BcV } from "./types";
import { BC_SAYS, BC_TEXT, bcLangWords, bcTitle } from "./words";

// What the reach line opens under the people held back (page/audience.tsx BcHeldBox): who said yes, the rules every send
// keeps (who is held back at the wire, how many go at a time), and what an offer needs. Who hears from you within a week
// of the send is said under the reach line itself, with its switch (bcHeard).
function bcWhoNotes(v: BcV) {
  const { data, active, yesWords, purpose, on } = v;
  return (
    <>
      <div className="bc-meta">
        <Icon name="shield" size={11} />
        <span>
          {active ? yesWords : "Pick who this goes to"}
          {" · "}
          {heldBackWords(on)}
          {data.chunk ? ` · sent ${data.chunk} at a time` : ""}
        </span>
      </div>
      {/* Said once, here, where an offer is picked: which channels carry offers, and so why a customer who only ever
                texted is not in an offer's count. The wire refuses per customer (sms_carries_no_promotions); the page
                states the rule, as the workspace's channels make it true today (contracts offersNote). */}
      {purpose === "marketing" && (
        <div className="bc-excl-hint" data-testid="bc-offers-note">
          {offersNote(cmReadyOf(data.ready))}
        </div>
      )}
    </>
  );
}

// Who of those it reaches hear from a campaign or a broadcast within a week of it, before or after: the send leaves them
// out, as the route skips them (the week's breath), and the kit's switch beside it, off, sends to them too (contracts
// heardWords, heardTooWords). Said on its own line under the reach line, where the count it changes is ("1 of 3 can hear
// it"), and only where somebody does: the switch is the owner's to see, never behind the line's press. Where who hears
// could not be read, the line says the send still leaves them out (contracts HEARD_UNREAD_WORDS), and there is nobody to
// switch.
function bcHeard(v: BcV) {
  const { active, heard, breathe, setHeardToo, data } = v;
  if (active && data.heardRead === false)
    return (
      <div className="cm-reach-line" data-testid="bc-heard-unread">
        <span className="cm-reach-press">{HEARD_UNREAD_WORDS}</span>
      </div>
    );
  if (!active || heard <= 0) return null;
  return (
    <div className="cm-reach-line" data-testid="bc-heard-line">
      <span className="cm-reach-press" data-testid="bc-heard">
        {broadcasts.heardWords(heard, breathe)}
      </span>{" "}
      <span className="cm-reach-press">
        <Switch
          labelledBy="bc-heard-too-word"
          checked={!breathe}
          onCheckedChange={(on) => setHeardToo(on)}
          data-testid="bc-heard-too"
        />
        <span id="bc-heard-too-word" data-testid="bc-heard-too-word">
          {heardTooWords(heard)}
        </span>
      </span>
    </div>
  );
}

/** One callout over the sentence: what keeps the send from going, with its door where it has one. */
function bcCallout(testid: string, glyph: string, words: ReactNode) {
  return (
    <p className="cm-callout" data-testid={testid}>
      <Icon name={glyph} size={14} />
      <span className="cm-callout-words">{words}</span>
    </p>
  );
}

// What stops the send, said over its sentence and only while it does: the lists that could not be read, a number that
// cannot carry the list, the month's emails or texts running out (contracts allowanceBeforeSend; a broadcast is held at
// it), and nobody to send it to -- with the door to where their yes is got.
function bcCallouts(v: BcV) {
  const { active, overLimit, number, activeCount, leftOut, canSend, noNumber, yesDoor, on, purpose, split } = v;
  const { data, goesAt } = v;
  // The month the send is set to go in, not the month it is made in: one set for the 1st, made on the 28th, counts against the new month.
  // Of who it sends to, by channel: a person it leaves out is sent nothing, and counts against no month.
  const allowance =
    active && split ? allowanceBeforeSend(split.byChannel, monthSentAt(data, goesAt), null, purpose) : null;
  return (
    <>
      {data.listsRead === false && (
        <FailedRead
          kind="line"
          what="your saved lists"
          body="People's lists are current; the lists you made are missing until they read."
          surface="broadcasts"
          testid="bc-lists-failed"
        />
      )}
      {allowance && bcCallout("bc-allowance", "alert", allowance)}
      {overLimit &&
        active &&
        number &&
        bcCallout(
          "bc-over-limit",
          "alert",
          <>
            This number can start up to {number.health.limitPerDay?.toLocaleString()} new conversations a day; “
            {active.label}” is {activeCount.toLocaleString()}. Send to a smaller list or split it.
          </>,
        )}
      {/* Where no channel is ticked the foot says so, by the act it stops: said here too, it was the same sentence twice
          in one screen (Ruben, 10 Oct 2026). Nobody it reaches, not everyone left out: that is the heard line's, with its
          switch, and the foot's. */}
      {canSend &&
        active &&
        activeCount === 0 &&
        leftOut === 0 &&
        on.length > 0 &&
        bcCallout(
          "bc-nobody",
          "alert",
          noNumber ? (
            noNumber
          ) : purpose === "marketing" ? (
            <>
              Nobody on “{active.label}” has said yes to offers yet. Record it under “Offers and news” on their profile
              {yesDoor}.
            </>
          ) : (
            <>
              Nobody on “{active.label}” has said yes to messages yet. Record it on their profile{yesDoor}.
            </>
          ),
        )}
    </>
  );
}

/** A message in its languages, as the library groups the approved rows. */
type BcGroup = TemplateGroup<BroadcastTemplate>;

// The row of a message in a language, else in English (US), else its first.
const bcRowIn = (g: BcGroup | undefined, lang: string | null): BroadcastTemplate | undefined =>
  g ? (g.rows.find((r) => r.language === lang) ?? g.rows.find((r) => r.language === "en_US") ?? g.rows[0]) : undefined;

// The languages a message goes out in: each with its words, its own words where they differ, and its letters.
function bcLanguageChoices(g: BcGroup) {
  const among = g.rows.map((r) => r.language);
  return g.rows.map((r) => {
    const known = starters.allLanguages.find((l) => l.id === r.language);
    return {
      id: r.language,
      label: g.labels[r.language] || starters.langLabel(r.language),
      ...(known && known.native && known.native !== known.name ? { sub: known.native } : {}),
      hint: starters.langTag(r.language, among),
      glyph: <CmLangGlyph status={r.meta_status || "approved"} />,
    };
  });
}

/** The messages as the library groups them, and the one in view's. */
function bcGroups(v: BcV) {
  const groups: BcGroup[] = starters.group(v.templates);
  const group = groups.find((g) => g.rows.some((r) => r.id === v.tplId)) ?? null;
  return { groups, group };
}

// The message it sends, a word of the sentence, one entry per message whatever languages it has (the language is its
// own word, under the preview), and, where the library holds what cannot go on the wire, why that is not offered. Each
// message's first words fill the review link as the listing keeps it, as they fill the booking link.
function bcMessageWord(v: BcV) {
  const { templates, tpl, setTplId, data, link, review, offered } = v;
  if (templates.length === 0) return <>a message</>;
  const { groups, group } = bcGroups(v);
  const lang = tpl ? tpl.language : null;
  const own = {
    business_name: data.businessName,
    booking_link: link ? "your booking link" : null,
    review_link: review ? "your review link" : null,
  };
  return (
    <Picker
      label="The message it sends"
      value={group ? group.name : null}
      onValueChange={(name) => {
        const r = bcRowIn(
          groups.find((g) => g.name === name),
          lang,
        );
        if (r) setTplId(r.id);
      }}
      groups={cmGroups(
        groups.map((g) => {
          const r = bcRowIn(g, lang);
          return {
            id: g.name,
            label: g.title,
            // Its first words as a customer reads them, so a message is chosen by what it says.
            ...(r ? { sub: starters.rowPreview(r, own) } : {}),
            hint: g.rows.length > 1 ? `${g.rows.length} languages` : null,
          };
        }),
      )}
      chevron={cmChevron()}
      face={group ? group.title : undefined}
      placeholder="a message"
      inline
      {...(groups.length > 7 ? { search: cmSearch("Find a message", "No message has those words.") } : {})}
      {...(offered.why ? { note: offered.why } : {})}
      data-testid="bc-template"
    />
  );
}

// The channels it goes by, a word of the sentence that opens their switches (parts/send-by.tsx CmViaWord), each with how
// many of the list it sends to there: those it leaves out for the week's breath taken off theirs (`split`, contracts
// reachAfterBreath), as every number beside the count is. What is on is worked out in page/reach.ts; pressing one starts
// from what is on, so a channel that was only ticked and never open is let go.
function bcViaWord(v: BcV) {
  const { ticks, on, setChannels, data, split } = v;
  const by = split ? split.byChannel : null;
  const counts = by
    ? Object.fromEntries(Object.entries(by).map(([c, n]) => [c, PREVIEW_WORDS.people(Number(n) || 0)]))
    : undefined;
  return (
    <CmViaWord
      ticks={ticks}
      onTick={(channel, next) => setChannels(cmTick(on, channel, next))}
      testid="bc-via"
      standing={cmNothingOpen(data.ready)}
      {...(counts ? { counts } : {})}
    />
  );
}

// The sentence: what is sent, to whom, by which channels, and when.
function bcRecipe(v: BcV) {
  const { audiences, active, sizeOf, setAud, whenAt, maxDays, setWhenAt } = v;
  return (
    <p className="cm-recipe" data-testid="bc-recipe">
      Send {bcMessageWord(v)} to{" "}
      <BcAudiencePick audiences={audiences} active={active} sizeOf={sizeOf} onPick={setAud} inline /> by {bcViaWord(v)},{" "}
      <BcWhenPick at={whenAt} maxDays={maxDays} onChange={setWhenAt} />.
    </p>
  );
}

// Who it reaches, the one line under the sentence (parts/reach.tsx CmReachLine): "14 of 18 can hear it · 4 never said
// yes", opening who is held back and why, every name a press that walks the bubble to them, with what the To row said.
// The count is who it sends to: those it leaves out for the week's breath are out of it and in the list's whole ("1 of 3
// can hear it"), said on the line under it with their switch (bcHeard); the channel clause and the bar are of who it
// sends to (`split`, contracts reachAfterBreath), as the count is.
function bcReach(v: BcV) {
  const { active, sample, people, setWho, activeCount, leftOut, split, heldLines, reachBy, yesLink } = v;
  if (!active) return null;
  const held = sample ? sample.held : 0;
  const first = heldLines[0] ? `${heldLines[0].n} ${heldLines[0].words}` : held > 0 ? `${held} held back` : null;
  return (
    <CmReachLine
      will={activeCount}
      // A list read before its people were kept has no pool to say: the count alone, never "All".
      pool={sample ? activeCount + held + leftOut : null}
      of={`on “${active.label}”`}
      first={first}
      by={reachBy}
      split={split}
      box={
        <BcHeldBox
          sample={sample}
          people={people}
          heldLines={heldLines}
          onWho={setWho}
          notes={bcWhoNotes(v)}
          yesLink={yesLink}
        />
      }
      testid="bc-reach"
    />
  );
}

// Why there is no message to pick: the starters' WhatsApp versions in review, or none yet (the starter set is one press).
function bcNoMessage({ starterPending, addingStarters, addStarters }: BcV) {
  return (
    <>
      <span className="bc-excl-hint" data-testid="bc-no-template">
        {starterPending > 0 ? (
          STARTER_LINE_WORDS.reviewing(starterPending)
        ) : (
          <>
            {NO_TEMPLATE_WORDS.lead}{" "}
            <LinkButton {...routeDoor("messages")} data-testid="bc-no-template-open">
              {NO_TEMPLATE_WORDS.link}
            </LinkButton>
            .
          </>
        )}
      </span>
      {starterPending === 0 && (
        <Button
          size="sm"
          className="bc-says-add"
          disabled={addingStarters}
          onClick={addStarters}
          data-testid="bc-add-starters"
          {...gate("approve", "add the starter set")}
        >
          <Icon name="sparkle" size={11} /> {addingStarters ? "Adding…" : "Add the starter set"}
        </Button>
      )}
    </>
  );
}

// One slot of the message, in the bubble (parts/slot.tsx): its words where the customer reads them, and, where it may take
// more than one thing or is typed, the control that changes what fills it -- the sources it may take, and the words typed
// when it is typed. The slot is the template's {{n}}, the nth of its values.
function bcSlot(v: BcV) {
  const { vars, choices, labels, SRC, HINTS, srcOf, typed, setTyped, chooseSource, data } = v;
  return (at: number, text: string) => {
    const found = vars.findIndex((x) => Number(x.position) === at + 1);
    const i = found >= 0 ? found : at;
    const one = vars[i];
    const src = srcOf(i);
    const opts: ParamSourceKind[] = choices[i] || BC_TEXT;
    return (
      <CmSlot
        label={labels[i] || `Value ${at + 1}`}
        text={text}
        kind={src}
        offers={opts.map((k) => ({ id: k, label: SRC[k] || k }))}
        onKind={(kind) => chooseSource(i, kind as ParamSourceKind)}
        typed={typed[i] ?? ""}
        onTyped={(words) => setTyped(i, words)}
        placeholder={
          opts[0] === "business_name" ? data.businessName || "" : one && one.example ? String(one.example) : ""
        }
        hint={src !== "text" ? HINTS[src] : null}
        testid="bc-var"
      />
    );
  };
}

// Under the preview: the language it goes out in, where the message has more than one, and the way to write a message here.
function bcMessageCaption(v: BcV) {
  const { tpl, setTplId, setComposing } = v;
  const { group } = bcGroups(v);
  return (
    <p className="cm-msg-cap" data-testid="bc-msg-cap">
      {tpl && group && group.rows.length > 1 ? (
        <>
          <Picker
            label="The language it goes out in"
            value={tpl.language}
            onValueChange={(next) => {
              const r = group.rows.find((x) => x.language === next);
              if (r) setTplId(r.id);
            }}
            groups={cmGroups(bcLanguageChoices(group))}
            chevron={cmChevron()}
            face={group.labels[tpl.language] || starters.langLabel(tpl.language)}
            inline
            note="A broadcast sends one language to everyone on the list."
            data-testid="bc-template-lang"
          />
          <span className="cm-msg-cap-dim"> · </span>
        </>
      ) : null}
      <LinkButton
        onClick={() => setComposing((c) => !c)}
        data-testid="bc-new-template"
        {...gate("approve", "write a template")}
      >
        <Icon name="plus" size={11} /> New template
      </LinkButton>
    </p>
  );
}

// What: the message as this person reads it, folded under its first words and open by itself while a slot waits to be
// typed -- the bubble is the fields, each slot of it the control that changes what fills it -- with the people it reaches
// walked over its head; or why there is no message to send.
function bcMessage(v: BcV) {
  const { tpl, data, vars, forPerson, goesAt, person, people, sample, who, setWho, personNote, noName, preview } = v;
  const { templatesRead, templates, offered, filled } = v;
  const blank = filled.some((x) => !String(x).trim());
  return (
    <div className="bc-col bc-col-what" data-testid="bc-col-what">
      {!templatesRead && (
        <FailedRead kind="line" what="your templates" surface="broadcasts" testid="bc-templates-failed" />
      )}
      {templatesRead && templates.length === 0 && bcNoMessage(v)}
      {/* With nothing to pick, the reason the library's messages are not offered has no list to stand under. */}
      {templates.length === 0 && offered.why && (
        <div className="bc-excl-hint warn" data-testid="bc-blocked">
          {offered.why}
        </div>
      )}
      {tpl && preview && (
        <div className="bc-preview-wrap" data-testid="bc-preview">
          {/* The message as the person reads it on the channel they are reached on: preview is what that channel's version
              is handed to the bubble or the mail (parts/preview-by.ts), WhatsApp's template where it is WhatsApp. */}
          <CmPreviewFold id="bc-preview" body={preview.body} values={forPerson} open={blank} testid="bc-preview-fold">
            <MessagePreview
              from={data.businessName}
              values={forPerson}
              at={goesAt}
              held={person ? person.refusal : null}
              slot={vars.length > 0 ? bcSlot(v) : null}
              bare
              {...preview}
            >
              <PreviewStepper
                people={people.map((x, i) => ({
                  label: x.label,
                  position: x.refusal ? "held back" : `${i + 1} of ${sample ? sample.sending : 0}`,
                }))}
                index={Math.min(who, Math.max(people.length - 1, 0))}
                onStep={setWho}
                note={personNote}
                tone={person && (person.refusal || noName) ? "warn" : null}
              />
            </MessagePreview>
          </CmPreviewFold>
        </div>
      )}
      {bcMessageCaption(v)}
    </div>
  );
}

// When it goes and from where, the line under the message: now or the time picked, by the business's clock, and the number
// it goes from where it goes by WhatsApp, the only channel that has one. What WhatsApp says of the number (its rating, its
// daily limit) is said only where it stops or slows the send, over the sentence: "Number quality not reported yet · daily
// limit not reported yet" under every send was a line nobody acts on (Ruben, 11 Oct 2026). Never under a message with no
// WhatsApp version: the tick stays ticked when the message is changed to one, and the number is nothing to it there.
function bcWhenLine({ whenAt, whenNote, number, channels, tpl, data }: BcV) {
  const byWhatsApp = channels.includes("whatsapp") && messageHolds(tpl?.message ?? CM_NO_MESSAGE_YET).whatsapp;
  // Where nothing can send at all and there is no number, the channels' list says so, its door beside it.
  const saidAbove = !!number && !number.present && cmNothingOpen(data.ready) !== null;
  const troubled =
    !!number && (!number.health.canSend || number.health.tone === "warn" || number.health.tone === "danger");
  const from =
    number && byWhatsApp && !saidAbove && number.present && !troubled ? `From WhatsApp ${number.display || ""}` : null;
  return (
    <>
      {number && byWhatsApp && !saidAbove && (!number.present || troubled)
        ? bcCallout(
            "bc-number",
            "chat",
            !number.present
              ? BC_SAYS.noNumber
              : !number.health.canSend
                ? number.health.refusal
                : `WhatsApp ${number.display || ""} · ${number.health.label}`,
          )
        : null}
      <p
        className={`cm-next${whenAt !== null && whenNote.tone === "warn" ? " bc-when-note-warn" : ""}`}
        data-testid="bc-when-note"
      >
        <Icon name="clock" size={13} />
        <span>
          {whenAt === null ? bcNowNote() : whenNote.words}
          {from ? <span data-testid="bc-number"> · {from}</span> : null}
        </span>
      </p>
    </>
  );
}

// A template written from here, over the send screen: submitted to WhatsApp, and named once it is in review.
function bcNewTemplate(v: BcV) {
  const { composing, data, setComposing, flash } = v;
  return (
    composing && (
      <TemplateComposer
        businessName={data.businessName}
        // Its starters by the review link the page's own surface read (GET settings' review_link, through the broadcasts
        // surface), so the review ask is offered here with Settings never opened in this tab.
        reviewLink={data.reviewLink}
        onCancel={() => setComposing(false)}
        onDone={(made) => {
          setComposing(false);
          flash({
            msg: (
              <>
                <b>{made.name}</b> submitted — WhatsApp reviews it; it appears here once approved
              </>
            ),
          });
        }}
      />
    )
  );
}

// The send screen's foot: what keeps the send from going (the first thing, in one line), and the one act the sentence is
// set up for, saying what it will do: "Send to 14 now", which asks before anything leaves, or once a time is picked
// "Schedule for tomorrow at 9:00 AM" (Ruben, 11 Oct 2026: one send button; the time is chosen in the sentence's "now").
// Cancel, and Escape, with something written: the one question first (UnsavedAsk), where the act was.
function bcSendFoot(v: BcV) {
  const { data, canSend, armed, ready, say, whenAt, whenNote, submit, setArmed, active } = v;
  // Send now goes at once: its button, its readiness and its confirm are who it sends to now (reach.ts bcSendNowOf), so a
  // confirm still open after a time is picked asks for, and sends, what goes now. With no time picked it is the screen's own
  // count, which is when its button stands.
  const { tpl, busy, work, sendNow, readyNow } = v;
  if (work.asking) return <UnsavedAsk onYes={work.discard} onNo={work.stay} testid="bc-leave" />;
  // A time picked that cannot be scheduled (passed, or past the ceiling) is what Schedule waits on, when nothing else is.
  const stop = say ?? (whenAt !== null && !whenNote.ok ? { tone: "warn" as const, words: whenNote.words } : null);
  const S = LIFECYCLE_WORDS.compose.sentence;
  const act =
    whenAt !== null ? (
      <Button
        variant="primary"
        className="bc-send-later bc-act-main"
        disabled={!ready || !whenNote.ok}
        onClick={() => submit(true)}
        data-testid="bc-schedule"
        {...gate("approve", "schedule a broadcast")}
      >
        <Icon name="clock" size={13} /> {S.scheduleFor(S.at(pageClock().when(whenAt)))}
      </Button>
    ) : (
      <Button
        variant="primary"
        className="bc-send-now bc-act-main"
        disabled={!readyNow}
        onClick={() => setArmed(true)}
        data-testid="bc-send"
        {...gate("approve", "send a broadcast")}
      >
        <Icon name="send" size={13} /> {active && sendNow.count > 0 ? `Send to ${sendNow.count} now` : "Send now"}
      </Button>
    );
  return (
    <div className="bc-foot">
      {/* Said while the person who may press the act is stopped; a role that may not has its own line below. */}
      {canSend && stop && (
        <span
          className={`bc-excl-hint bc-foot-say${stop.tone === "warn" ? " warn" : ""}`}
          role="status"
          data-testid="bc-foot-say"
        >
          {stop.words}
        </span>
      )}
      {/* Stop, Skip and Cancel stay with the roles that may press them; the page says why once, in the gate's words. */}
      {!canSend && (
        <div className="bc-excl-hint" data-testid="bc-role">
          {gateTitle("approve", "stop or cancel a broadcast")}
        </div>
      )}
      <span className="bc-actions-spacer" />
      <div className="bc-actions" data-foot-pair="">
        {/* Schedule stays one press: a scheduled run is cancelled from the row above, and nothing has left. Send now does
            not -- it is the only act on this surface that cannot be taken back, so it asks first. */}
        {!armed && act}
        {armed && tpl && active && (
          <Confirm
            question={`Send “${bcTitle(tpl.name)}”${bcLangWords(tpl)} to ${sendNow.count} ${sendNow.count === 1 ? "person" : "people"} on “${active.label}”?`}
            detail={`${sendNow.splitWords ? `${sendNow.splitWords}. ` : ""}It goes out now${data.chunk ? `, ${data.chunk} at a time` : ""}. A message already delivered cannot be taken back.`}
            yes="Yes, send it"
            busy={busy}
            onYes={() => submit(false)}
            onNo={() => setArmed(false)}
            testid="bc-send"
          />
        )}
      </div>
    </div>
  );
}

// The send's name, the pane's own title, written where it is read: the message's own name where none is typed (it stood as
// a row of its own, "Name · Optional", under When).
function bcTitleField({ name, setName, tpl }: BcV) {
  return (
    <span className="pb-title-wrap">
      <Field
        className="pb-title-box"
        shape="title"
        aria-label="Name this broadcast"
        placeholder={tpl ? bcTitle(tpl.name) : CAMPAIGN_ROOMS.newMessage}
        value={name}
        onValueChange={setName}
        maxLength={80}
        spellCheck={false}
        data-testid="bc-name"
      />
      <Icon name="pencil" size={13} />
    </span>
  );
}

// The send screen is a pane (parts/split.tsx), as a thread opens beside the Inbox's list, or the home's sheet holds it: its
// name the pane's title, its Cancel the pane's Close (which asks first where something was written, and is Escape's too),
// and the send alone in its foot. The one screen in Campaigns that cannot be undone: who, what and when in one sentence,
// with the people named rather than counted.
export function bcComposerGlass(v: BcV) {
  return (
    <CmPane
      testid="bc-composer"
      className="bc-pane bc-glass"
      title={bcTitleField(v)}
      closeLabel="Cancel"
      closeTestid="bc-compose-close"
      onClose={v.work.leave}
      foot={bcSendFoot(v)}
    >
      <div className="bc-composer cm-sentence">
        {bcNewTemplate(v)}
        {bcCallouts(v)}
        {bcRecipe(v)}
        {bcReach(v)}
        {bcHeard(v)}
        {bcMessage(v)}
        {bcWhenLine(v)}
      </div>
    </CmPane>
  );
}
