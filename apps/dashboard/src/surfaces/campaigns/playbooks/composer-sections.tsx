/**
 * The playbook composer's body, as one sentence (moved from legacy/pages/playbook-composer.jsx, decision 0015; Ruben,
 * 11 Oct 2026, "Option B"): "Every day at [10:00 AM], a [WhatsApp] to [everyone with an appointment tomorrow], [without
 * asking you]." Each choice is a word of the sentence that is pressed (the kit's inline token), and under it one quiet
 * line says who it reaches now, the message stands as its person reads it with its name and language under it, and one
 * line says when it first runs. It stood as five rows (To, Send by, Says, When, Rules), each a word at the left and a
 * section beside it, with a count, a bar, a chip and a shield of their own. Each part is a plain function over the
 * composer's model and setters, called from the sheet's body, so the tree is what the one component drew.
 *
 * A slot takes only what keeps its message true (contracts slotChoices), and stays the control in the bubble where the
 * message reads (parts/slot.tsx).
 */
import type { Dispatch, ReactNode, SetStateAction } from "react";
import {
  LIFECYCLE_WORDS,
  MESSAGE_GONE_WORDS,
  PREVIEW_WORDS,
  STARTER_LINE_WORDS,
  PLAYBOOK_CAP_CHOICES,
  messageAboutOfTrigger,
  momentHoldsWords,
  nextRunLabel,
  noMessageWords,
  type ConsentChannel,
} from "@chanlytics/contracts";
import type { TemplateDto } from "@/surfaces/inbox/types";
import { pageClock } from "@/legacy-bridge/zone";
import { routeDoor } from "../../legacy-verbs";
import { FailedRead } from "../../kit/empty/empty";
import { Icon } from "../../kit/icon/icon";
import { LinkButton } from "../../kit/link-button/link-button";
import { Picker } from "../../kit/picker/picker";
import { cmNothingOpen, cmStandInOf, cmTick } from "../parts/channels";
import { MessagePreview, PreviewStepper } from "../parts/message-preview";
import { CmLangGlyph } from "../parts/picker";
import { cmChevron, cmGroups, cmNumbers, cmSearch } from "../parts/picks";
import { cmOfferFoot, cmPreviewBy } from "../parts/preview-by";
import { CmPreviewFold } from "../parts/preview-fold";
import { CmReachLine } from "../parts/reach";
import { CmRuleWord, cmRuleOf } from "../parts/rule";
import { CmViaWord } from "../parts/send-by";
import { CmSlot } from "../parts/slot";
import type { Fields, Model } from "./composer-model";
import type { PlaybookCardVM, PlaybooksSurface } from "./surface";
import {
  PB_CADENCES,
  PB_GAPS,
  PB_LIST_CLASSES,
  PB_LIST_GROUPS,
  PB_NONE,
  PB_TEXT,
  pbExample,
  pbFooter,
  pbGuardWords,
  pbHour,
  pbHours,
  pbListSub,
  pbShort,
  pbTitle,
  pbWith,
} from "./words";

/** What a section reads: the model, what the sheet holds, and the ways to change it. */
export interface SectionCtx extends Model {
  data: PlaybooksSurface;
  /** The campaign being changed, which is no news to itself where the moment's other campaigns are said; null for a new one. */
  editingId: string | null;
  editingTemplateName: string | null;
  /** The campaign being changed, as it stands: its next run is said, and what an edit moved is marked against it. */
  editing: PlaybookCardVM | null;
  /** The fields it opened with: a word that differs from its own is marked changed. */
  opened: Fields;
  f: Fields;
  canEdit: boolean;
  adding: boolean;
  setHour: Dispatch<SetStateAction<number>>;
  setCap: Dispatch<SetStateAction<number>>;
  setGap: Dispatch<SetStateAction<number>>;
  setCadence: Dispatch<SetStateAction<number>>;
  setListId: Dispatch<SetStateAction<string | null>>;
  setCls: Dispatch<SetStateAction<string>>;
  setChannels: Dispatch<SetStateAction<ConsentChannel[] | null>>;
  setFills: Dispatch<SetStateAction<Fields["fills"]>>;
  setTyped: Dispatch<SetStateAction<Fields["typed"]>>;
  /** Which step of the preview's walk is in view (the channels it goes by, in the page's order), and the press that moves it. */
  who: number;
  setWho: Dispatch<SetStateAction<number>>;
  chooseMoment: (id: string) => void;
  chooseMessage: (id: string) => void;
  chooseLanguage: (lang: string) => void;
  addStarter: () => Promise<void>;
}

