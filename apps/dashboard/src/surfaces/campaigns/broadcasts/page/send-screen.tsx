/**
 * The send screen: who, what and when, one under the other, and the send alone at the foot (moved from
 * legacy/pages/broadcasts.jsx, decision 0015; then onto the kit, Claude Video/docs/2026-10-02-campaigns-on-the-kit.md
 * §3.3). Each question is one sentence of tokens: To [a list] · 24 of 29 can hear it, with the people held back behind
 * one quiet link; Says [a message] [its language], the message as the customer reads it and each slot of it the control
 * that changes what fills it; Send by one switch for each channel it may go by (WhatsApp, Text, Email); When [Now] or [a day]
 * at [a time]. Plain functions that return the elements they draw,
 * called from BroadcastsReal with the page's state.
 */
import type { ReactNode } from "react";
import {
  CAMPAIGN_ROOMS,
  NO_TEMPLATE_WORDS,
  STARTER_LINE_WORDS,
  allowanceBeforeSend,
  heldBackWords,
  messageHolds,
  monthSentAt,
  offersNote,
} from "@chanlytics/contracts";
import type { ParamSourceKind, TemplateGroup } from "@chanlytics/contracts";
import { Button } from "../../../kit/button/button";
import { Confirm } from "../../../kit/confirm/confirm";
import { FailedRead } from "../../../kit/empty/empty";
import { Field } from "../../../kit/field/field";
import { Icon } from "../../../kit/icon/icon";
import { LinkButton } from "../../../kit/link-button/link-button";
import { Picker } from "../../../kit/picker/picker";
import { UnsavedAsk } from "../../../kit/record/work";
import { gate, gateTitle, routeDoor } from "../../../legacy-verbs";
import { MessagePreview, PreviewStepper } from "../../parts/message-preview";
import { CM_NO_MESSAGE_YET, CM_VIA_WORDS, cmNothingOpen, cmReadyOf, cmTick } from "../../parts/channels";
import { CmLangGlyph } from "../../parts/picker";
import { cmChevron, cmGroups, cmSearch } from "../../parts/picks";
import { CmVia } from "../../parts/send-by";
import { CmSlot } from "../../parts/slot";
import { CmSplitBar } from "../../parts/split-bar";
import { CmPane } from "../../parts/split";
import { TemplateComposer } from "../../templates/composer";
import { starters } from "../../templates/verbs";
import type { BroadcastTemplate } from "../surface";
import { broadcasts } from "../verbs";
import { BcWhenPick, bcNowNote } from "../when";
import { BcAudiencePick, BcCount, BcHeldBack, BcReachBar, BcReachBy } from "./audience";
import type { BcV } from "./types";
import { BC_SAYS, BC_TEXT, bcLangWords, bcTitle } from "./words";

// What stood as paragraphs under the To row, and now sits behind "Who's held back" (page/audience.tsx BcHeldBack): who said yes,
// the rules every send keeps (who is held back at the wire, how many go at a time), what an offer needs, and how many heard
// from a run this week.
function bcWhoNotes(v: BcV) {
  const { data, active, yesWords, purpose, sample, on } = v;
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
      {/* Who of these already heard from a run this week: a send by hand is not held back by the week a playbook
                waits, so the owner is told here, before it goes (contracts heardWords). */}
      {active && sample && sample.heard > 0 && (
        <div className="bc-excl-hint" data-testid="bc-heard">
          {broadcasts.heardWords(sample.heard)}
        </div>
      )}
    </>
  );
}

// What stops the send, said under the To line where the sender reads it and only while it does: a number that cannot carry
// the list, the month's emails or texts running out (contracts allowanceBeforeSend; a broadcast is held at it), and nobody
// to send it to -- with the door to where their yes is got.
function bcBlockers(v: BcV) {
  const { active, overLimit, number, activeCount, canSend, noNumber, yesDoor, on, purpose, sample, data, goesAt } = v;
  // The month the send is set to go in, not the month it is made in: one set for the 1st, made on the 28th, counts against the new month.
  const allowance =
    active && sample && sample.split
      ? allowanceBeforeSend(sample.split.byChannel, monthSentAt(data, goesAt), null, purpose)
      : null;
  return (
    <>
      {allowance && (
        <div className="bc-excl-hint" data-testid="bc-allowance">
          {allowance}
        </div>
      )}
      {overLimit && active && number && (
        <div className="bc-excl-hint" data-testid="bc-over-limit">
          This number can start up to {number.health.limitPerDay?.toLocaleString()} new conversations a day; “
          {active.label}” is {activeCount.toLocaleString()}. Send to a smaller list or split it.
        </div>
      )}
      {/* Where no channel is ticked the foot says so, by the act it stops: said here too, it was the same sentence twice
          in one screen (Ruben, 10 Oct 2026). */}
      {canSend && active && activeCount === 0 && on.length > 0 && (
        <div className="bc-excl-hint" data-testid="bc-nobody">
          {noNumber ? (
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
          )}
        </div>
      )}
    </>
  );
}

