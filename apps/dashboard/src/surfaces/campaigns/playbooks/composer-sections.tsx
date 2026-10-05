/**
 * The playbook composer's three sections: who it is for, what it says, and when it runs (moved from
 * legacy/pages/playbook-composer.jsx, decision 0015). Each is a plain function over the composer's model and setters,
 * called from the sheet's body, so the tree is what the one component drew.
 *
 * It reads the way a playbook is: who it is for (the moment, and who that reaches today), what it says (the message as
 * a customer reads it, and what fills each of its slots), and when it runs (one sentence, its numbers chosen in place).
 * Everything else is a press away -- every moment and every message behind their own control, the rules every run keeps
 * behind the shield.
 */
import type { Dispatch, SetStateAction } from "react";
import {
  PREVIEW_WORDS,
  allowanceBeforeSend,
  messageAboutOfTrigger,
  noMessageWords,
  type ConsentChannel,
} from "@chanlytics/contracts";
import type { TemplateDto } from "@/surfaces/inbox/types";
import { navigate } from "../../legacy-verbs";
import { FailedRead } from "../../kit/empty/empty";
import { Icon } from "../../kit/icon/icon";
import { LinkButton } from "../../kit/link-button/link-button";
import { Picker } from "../../kit/picker/picker";
import { PolicyChip } from "../../kit/policy-chip/policy-chip";
import { CM_VIA_WORDS, cmTick } from "../parts/channels";
import { MessagePreview, PreviewStepper } from "../parts/message-preview";
import { CmLangGlyph } from "../parts/picker";
import { cmChevron, cmGroups, cmNumbers, cmSearch } from "../parts/picks";
import { cmOfferFoot, cmPreviewBy } from "../parts/preview-by";
import { CmVia } from "../parts/send-by";
import { CmSlot } from "../parts/slot";
import { CmWho } from "../parts/reach";
import type { Fields, Model } from "./composer-model";
import type { PlaybooksSurface } from "./surface";
import {
  PB_CADENCES,
  PB_CAPS,
  PB_GAPS,
  PB_LIST_CLASSES,
  PB_LIST_GROUPS,
  PB_NONE,
  PB_TEXT,
  pbFooter,
  pbGuardWords,
  pbHour,
  pbHours,
  pbListSub,
  pbShort,
  pbTitle,
  pbWhoWords,
  pbWith,
} from "./words";