/** The words an edit moved, by field: a changed word wears a dot, and the foot counts them (composer.tsx). */
export function changedFields(x: Pick<SectionCtx, "editing" | "opened" | "f" | "kept">): string[] {
  if (!x.editing) return [];
  const { f, opened } = x;
  const was = [...(opened.channels ?? [])].sort().join();
  const now = [...x.kept].sort().join();
  const moved: [string, boolean][] = [
    ["trigger", f.trigger !== opened.trigger],
    ["list", f.listId !== opened.listId || f.cls !== opened.cls],
    ["hour", f.hour !== opened.hour],
    ["cap", f.cap !== opened.cap],
    ["gap", f.gap !== opened.gap || f.cadence !== opened.cadence],
    ["channels", was !== now],
    ["message", f.tplId !== opened.tplId],
  ];
  return moved.filter(([, on]) => on).map(([k]) => k);
}

/** The class a changed word carries: its dot (campaigns.css `.cm-changed`). */
const changedCls = (x: SectionCtx, field: string): string | undefined =>
  changedFields(x).includes(field) ? "cm-changed" : undefined;

/** The moment it runs on, as the people it names: "everyone with an appointment tomorrow", every moment behind it. */
function momentPicker(x: SectionCtx) {
  const { f, trig, momentChoices, chooseMoment } = x;
  return (
    <Picker
      label="The moment it runs on"
      value={f.trigger}
      onValueChange={chooseMoment}
      groups={cmGroups(momentChoices)}
      chevron={cmChevron()}
      face={trig ? LIFECYCLE_WORDS.compose.sentence.who(trig.id, x.data.shape.word) : undefined}
      placeholder="pick a moment"
      inline
      className={changedCls(x, "trigger")}
      data-testid="pb-moment"
    />
  );
}

/** Which list it runs on: one of People's, or one of the workspace's own, and where there is none, the way to make one. */
function listPicker(x: SectionCtx) {
  const { f, lists, list, setListId } = x;
  if (lists.length === 0) return null;
  return (
    <Picker
      label="The list it runs on"
      value={f.listId}
      onValueChange={setListId}
      groups={cmGroups(
        lists.map((l) => ({
          id: l.id,
          label: l.name,
          group: l.builtin ? "people" : "own",
          sub: pbListSub(l),
          icon: l.builtin || l.smart ? "sparkle" : "filter",
          hint:
            l.candidates === null || l.candidates === undefined
              ? null
              : l.candidates > 0
                ? `${l.candidates} today`
                : "nobody today",
        })),
        PB_LIST_GROUPS,
      )}
      chevron={cmChevron()}
      face={list ? list.name : undefined}
      placeholder="pick a list"
      inline
      className={changedCls(x, "list")}
      {...(lists.length > 8 ? { search: cmSearch("Find a list", "No list has those words.") } : {})}
      data-testid="pb-list"
    />
  );
}

/** What a playbook on a list sends, and so which row of Autonomy governs it: an offer, or a win-back. */
function classPicker(x: SectionCtx) {
  const { f, setCls } = x;
  const one = PB_LIST_CLASSES.find((c) => c.id === f.cls);
  return (
    <Picker
      label="What it sends"
      value={f.cls}
      onValueChange={setCls}
      groups={cmGroups(PB_LIST_CLASSES)}
      chevron={cmChevron()}
      face={one ? one.label.toLowerCase() : undefined}
      inline
      className={changedCls(x, "list")}
      data-testid="pb-list-class"
    />
  );
}