// To: the list as a token on one line, with how many of it can hear the message, on which channel where it goes by more than
// WhatsApp, and one quiet link to who is held back and why (everything this row said in paragraphs is behind it); a thin bar
// under it -- who it reaches on which channel, else who it reaches against who is held -- and, while it stops the send, why.
function bcColWho(v: BcV) {
  const { audiences, active, sizeOf, setAud, data, sample, people, setWho, activeCount, heldLines, reachBy, yesLink } =
    v;
  return (
    <div className="bc-col" data-testid="bc-col-who">
      <span className="bc-col-label">Who</span>
      <p className="bc-to-line">
        <BcAudiencePick audiences={audiences} active={active} sizeOf={sizeOf} onPick={setAud} />
        {active ? <BcCount sending={activeCount} held={sample ? sample.held : null} /> : null}
        {reachBy ? <BcReachBy words={reachBy} /> : null}
        {active ? (
          <BcHeldBack
            sample={sample}
            people={people}
            heldLines={heldLines}
            onWho={setWho}
            notes={bcWhoNotes(v)}
            yesLink={yesLink}
          />
        ) : null}
      </p>
      {data.listsRead === false && (
        <FailedRead
          kind="line"
          what="your saved lists"
          body="People's lists are current; the lists you made are missing until they read."
          surface="broadcasts"
          testid="bc-lists-failed"
        />
      )}
      {/* Where the send goes by more than WhatsApp alone the bar is who it reaches on which channel, its words on hover. */}
      {sample && reachBy && sample.split ? (
        <CmSplitBar split={sample.split} className="bc-to-bar" testid="bc-reach-bar" />
      ) : sample ? (
        <BcReachBar sending={activeCount} held={sample.held} />
      ) : null}
      {bcBlockers(v)}
    </div>
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

// The message it sends, one entry per message whatever languages it has (the language is its own control, and only a
// message in more than one has one), and, where the library holds what cannot go on the wire, why that is not offered.
function bcMessagePicks(v: BcV) {
  const { templates, tpl, tplId, setTplId, data, link, offered } = v;
  if (templates.length === 0) return null;
  const groups: BcGroup[] = starters.group(templates);
  const group = groups.find((g) => g.rows.some((r) => r.id === tplId)) ?? null;
  const lang = tpl ? tpl.language : null;
  const own = { business_name: data.businessName, booking_link: link ? "your booking link" : null };
  return (
    <>
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
        placeholder="Pick a message"
        {...(groups.length > 7 ? { search: cmSearch("Find a message", "No message has those words.") } : {})}
        {...(offered.why ? { note: offered.why } : {})}
        data-testid="bc-template"
      />
      {tpl && group && group.rows.length > 1 && (
        <Picker
          label="The language it goes out in"
          value={tpl.language}
          onValueChange={(next) => {
            const r = group.rows.find((x) => x.language === next);
            if (r) setTplId(r.id);
          }}
          groups={cmGroups(bcLanguageChoices(group))}
          chevron={cmChevron()}
          face={
            <>
              <CmLangGlyph status={tpl.meta_status || "approved"} />{" "}
              {starters.langTag(
                tpl.language,
                group.rows.map((r) => r.language),
              )}
            </>
          }
          note="A broadcast sends one language to everyone on the list."
          data-testid="bc-template-lang"
        />
      )}
    </>
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

// The message and the language it goes out in as tokens, and the way to write one here, or why there is none.
function bcMessageLine(v: BcV) {
  const { templatesRead, templates, offered, setComposing } = v;
  return (
    <>
      {!templatesRead && (
        <FailedRead kind="line" what="your templates" surface="broadcasts" testid="bc-templates-failed" />
      )}
      {templatesRead && templates.length === 0 && bcNoMessage(v)}
      <p className="bc-says-line">
        {bcMessagePicks(v)}
        <LinkButton
          onClick={() => setComposing((c) => !c)}
          data-testid="bc-new-template"
          {...gate("approve", "write a template")}
        >
          <Icon name="plus" size={11} /> New template
        </LinkButton>
      </p>
      {/* With nothing to pick, the reason the library's messages are not offered has no list to stand under. */}
      {templates.length === 0 && offered.why && (
        <div className="bc-excl-hint warn" data-testid="bc-blocked">
          {offered.why}
        </div>
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

// What: the message and its language, or why there is none, and the message as this person reads it -- the bubble is the
// fields, each slot of it the control that changes what fills it (the table of slots under it said every value again).
function bcColWhat(v: BcV) {
  const { tpl, data, vars, forPerson, goesAt, person, people, sample, who, setWho, personNote, noName, preview } = v;
  return (
    <div className="bc-col bc-col-what" data-testid="bc-col-what">
      <span className="bc-col-label">What</span>
      {bcMessageLine(v)}
      {tpl && preview && (
        <div className="bc-preview-wrap" data-testid="bc-preview">
          {/* The message as the person reads it on the channel they are reached on: preview is what that channel's version
              is handed to the bubble or the mail (parts/preview-by.ts), WhatsApp's template where it is WhatsApp. */}
          <MessagePreview
            from={data.businessName}
            values={forPerson}
            at={goesAt}
            held={person ? person.refusal : null}
            slot={vars.length > 0 ? bcSlot(v) : null}
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
        </div>
      )}
    </div>
  );
}

// Send by: one switch for each channel the send may go by (parts/send-by.tsx), each closed with its reason where the
// workspace cannot send on it or the message cannot go by it. What is on is worked out in page/reach.ts; pressing one
// starts from what is on, so a channel that was only ticked and never open is let go.
function bcColVia({ ticks, on, setChannels, data }: BcV) {
  return (
    <div className="bc-col bc-col-via" data-testid="bc-col-via">
      <span className="bc-col-label">{CM_VIA_WORDS.label}</span>
      <CmVia
        ticks={ticks}
        onTick={(channel, next) => setChannels(cmTick(on, channel, next))}
        testid="bc-via"
        standing={cmNothingOpen(data.ready)}
      />
    </div>
  );
}

// When: now, or a day and a time by the business's clock, what that means, and the number it goes from -- where the send
// goes by WhatsApp, the only channel that has one, or would but for the number, which is then what says why. Never under a
// message with no WhatsApp version: the tick stays ticked when the message is changed to one, and the number is nothing to
// it there.
function bcColWhen({ whenAt, maxDays, setWhenAt, whenNote, number, channels, tpl, data }: BcV) {
  const byWhatsApp = channels.includes("whatsapp") && messageHolds(tpl?.message ?? CM_NO_MESSAGE_YET).whatsapp;
  // Where nothing can send at all and there is no number, the Send by row has just said so, its door beside it: the
  // number's line here would be the same sentence a second time.
  const saidAbove = !!number && !number.present && cmNothingOpen(data.ready) !== null;
  return (
    <div className="bc-col" data-testid="bc-col-when">
      <span className="bc-col-label">When</span>
      <BcWhenPick at={whenAt} maxDays={maxDays} onChange={setWhenAt} />
      <div
        className={`bc-excl-hint${whenAt !== null && whenNote.tone === "warn" ? " bc-when-note-warn" : ""}`}
        data-testid="bc-when-note"
      >
        {whenAt === null ? bcNowNote() : whenNote.words}
      </div>
      {number && byWhatsApp && !saidAbove && (
        <div className={`bc-number bc-number-${number.health.tone}`} data-testid="bc-number">
          <Icon name="chat" size={11} />
          <span>{number.present ? `WhatsApp ${number.display || ""} · ${number.health.label}` : BC_SAYS.noNumber}</span>
        </div>
      )}
      {number && byWhatsApp && number.present && !number.health.canSend && (
        <div className="bc-excl-hint" data-testid="bc-number-refusal">
          {number.health.refusal}
        </div>
      )}
    </div>
  );
}

// A template written from here, over the send screen: submitted to WhatsApp, and named once it is in review.
function bcNewTemplate(v: BcV) {
  const { composing, data, setComposing, flash } = v;
  return (
    composing && (
      <TemplateComposer
        businessName={data.businessName}
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

// The send screen's foot: what keeps the send from going (the first thing, in one line, as the playbook composer's foot says
// its own: on a phone the foot is docked away from the columns that explain it), the name, and the two acts, the one that
// cannot be taken back asking before anything leaves. A time picked makes Schedule it the act, with Send now beside it. Cancel,
// and Escape, with something written: the one question first (UnsavedAsk), where the foot's acts were.
function bcSendFoot(v: BcV) {
  const { data, canSend, armed, ready, say, whenAt, whenNote, submit, setArmed, active, activeCount } = v;
  const { tpl, busy, work, splitWords } = v;
  if (work.asking) return <UnsavedAsk onYes={work.discard} onNo={work.stay} testid="bc-leave" />;
  // A time picked that cannot be scheduled (passed, or past the ceiling) is what Schedule it waits on, when nothing else is.
  const stop = say ?? (whenAt !== null && !whenNote.ok ? { tone: "warn" as const, words: whenNote.words } : null);
  // The act is the one the screen is set up for: Send now, or Schedule it once a time is picked, which is then the last
  // of the two, where the act stood.
  const later = whenAt !== null;
  const scheduleIt = (
    <Button
      key="later"
      variant={later ? "primary" : undefined}
      className={`bc-send-later ${later ? "bc-act-main" : "bc-act-second"}`}
      disabled={!ready || !whenNote.ok}
      onClick={() => submit(true)}
      {...gate("approve", "schedule a broadcast")}
    >
      Schedule it
    </Button>
  );
  const sendNow = (
    <Button
      key="now"
      variant={later ? undefined : "primary"}
      className={`bc-send-now ${later ? "bc-act-second" : "bc-act-main"}`}
      disabled={!ready}
      onClick={() => setArmed(true)}
      data-testid="bc-send"
      {...gate("approve", "send a broadcast")}
    >
      <Icon name="send" size={13} /> {active && activeCount > 0 ? `Send to ${activeCount} now` : "Send now"}
    </Button>
  );
  return (
    <div className="bc-foot">
      {/* Said while the person who may press the acts is stopped; a role that may not has its own line below. */}
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
        {/* Schedule stays one press: a scheduled run is cancelled from the row above,
                and nothing has left. Send now does not -- it is the only act on this
                surface that cannot be taken back, and it was the only one that was not
                armed, while Stop, Skip and both Deletes each ask first. */}
        {!armed && (later ? [sendNow, scheduleIt] : [scheduleIt, sendNow])}
        {armed && tpl && active && (
          <Confirm
            question={`Send “${bcTitle(tpl.name)}”${bcLangWords(tpl)} to ${activeCount} ${activeCount === 1 ? "person" : "people"} on “${active.label}”?`}
            detail={`${splitWords ? `${splitWords}. ` : ""}It goes out now${data.chunk ? `, ${data.chunk} at a time` : ""}. A message already delivered cannot be taken back.`}
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

// The send screen is a pane (parts/split.tsx), as a thread opens beside the Inbox's list, or the home's sheet holds it: titled
// "New message" (Campaigns' one name for the one door), its Cancel the pane's Close (which asks first where something was written, and is Escape's too), and the
// send alone in its foot. The one screen in Campaigns that cannot be undone: who, what and when at once, with the
// people named rather than counted.
function bcSendPane(v: BcV, body: ReactNode) {
  return (
    <CmPane
      testid="bc-composer"
      className="bc-pane bc-glass"
      title={CAMPAIGN_ROOMS.newMessage}
      closeLabel="Cancel"
      closeTestid="bc-compose-close"
      onClose={v.work.leave}
      foot={bcSendFoot(v)}
    >
      <div className="bc-composer">
        {bcNewTemplate(v)}
        {body}
      </div>
    </CmPane>
  );
}

// The questions stand as the canvas's rows (the compact composer, C2): To, Send by, Says, When, one under the other in one
// pane, each with its word at the left, and the foot the glass bar. The columns keep their own markup, testids and words;
// the row's word says what their eyebrows (Who, What, When) said. Send by stands under To (8 Oct 2026): the count under To
// is counted over the channels ticked, and stood two rows and a whole preview away from the switches that change it.
// The send's name, a row of its own under When: optional, and the message's own name where none is typed. It stood in the
// foot, between the line that says what stops the send and the send itself (Ruben, 10 Oct 2026: a foot holds the acts).
function bcColName({ name, setName }: BcV) {
  return (
    <div className="bc-col" data-testid="bc-col-name">
      <Field
        aria-label="Name this broadcast"
        placeholder="Optional"
        value={name}
        onValueChange={setName}
        maxLength={80}
      />
    </div>
  );
}

function bcGlassRow(word: string, body: ReactNode) {
  return (
    <div className="bc-grow">
      <span className="bc-grow-word">{word}</span>
      <div className="bc-grow-body">{body}</div>
    </div>
  );
}

export function bcComposerGlass(v: BcV) {
  return bcSendPane(
    v,
    <div className="bc-grows">
      {bcGlassRow("To", bcColWho(v))}
      {bcGlassRow(CM_VIA_WORDS.label, bcColVia(v))}
      {bcGlassRow("Says", bcColWhat(v))}
      {bcGlassRow("When", bcColWhen(v))}
      {bcGlassRow("Name", bcColName(v))}
    </div>,
  );
}