/** What a section reads: the model, what the sheet holds, and the ways to change it. */
export interface SectionCtx extends Model {
  data: PlaybooksSurface;
  editingTemplateName: string | null;
  f: Fields;
  canEdit: boolean;
  adding: boolean;
  setHour: Dispatch<SetStateAction<number>>;
  setCap: Dispatch<SetStateAction<number>>;
  setGap: Dispatch<SetStateAction<number>>;
  setCadence: Dispatch<SetStateAction<number>>;
  setListId: Dispatch<SetStateAction<string | null>>;
  setCls: Dispatch<SetStateAction<string>>;
  setChannels: Dispatch<SetStateAction<ConsentChannel[]>>;
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

/**
 * The moment it runs on: a token in the To row's sentence (the kit's Picker), opening every moment with what starts it
 * and who it reaches today. It was a card a whole row tall, its glyph, its name and what starts it said again under the
 * name (C2's round 2: the picker repeated the bubble).
 */
function momentPicker(x: SectionCtx) {
  const { f, trig, momentChoices, chooseMoment } = x;
  return (
    <Picker
      label="The moment it runs on"
      value={f.trigger}
      onValueChange={chooseMoment}
      groups={cmGroups(momentChoices)}
      chevron={cmChevron()}
      face={trig ? trig.label : undefined}
      placeholder="Pick a moment"
      data-testid="pb-moment"
    />
  );
}

/** Which list it runs on: one of People's, or one of the workspace's own, and where there is none, the way to make one. */
function listPicker(x: SectionCtx) {
  const { f, onList, lists, list, setListId } = x;
  return (
    onList &&
    (lists.length ? (
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
        placeholder="Pick a list"
        {...(lists.length > 8 ? { search: cmSearch("Find a list", "No list has those words.") } : {})}
        data-testid="pb-list"
      />
    ) : (
      <p className="pb-warn" data-testid="pb-no-lists">
        Keep a list on People first — by hand, or describe who and it keeps itself current.
      </p>
    ))
  );
}

/** What a playbook on a list sends, and so which row of Autonomy governs it: an offer, or a win-back. */
function classPicker(x: SectionCtx) {
  const { f, onList, setCls } = x;
  return (
    onList && (
      <Picker
        label="What it sends"
        value={f.cls}
        onValueChange={setCls}
        groups={cmGroups(PB_LIST_CLASSES)}
        chevron={cmChevron()}
        data-testid="pb-list-class"
      />
    )
  );
}

/**
 * Who it's for: the moment, the list it runs on, and who that reaches today, on one line -- the count, who it reaches on
 * which channel, and the reasons anybody is held back behind "Who's held back" -- with a thin bar under it.
 */
export function whoSection(x: SectionCtx) {
  const { data, trig, visits, counted, will, pool, of, base, reasons, split, splitBy } = x;
  // The month's emails or texts running out for this moment (a message about a visit is never held, contracts heldByAllowance).
  const allowance = split ? allowanceBeforeSend(split.byChannel, data.month_sent, x.f.trigger, x.purpose) : null;
  return (
    <section className="pb-sec" data-testid="pb-who">
      <span className="pb-sec-k">Who it's for</span>
      {momentPicker(x)}
      {/* Which list it runs on (decision 0009): one of People's, or one of the workspace's own, kept by hand or by a
          rule. A list about whoever is looking is never offered: a run has no one looking. */}
      {listPicker(x)}
      {/* What a playbook on a list sends, and so which row of Autonomy governs it: an offer, or a win-back. */}
      {classPicker(x)}
      {trig && counted && (
        <CmWho
          will={will}
          pool={pool}
          of={of}
          held={base.held}
          reasons={reasons}
          by={splitBy}
          split={split}
          allowance={allowance}
          testid="pb-reach"
        />
      )}
      {visits && data.calendar !== "ok" && (
        <p className="pb-warn" data-testid="pb-calendar">
          A visit moment reads the calendar: connect it in Settings › Business before a run can send.
        </p>
      )}
    </section>
  );
}

/** The message it sends, and the one language it goes out in. */
function messageHead(x: SectionCtx) {
  const { usable, group, messageChoices, starterGroup, tpl, offered, langChoices, chooseMessage, chooseLanguage } = x;
  return (
    usable.length > 0 && (
      <div className="pb-msg-head">
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
          placeholder="Pick a message"
          {...(messageChoices.length > 7 ? { search: cmSearch("Find a message", "No message has those words.") } : {})}
          {...(offered.why ? { note: offered.why } : {})}
          data-testid="pb-template"
        />
        {tpl && (
          <Picker
            label="The language it goes out in"
            value={tpl.language}
            onValueChange={chooseLanguage}
            groups={cmGroups(
              langChoices.map((l) => ({ ...l, glyph: <CmLangGlyph status={l.status} />, hint: pbShort(l.id) })),
            )}
            chevron={cmChevron()}
            face={
              <>
                <CmLangGlyph status={tpl.meta_status || "approved"} /> {pbShort(tpl.language)}
              </>
            }
            note={
              langChoices.length < 2
                ? "A run sends one language to everyone on it. Another is written in Campaigns › Library."
                : "A run sends one language to everyone on it."
            }
            data-testid="pb-lang"
          />
        )}
      </div>
    )
  );
}

/** The moment's own message, written and waiting to be added: in review at WhatsApp, or one press adds it. */
function starterLine(x: SectionCtx) {
  const { templatesRead, starter, starterGroup, starterAny, canEdit, adding, addStarter } = x;
  return (
    templatesRead &&
    starter &&
    !starterGroup && (
      <p className="pb-empty-line" data-testid="pb-starter">
        <Icon name="sparkle" size={12} />
        <span>
          {starterAny ? (
            <>
              <b>{starter.title}</b>, written for this moment,{" "}
              {starterAny.meta_status === "pending"
                ? "is in review at WhatsApp — it appears here once approved, usually within minutes."
                : `is ${starterAny.meta_status} at WhatsApp — see Campaigns › Library.`}
            </>
          ) : (
            <>
              <b>{starter.title}</b> is written for this moment.{" "}
              {canEdit ? (
                <LinkButton disabled={adding} onClick={addStarter} data-testid="pb-add-starter">
                  {adding ? "Adding…" : "Add it — WhatsApp reviews it, usually within minutes"}
                </LinkButton>
              ) : null}
            </>
          )}
        </span>
      </p>
    )
  );
}

/** Why there is no message yet: the read failed, the one it had is gone, the moment's own is not added, or there is none. */
function messageEmpty(x: SectionCtx) {
  const { tpl, templatesRead, lost, editingTemplateName, starter, usable } = x;
  const none = noMessageWords(Boolean(starter));
  return (
    !tpl && (
      <div className="pb-empty" data-testid="pb-message-empty">
        {!templatesRead && (
          <FailedRead kind="line" what="your templates" surface="playbooks" testid="pb-templates-failed" />
        )}
        {lost && (
          <p className="pb-empty-line is-warn" data-testid="pb-template-lost">
            Its message, {pbTitle(editingTemplateName)}, is not one it can send any more — WhatsApp no longer approves
            it. Pick another to save a change.
          </p>
        )}
        {starterLine(x)}
        {templatesRead && usable.length === 0 && (
          <p className="pb-empty-line" data-testid="pb-no-template">
            {none.lead}{" "}
            <LinkButton onClick={() => navigate("messages")} data-testid="pb-no-template-open">
              {none.link}
            </LinkButton>
            .
          </p>
        )}
      </div>
    )
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

/**
 * What it says: the message and its language, and the message as a customer reads it, each of its slots the control
 * that changes what fills it (the bubble is the fields; the table of slots under it said every value again).
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
          // An offer's email reads with the offer's foot: why they get it, and the way out (step 4). The moment says what
          // its message is about: the business's news is an offer by email too (decision D2), a visit's is not.
          ...cmOfferFoot(tpl.category, messageAboutOfTrigger(x.trig ? x.trig.id : null)),
        },
      )
    : null;
  return (
    <section className="pb-sec" data-testid="pb-message">
      <span className="pb-sec-k">What it says</span>
      {messageHead(x)}
      {messageEmpty(x)}
      {/* No stamp: a playbook knows the hour it runs at, not the instant its
          next run lands, and the sentence below says the hour in words. */}
      {tpl && preview && (
        <div className="pb-preview" data-testid="pb-preview">
          {/* The message as a person on the channel in view reads it (parts/preview-by.ts); the walk is the channels the
              playbook goes by, since it names no one. */}
          <MessagePreview
            from={data.businessName}
            values={shown}
            slot={vars.length > 0 ? slotOf(x, tpl) : null}
            {...preview}
          >
            <PreviewStepper
              people={steps.map((step) => ({ label: step.label, position: step.position }))}
              index={at}
              onStep={setWho}
              words={PREVIEW_WORDS.walk.channels}
            />
          </MessagePreview>
        </div>
      )}
    </section>
  );
}