/** The hour it runs at, a word of the sentence: every hour the sending hours hold. */
function hourPicker(x: SectionCtx) {
  const { f, setHour } = x;
  return (
    <Picker
      label="The hour it runs at"
      value={String(f.hour)}
      onValueChange={(h) => setHour(Number(h))}
      groups={cmNumbers(pbHours().map((h) => ({ v: h, t: pbHour(h) })))}
      chevron={cmChevron()}
      inline
      className={changedCls(x, "hour")}
      data-testid="pb-hour"
    />
  );
}

/** The most one run sends: "up to [25] a run". */
function capPicker(x: SectionCtx) {
  const { f, setCap } = x;
  return (
    <Picker
      label="The most one run sends"
      value={String(f.cap)}
      onValueChange={(n) => setCap(Number(n))}
      groups={cmNumbers(pbWith(PLAYBOOK_CAP_CHOICES, Number(f.cap)).map((n) => ({ v: n, t: String(n) })))}
      chevron={cmChevron()}
      inline
      className={changedCls(x, "cap")}
      data-testid="pb-cap"
    />
  );
}

/** The days before the same person hears it again (a month's offer: how often they hear it): "Never twice in [90 days]". */
function gapPicker(x: SectionCtx) {
  const { f, monthly, setGap, setCadence } = x;
  const repeat = monthly ? f.cadence : f.gap;
  return (
    <Picker
      label={monthly ? "How often the same person hears it" : "The days before the same person hears it again"}
      value={String(repeat)}
      onValueChange={(n) => (monthly ? setCadence : setGap)(Number(n))}
      groups={cmNumbers(pbWith(monthly ? PB_CADENCES : PB_GAPS, Number(repeat)).map((n) => ({ v: n, t: `${n} days` })))}
      chevron={cmChevron()}
      inline
      className={changedCls(x, "gap")}
      data-testid="pb-gap"
    />
  );
}

/**
 * The channels it goes by, a word of the sentence that opens their switches (parts/send-by.tsx CmViaWord): each with how
 * many of the people it reaches now it carries, or why it is closed. What it keeps is worked out in the model; a press
 * starts from what it keeps, so a channel kept and waiting is not let go by a press on another.
 */
function viaWord(x: SectionCtx) {
  const { ticks, kept, steps, setChannels } = x;
  const counts = Object.fromEntries(steps.map((s) => [s.channel, s.position]));
  return (
    <span className={changedCls(x, "channels")}>
      <CmViaWord
        ticks={ticks}
        onTick={(channel, next) => setChannels(cmTick(kept, channel, next))}
        testid="pb-via"
        standing={cmNothingOpen(x.data.ready)}
        counts={counts}
      />
    </span>
  );
}

/**
 * The sentence: when it runs, what goes by which channel to whom, how many a run reaches, the rule its runs keep, and how
 * long before the same person hears it again. "Every day at [10:00 AM], a [WhatsApp] to [everyone with an appointment
 * tomorrow], [without asking you]."; a moment of a list's "…, up to [25] a run, [asking you first]. Never twice in [90
 * days]."; a list's "[An offer] by [WhatsApp] to [everyone on a list]: [Regulars], …". A visit's moment has no cap and no
 * gap: one message per visit. A follow-up is owed once per proposal (0006): there is no gap to choose.
 */
export function recipe(x: SectionCtx) {
  const { trig, visits, onList, runsUnder } = x;
  const S = LIFECYCLE_WORDS.compose.sentence;
  const deal = !!trig && trig.kind === "deal";
  return (
    <p className="cm-recipe" data-testid="pb-recipe">
      {S.everyDay} {hourPicker(x)}, {onList ? <>{classPicker(x)} by </> : "a "}
      {viaWord(x)} to {momentPicker(x)}
      {onList ? <>: {listPicker(x)}</> : null}
      {visits ? null : <>, up to {capPicker(x)} a run</>}
      {cmRuleOf(runsUnder) ? (
        <>
          , <CmRuleWord cls={runsUnder} testid="pb-runs-under" />
        </>
      ) : null}
      .{visits ? null : deal ? " One message per proposal." : <> Never twice in {gapPicker(x)}.</>}
    </p>
  );
}

/** The campaigns the chosen moment already holds, one line each: "Win-back · On". None where it holds none. */
function momentHolds(x: SectionCtx) {
  const holds = momentHoldsWords(x.data.rows, x.f.trigger, x.editingId);
  if (holds.length === 0) return null;
  return (
    <p className="pb-holds" data-testid="pb-holds">
      {holds.map((h, i) => (
        <span key={`${i}-${h}`}>{h}</span>
      ))}
    </p>
  );
}

/** One callout over the sentence: what keeps a run from sending, with its door. */
function callout(testid: string, glyph: string, words: ReactNode, door: ReactNode) {
  return (
    <p className="cm-callout" data-testid={testid}>
      <Icon name={glyph} size={14} />
      <span className="cm-callout-words">{words}</span>
      {door}
    </p>
  );
}

/** Where the moment reads the calendar and none is connected: the sentence, and its door to the calendar's own row. */
function calendarWarning(x: SectionCtx) {
  const W = LIFECYCLE_WORDS.compose.calendar;
  if (!x.visits || x.data.calendar === "ok") return null;
  return callout(
    "pb-calendar",
    "calendar",
    W.words,
    <LinkButton className="cm-callout-door" {...routeDoor(W.door.to)} data-testid="pb-calendar-door">
      {W.door.label} <Icon name="chevron" size={11} />
    </LinkButton>,
  );
}

/**
 * What stops a run from sending from the number: a number that cannot send, or none. Said while the campaign goes by
 * WhatsApp, the one channel that has a number; one that goes by email alone never asks. Each says it with its door to
 * Settings › Connections, where it is mended (decision 20).
 */
function numberWarning(x: SectionCtx) {
  const { data, kept } = x;
  if (!data.number || !kept.includes("whatsapp")) return null;
  const W = LIFECYCLE_WORDS.compose.number;
  const door = (
    <LinkButton className="cm-callout-door" {...routeDoor(W.door.to)} data-testid="pb-number-door">
      {W.door.label} <Icon name="chevron" size={11} />
    </LinkButton>
  );
  if (data.number.present && !data.number.health.canSend)
    return callout("pb-number", "chat", data.number.health.refusal, door);
  // Where nothing can send at all, the channels' list has already said so, WhatsApp's number among its doors.
  return data.number.present || cmNothingOpen(data.ready) ? null : callout("pb-number", "chat", W.words, door);
}

/** What stands over the sentence: the moment's other campaigns, and what keeps a run from sending. */
export function overSentence(x: SectionCtx) {
  return (
    <>
      {momentHolds(x)}
      {calendarWarning(x)}
      {numberWarning(x)}
    </>
  );
}

/**
 * Who it reaches now, the one line under the sentence (parts/reach.tsx CmReachLine): "2 of 6 can hear it · 4 never said
 * yes to offers", the press that opens every reason with its door, who it reaches on which channel, the month's allowance,
 * and the rules every run keeps (the shield's words, which stood as a tip of their own).
 */
export function reachLine(x: SectionCtx) {
  // `allowance`: what the month's emails or texts hold back of one run at its cap (the model's, contracts heldBackOfOneRun).
  const { trig, counted, will, pool, of, base, reasons, split, splitBy, allowance, kept, purpose } = x;
  if (!trig || !counted) return null;
  const guard = pbGuardWords(
    { kind: trig.kind, word: x.data.shape.word },
    kept,
    purpose,
    messageAboutOfTrigger(trig.id),
  );
  return (
    <CmReachLine
      will={will}
      pool={pool}
      of={of}
      held={base.held}
      reasons={reasons}
      by={splitBy}
      split={split}
      allowance={allowance}
      guard={guard}
      testid="pb-reach"
    />
  );
}