/**
 * Send by: a switch for each channel it may go by (parts/send-by.tsx), each closed with its reason where the workspace
 * cannot send on it or the message cannot go by it. What is on is worked out in the model; pressing one starts from what is
 * on, so a channel that was only ticked and never open is let go.
 */
export function viaSection(x: SectionCtx) {
  const { ticks, on, setChannels } = x;
  return (
    <section className="pb-sec" data-testid="pb-via-sec">
      <span className="pb-sec-k">{CM_VIA_WORDS.label}</span>
      <CmVia ticks={ticks} onTick={(channel, next) => setChannels(cmTick(on, channel, next))} testid="pb-via" />
    </section>
  );
}

/** When it runs, said as one sentence with its numbers chosen in place. */
function whenSentence(x: SectionCtx) {
  const { f, trig, visits, monthly, city, setHour, setCap, setGap, setCadence } = x;
  const repeat = monthly ? f.cadence : f.gap;
  return (
    <p className="pb-when">
      Every day at{" "}
      <Picker
        label="The hour it runs at"
        value={String(f.hour)}
        onValueChange={(h) => setHour(Number(h))}
        groups={cmNumbers(pbHours().map((h) => ({ v: h, t: pbHour(h) })))}
        chevron={cmChevron()}
        data-testid="pb-hour"
      />
      {city ? ` ${city} time` : ""}
      {visits ? (
        <>
          , to{" "}
          {f.trigger === "visit_tomorrow"
            ? "everyone with a visit the next day"
            : "everyone who came in the day before"}{" "}
          — one message per visit.
        </>
      ) : (
        <>
          , up to{" "}
          <Picker
            label="The most one run sends"
            value={String(f.cap)}
            onValueChange={(n) => setCap(Number(n))}
            groups={cmNumbers(pbWith(PB_CAPS, Number(f.cap)).map((n) => ({ v: n, t: String(n) })))}
            chevron={cmChevron()}
            data-testid="pb-cap"
          />{" "}
          {Number(f.cap) === 1 ? "person" : "people"} a run.{" "}
          {/* A follow-up is owed once per proposal (0006): there is no gap to choose. */}
          {trig && trig.kind === "deal" ? (
            <>One message per proposal.</>
          ) : (
            <>
              No one hears it more than once every{" "}
              <Picker
                label={
                  monthly ? "How often the same person hears it" : "The days before the same person hears it again"
                }
                value={String(repeat)}
                onValueChange={(n) => (monthly ? setCadence : setGap)(Number(n))}
                groups={cmNumbers(
                  pbWith(monthly ? PB_CADENCES : PB_GAPS, Number(repeat)).map((n) => ({ v: n, t: `${n} days` })),
                )}
                chevron={cmChevron()}
                data-testid="pb-gap"
              />
              .
            </>
          )}
        </>
      )}
    </p>
  );
}