/** The moment's own message, not added yet: its WhatsApp version where WhatsApp still reviews it, or nothing to say. */
function starterLine(x: SectionCtx) {
  const { templatesRead, starter, starterGroup, starterAny } = x;
  if (!(templatesRead && starter && !starterGroup && starterAny)) return null;
  return (
    <p className="pb-empty-line" data-testid="pb-starter">
      <Icon name="sparkle" size={12} />
      <span>
        <b>{starter.title}</b>, written for this moment, {STARTER_LINE_WORDS.standing(starterAny.meta_status)}
      </span>
    </p>
  );
}

/**
 * The moment's own message as it would read, before it is added (Ruben, 11 Oct 2026: Turn on adds it, then turns the
 * campaign on): its WhatsApp words in the language the Library adds, each slot as a run fills it. Null where the moment
 * has none, or it is added.
 */
export function starterToAdd(
  x: SectionCtx,
): { title: string; body: string; footer: string | null; values: string[] } | null {
  const { templatesRead, starter, starterGroup, starterAny, canEdit } = x;
  if (!(templatesRead && canEdit && starter && !starterGroup && !starterAny)) return null;
  const text = starter.texts.en_US ?? Object.values(starter.texts)[0];
  if (!text) return null;
  return {
    title: starter.title,
    body: text.body,
    footer: text.footer,
    values: text.slots.map((s) => pbExample(s.kind, x.data.businessName)),
  };
}

/** Why there is no message yet: the read failed, the one it had is gone, the moment's own is in review, or there is none. */
function messageEmpty(x: SectionCtx) {
  const { tpl, templatesRead, lost, editingTemplateName, starter, usable } = x;
  const none = noMessageWords(Boolean(starter));
  if (tpl || starterToAdd(x)) return null;
  return (
    <div className="pb-empty" data-testid="pb-message-empty">
      {!templatesRead && (
        <FailedRead kind="line" what="your templates" surface="playbooks" testid="pb-templates-failed" />
      )}
      {lost && (
        <p className="pb-empty-line is-warn" data-testid="pb-template-lost">
          {MESSAGE_GONE_WORDS.composer(pbTitle(editingTemplateName))}
        </p>
      )}
      {starterLine(x)}
      {templatesRead && usable.length === 0 && !starter && (
        <p className="pb-empty-line" data-testid="pb-no-template">
          <span>
            {none.lead}{" "}
            <LinkButton {...routeDoor("messages")} data-testid="pb-no-template-open">
              {none.link}
            </LinkButton>
            .
          </span>
        </p>
      )}
    </div>
  );
}

/** What changes a slot: the words typed into it, and what fills it. */
function slotActs(x: SectionCtx, tpl: TemplateDto) {
  const { data, vars, srcOf, textOf, setTyped, setFills } = x;
  const setText = (i: number, v: string) =>
    setTyped((p) => {
      const next = [...(p[tpl.id] || [])];
      next[i] = v;
      return { ...p, [tpl.id]: next };
    });
  const chooseFill = (i: number, kind: string) => {
    const was = srcOf(i);
    setFills((f) => {
      const next = vars.map((_, j) => (f[tpl.id] || PB_NONE)[j] || srcOf(j));
      next[i] = kind;
      return { ...f, [tpl.id]: next };
    });
    // Typing over the business name starts from it.
    if (kind === "text" && was === "business_name" && !textOf(i).trim() && data.businessName)
      setText(i, data.businessName);
  };
  return { setText, chooseFill };
}

/**
 * One slot of the message, in the bubble (parts/slot.tsx): its words where the customer reads them, and, where it may
 * take more than one thing or is typed, the control that changes what fills it. The slot is the template's {{n}}, the
 * nth of its values.
 */
const slotOf = (x: SectionCtx, tpl: TemplateDto) => {
  const { data, vars, choices, labels, SRC, HINTS, srcOf, textOf } = x;
  const { setText, chooseFill } = slotActs(x, tpl);
  return (at: number, text: string) => {
    const found = vars.findIndex((v) => Number(v.position) === at + 1);
    const i = found >= 0 ? found : at;
    const v = vars[i];
    const src = srcOf(i);
    const opts: string[] = choices[i] || PB_TEXT;
    return (
      <CmSlot
        label={labels[i] || `Value ${at + 1}`}
        text={text}
        kind={src}
        offers={opts.map((k) => ({ id: k, label: SRC[k] || k }))}
        onKind={(kind) => chooseFill(i, kind)}
        typed={textOf(i)}
        onTyped={(words) => setText(i, words)}
        placeholder={opts[0] === "business_name" ? data.businessName || "" : v && v.example ? String(v.example) : ""}
        hint={src !== "text" ? HINTS[src] : null}
        testid="pb-fill"
      />
    );
  };
};

/** The message it sends, a word to press: every message that fits the moment, the moment's own first. */
function messagePicker(x: SectionCtx, placeholder: string) {
  const { group, messageChoices, starterGroup, tpl, offered, chooseMessage } = x;
  return (
    <Picker
      label="The message it sends"
      value={group ? group.name : null}
      onValueChange={chooseMessage}
      groups={cmGroups(messageChoices, {
        own: "Written for this moment",
        all: starterGroup ? "Your other messages" : "Your messages",
      })}
      chevron={cmChevron()}
      face={tpl ? (group ? group.title : pbTitle(tpl.name)) : undefined}
      placeholder={placeholder}
      inline
      className={changedCls(x, "message")}
      {...(messageChoices.length > 7 ? { search: cmSearch("Find a message", "No message has those words.") } : {})}
      {...(offered.why ? { note: offered.why } : {})}
      data-testid="pb-template"
    />
  );
}

/** The message it sends and the one language it goes out in, as words to press under the preview. */
function messageCaption(x: SectionCtx) {
  const { usable, starter, tpl, langChoices, chooseLanguage } = x;
  const S = LIFECYCLE_WORDS.compose.sentence;
  const own = !!(tpl && starter && tpl.name === starter.name);
  // The moment's own message, not added yet, says its own caption with this picker in it (starterPreview).
  if (usable.length === 0 || starterToAdd(x)) return null;
  return (
    <p className="cm-msg-cap" data-testid="pb-msg-cap">
      {own ? <Icon name="sparkle" size={12} /> : null}
      {messagePicker(x, "Pick a message")}
      {own ? <span className="cm-msg-cap-dim"> · {S.writtenForYou}</span> : null}
      {tpl ? (
        <>
          <span className="cm-msg-cap-dim"> · </span>
          <Picker
            label="The language it goes out in"
            value={tpl.language}
            onValueChange={chooseLanguage}
            groups={cmGroups(
              langChoices.map((l) => ({ ...l, glyph: <CmLangGlyph status={l.status} />, hint: pbShort(l.id) })),
            )}
            chevron={cmChevron()}
            face={langChoices.find((l) => l.id === tpl.language)?.label ?? pbShort(tpl.language)}
            inline
            note={
              langChoices.length < 2
                ? "A run sends one language to everyone on it. Another is written in Campaigns › Library."
                : "A run sends one language to everyone on it."
            }
            data-testid="pb-lang"
          />
        </>
      ) : null}
    </p>
  );
}

/** The moment's own message, before it is added: its words in the bubble, and its name under it, written for you. */
function starterPreview(x: SectionCtx) {
  const s = starterToAdd(x);
  if (!s) return null;
  const S = LIFECYCLE_WORDS.compose.sentence;
  return (
    <div className="pb-preview" data-testid="pb-preview">
      <CmPreviewFold id="pb-starter-preview" body={s.body} values={s.values} testid="pb-preview-fold">
        <MessagePreview from={x.data.businessName} body={s.body} values={s.values} footer={s.footer} bare />
      </CmPreviewFold>
      <p className="cm-msg-cap" data-testid="pb-starter">
        <Icon name="sparkle" size={12} />
        <b>{s.title}</b>
        <span className="cm-msg-cap-dim"> · {S.writtenForYou}</span>
        {x.usable.length > 0 ? (
          <>
            <span className="cm-msg-cap-dim"> · </span>
            {messagePicker(x, S.another)}
          </>
        ) : null}
      </p>
    </div>
  );
}