/**
 * The row of Autonomy it runs under, and the guardrails every run keeps: who it reaches, said where it is read and not only
 * in the shield's tooltip (which a finger never opens), for the channels it goes by.
 */
export function underLine(x: SectionCtx) {
  const { trig, runsUnder, kept, purpose } = x;
  const about = messageAboutOfTrigger(trig ? trig.id : null);
  const guard = pbGuardWords(trig ? trig.kind : "", kept, purpose, about);
  return (
    <div className="pb-rules-line">
      {runsUnder && (
        <span className="pb-runs-under" data-testid="pb-runs-under">
          <span>Runs under</span>
          <PolicyChip cls={runsUnder} />
        </span>
      )}
      <span
        className="pb-guard"
        // eslint-disable-next-line jsx-a11y-x/no-noninteractive-tabindex -- as the JSX drew it (decision 0015)
        tabIndex={0}
        data-tip={guard}
        aria-description={guard}
        data-testid="pb-guard"
      >
        <Icon name="shield" size={12} /> Guardrails
      </span>
      <span className="pb-guard-words" data-testid="pb-guard-who">
        {pbWhoWords(kept, purpose, about)}
      </span>
    </div>
  );
}

/** When it runs: one sentence with its numbers chosen in place, the row of Autonomy it runs under, and the guardrails. */
export function clockSection(x: SectionCtx) {
  return (
    <section className="pb-sec" data-testid="pb-clock">
      <span className="pb-sec-k">When it runs</span>
      {whenSentence(x)}
      {underLine(x)}
    </section>
  );
}

/** Under Glass, the sentence alone: the rules line is the row under it (Under), and the word is the row's. */
export function whenOnly(x: SectionCtx) {
  return (
    <section className="pb-sec" data-testid="pb-clock">
      {whenSentence(x)}
    </section>
  );
}