/**
 * What it says: the message as a customer reads it, each of its slots the control that changes what fills it (the bubble
 * is the fields), with the channels it goes by walked over its head ("By email · 12 people ‹ ›"); under it the message's
 * name and language. The moment's own message, not added yet, reads the same way: Turn on adds it.
 */
export function messageSection(x: SectionCtx) {
  const { data, tpl, vars, shown, steps, versions, facts, labelled, who, setWho } = x;
  // The step in view, kept inside the walk as the channels it goes by change; with none open, WhatsApp's bubble as ever.
  const at = Math.min(who, Math.max(steps.length - 1, 0));
  const preview = tpl
    ? cmPreviewBy(
        { body: tpl.body_preview, header: tpl.header, footer: pbFooter(tpl), buttons: tpl.buttons ?? null },
        steps.length > 0 ? steps[at].channel : null,
        {
          versions,
          language: tpl.language,
          business: data.businessName,
          address: data.businessAddress,
          facts,
          labelled,
          standIn: cmStandInOf(tpl),
          // An offer's email reads with the offer's foot: why they get it, and the way out (step 4). The moment says what
          // its message is about: the business's news is an offer by email too (decision D2), a visit's is not.
          ...cmOfferFoot(tpl.category, messageAboutOfTrigger(x.trig ? x.trig.id : null)),
        },
      )
    : null;
  return (
    <section className="pb-sec" data-testid="pb-message">
      {messageEmpty(x)}
      {starterPreview(x)}
      {/* No stamp: a playbook knows the hour it runs at, not the instant its next run lands; the line under says when. */}
      {tpl && preview && (
        <div className="pb-preview" data-testid="pb-preview">
          {/* Folded under its first words, open by itself while a slot is still to be typed (it stops the save). The
              message as a person on the channel in view reads it (parts/preview-by.ts); the walk is the channels the
              playbook goes by, since it names no one. */}
          <CmPreviewFold
            id="pb-preview"
            body={preview.body}
            values={shown}
            open={x.missing >= 0}
            testid="pb-preview-fold"
          >
            <MessagePreview
              from={data.businessName}
              values={shown}
              slot={vars.length > 0 ? slotOf(x, tpl) : null}
              bare
              {...preview}
            >
              <PreviewStepper
                people={steps.map((step) => ({ label: step.label, position: step.position }))}
                index={at}
                onStep={setWho}
                words={PREVIEW_WORDS.walk.channels}
              />
            </MessagePreview>
          </CmPreviewFold>
        </div>
      )}
      {messageCaption(x)}
    </section>
  );
}

/**
 * When it first runs (or, for a campaign being changed, next), by the business's clock, as the drawer says its next run
 * (contracts nextRunLabel): "First run today 10:00 AM, New York time". Nothing where nothing runs: a paused campaign, a
 * paused workspace (the foot says that), a moment not yet picked.
 */
export function forecast(x: SectionCtx) {
  const { trig, f, editing, data } = x;
  if (!trig || data.ready?.paused === true || (editing && editing.state !== "running")) return null;
  const S = LIFECYCLE_WORDS.compose.sentence;
  const tz = data.timezone || pageClock().zone();
  const when = nextRunLabel(
    { state: "running", run_hour: Number(f.hour), last_run_for: editing ? editing.last_run_for : null },
    tz,
    new Date(),
    false,
  );
  const city = pageClock().city();
  return (
    <p className="cm-next" data-testid="pb-forecast">
      <Icon name="calendar" size={13} />
      <span>
        {editing ? S.nextRun(S.at(when)) : S.firstRun(S.at(when))}
        {city ? `, ${city} time` : ""}
      </span>
    </p>
  );
}
