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
import type { TemplateDto } from "@/legacy-bridge/surfaces/inbox";
import { policyChipPart } from "../../legacy-parts";
import { navigate } from "../../legacy-verbs";
import { FailedRead } from "../../kit/empty/empty";
import { Icon } from "../../kit/icon/icon";
import { MessagePreview } from "../parts/message-preview";
import { CmPicker, LanguagePicker } from "../parts/picker";
import { CmReach } from "../parts/reach";
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
  PbTok,
  pbFooter,
  pbGuardWords,
  pbHour,
  pbHours,
  pbIcon,
  pbListSub,
  pbShort,
  pbSpell,
  pbTitle,
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
  setFills: Dispatch<SetStateAction<Fields["fills"]>>;
  setTyped: Dispatch<SetStateAction<Fields["typed"]>>;
  chooseMoment: (id: string) => void;
  chooseMessage: (id: string) => void;
  chooseLanguage: (lang: string) => void;
  addStarter: () => Promise<void>;
}

/** The moment it runs on: a picker of every moment, with who each reaches today. */
function momentPicker(x: SectionCtx) {
  const { f, trig, momentChoices, chooseMoment } = x;
  return (
    <CmPicker
      value={f.trigger}
      choices={momentChoices}
      onPick={chooseMoment}
      label="The moment it runs on"
      search={false}
      fit="trigger"
      triggerClass="pb-pick"
      face={
        trig ? (
          <>
            <span className="pb-pick-mark" aria-hidden="true">
              <Icon name={pbIcon(trig.id)} size={15} />
            </span>
            <span className="pb-pick-text">
              <span className="pb-pick-title">{trig.label}</span>
              <span className="pb-pick-sub">{trig.hint}</span>
            </span>
          </>
        ) : (
          <span className="pb-pick-text">
            <span className="pb-pick-title is-empty">Pick a moment</span>
          </span>
        )
      }
      testid="pb-moment"
    />
  );
}

/** Which list it runs on: one of People's, or one of the workspace's own, and where there is none, the way to make one. */
function listPicker(x: SectionCtx) {
  const { f, onList, lists, list, setListId } = x;
  return (
    onList &&
    (lists.length ? (
      <CmPicker
        value={f.listId}
        choices={lists.map((l) => ({
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
        }))}
        groups={PB_LIST_GROUPS}
        onPick={setListId}
        label="The list it runs on"
        search={lists.length > 8}
        fit="trigger"
        triggerClass="pb-pick"
        face={
          list ? (
            <>
              <span className="pb-pick-mark" aria-hidden="true">
                <Icon name={list.builtin || list.smart ? "sparkle" : "filter"} size={15} />
              </span>
              <span className="pb-pick-text">
                <span className="pb-pick-title">{list.name}</span>
                <span className="pb-pick-sub">{pbListSub(list)}</span>
              </span>
            </>
          ) : (
            <span className="pb-pick-text">
              <span className="pb-pick-title is-empty">Pick a list</span>
            </span>
          )
        }
        testid="pb-list"
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
      <CmPicker
        value={f.cls}
        choices={PB_LIST_CLASSES}
        onPick={setCls}
        label="What it sends"
        fit="trigger"
        triggerClass="pb-pick"
        face={
          <span className="pb-pick-text">
            <span className="pb-pick-title">
              {(PB_LIST_CLASSES.find((c) => c.id === f.cls) || PB_LIST_CLASSES[0]).label}
            </span>
            <span className="pb-pick-sub">
              {(PB_LIST_CLASSES.find((c) => c.id === f.cls) || PB_LIST_CLASSES[0]).sub}
            </span>
          </span>
        }
        testid="pb-list-class"
      />
    )
  );
}

/** Who it's for: the moment, the list it runs on, and who that reaches today. */
export function whoSection(x: SectionCtx) {
  const { data, trig, visits, counted, will, pool, of, base, reasons } = x;
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
        <CmReach will={will} pool={pool} of={of} held={base.held} reasons={reasons} size="sm" testid="pb-reach" />
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
  const {
    usable,
    group,
    messageChoices,
    groups,
    starter,
    starterGroup,
    tpl,
    offered,
    langChoices,
    chooseMessage,
    chooseLanguage,
  } = x;
  return (
    usable.length > 0 && (
      <div className="pb-msg-head">
        <CmPicker
          value={group ? group.name : null}
          choices={messageChoices}
          groups={{ own: "Written for this moment", all: starterGroup ? "Your other messages" : "Your messages" }}
          onPick={chooseMessage}
          label="The message it sends"
          search={messageChoices.length > 7}
          searchWords={{ placeholder: "Search messages", empty: (q) => <>No message called “{q}”</> }}
          note={offered.why}
          fit="trigger"
          triggerClass="pb-pick pb-pick-msg"
          face={
            tpl ? (
              <span className="pb-pick-text">
                <span className="pb-pick-title">{group ? group.title : pbTitle(tpl.name)}</span>
                <span className="pb-pick-sub">
                  {starter && tpl.name === starter.name ? "Written for this moment" : "Your message"}
                </span>
              </span>
            ) : (
              <span className="pb-pick-text">
                <span className="pb-pick-title is-empty">Pick a message</span>
                <span className="pb-pick-sub">
                  {groups.length === 1
                    ? "One approved message fits this moment"
                    : `${pbSpell(Math.min(groups.length, 12), true)} approved messages fit this moment`}
                </span>
              </span>
            )
          }
          testid="pb-template"
        />
        {tpl && (
          <LanguagePicker
            value={tpl.language}
            choices={langChoices}
            onPick={chooseLanguage}
            status={tpl.meta_status || "approved"}
            tag={pbShort(tpl.language)}
            label="The language it goes out in"
            search={false}
            note={
              langChoices.length < 2
                ? "A run sends one language to everyone on it. Another is written in Campaigns › Templates."
                : "A run sends one language to everyone on it."
            }
            testid="pb-lang"
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
                : `is ${starterAny.meta_status} at WhatsApp — see Campaigns › Templates.`}
            </>
          ) : (
            <>
              <b>{starter.title}</b> is written for this moment.{" "}
              {canEdit ? (
                <button
                  type="button"
                  className="cl-bucket-link"
                  disabled={adding}
                  onClick={addStarter}
                  data-testid="pb-add-starter"
                >
                  {adding ? "Adding…" : "Add it — WhatsApp reviews it, usually within minutes"}
                </button>
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
            No approved message {starter ? "for this moment " : ""}yet — write one, or sync yours from WhatsApp Manager,
            in{" "}
            <button
              type="button"
              className="cl-bucket-link"
              onClick={() => navigate("messages")}
              data-testid="pb-no-template-open"
            >
              Templates
            </button>
            .
          </p>
        )}
      </div>
    )
  );
}

interface FillIn {
  x: SectionCtx;
  v: Model["vars"][number];
  i: number;
  setText: (i: number, v: string) => void;
  chooseFill: (i: number, kind: string) => void;
}

/** One slot: its label, what fills it (typed, or a source), and the choice of what may. */
function fillRow({ x, v, i, setText, chooseFill }: FillIn) {
  const { data, choices, labels, SRC, HINTS, srcOf, textOf } = x;
  const src = srcOf(i);
  const opts: string[] = choices[i] || PB_TEXT;
  const hint = src !== "text" ? HINTS[src] : null;
  return (
    <div
      key={v.position || i}
      className={`pb-fill${src === "text" ? " is-typed" : ""}`}
      data-kind={src}
      data-testid="pb-fill"
    >
      <span className="pb-fill-key" id={`pb-fill-${i}`}>
        {labels[i]}
      </span>
      {src === "text" ? (
        <input
          className="pb-fill-input"
          value={textOf(i)}
          placeholder={opts[0] === "business_name" ? data.businessName || "" : v.example ? String(v.example) : ""}
          maxLength={1024}
          onChange={(e) => setText(i, e.target.value)}
          aria-labelledby={`pb-fill-${i}`}
          data-testid="pb-fill-input"
        />
      ) : (
        <span className="pb-fill-val" data-tip={hint || undefined}>
          <span className="pb-fill-words">
            {src === "business_name" && data.businessName ? data.businessName : SRC[src] || src}
          </span>
          {hint && <span className="pb-fill-hint">{hint}</span>}
        </span>
      )}
      {opts.length > 1 && (
        <span className="pb-fill-src" data-tip="What fills it">
          <Icon name={src === "text" ? "pencil" : "chevrons"} size={12} />
          <select
            value={src}
            onChange={(e) => chooseFill(i, e.target.value)}
            aria-label={`What fills ${labels[i]}`}
            data-testid="pb-fill-source"
          >
            {opts.map((k) => (
              <option key={k} value={k}>
                {SRC[k] || k}
              </option>
            ))}
          </select>
        </span>
      )}
    </div>
  );
}

/** What fills each slot of the message: typed words, or a source a run fills per person. */
function fillsBlock(x: SectionCtx, tpl: TemplateDto) {
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
  return (
    <div className="pb-fills" data-testid="pb-vars">
      {vars.map((v, i) => fillRow({ x, v, i, setText, chooseFill }))}
    </div>
  );
}

/** What it says: the message and its language, the message as a customer reads it, and what fills each of its slots. */
export function messageSection(x: SectionCtx) {
  const { data, tpl, vars, shown } = x;
  return (
    <section className="pb-sec" data-testid="pb-message">
      <span className="pb-sec-k">What it says</span>
      {messageHead(x)}
      {messageEmpty(x)}
      {/* No stamp: a playbook knows the hour it runs at, not the instant its
          next run lands, and the sentence below says the hour in words. */}
      {tpl && (
        <div className="pb-preview" data-testid="pb-preview">
          <MessagePreview
            from={data.businessName}
            body={tpl.body_preview}
            values={shown}
            header={tpl.header}
            footer={pbFooter(tpl)}
            buttons={tpl.buttons}
          />
        </div>
      )}
      {tpl && vars.length > 0 && fillsBlock(x, tpl)}
    </section>
  );
}

/** When it runs: one sentence with its numbers chosen in place, the row of Autonomy it runs under, and the guardrails. */
export function clockSection(x: SectionCtx) {
  const { f, trig, visits, monthly, city, runsUnder, setHour, setCap, setGap, setCadence } = x;
  const PolicyChip = policyChipPart();
  const repeat = monthly ? f.cadence : f.gap;
  return (
    <section className="pb-sec" data-testid="pb-clock">
      <span className="pb-sec-k">When it runs</span>
      <p className="pb-when">
        Every day at{" "}
        <PbTok
          value={f.hour}
          options={pbHours().map((h) => ({ v: h, t: pbHour(h) }))}
          onChange={setHour}
          label="The hour it runs at"
          testid="pb-hour"
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
            <PbTok
              value={f.cap}
              options={pbWith(PB_CAPS, Number(f.cap)).map((n) => ({ v: n, t: String(n) }))}
              onChange={setCap}
              label="The most one run sends"
              testid="pb-cap"
            />{" "}
            {Number(f.cap) === 1 ? "person" : "people"} a run.{" "}
            {/* A follow-up is owed once per proposal (0006): there is no gap to choose. */}
            {trig && trig.kind === "deal" ? (
              <>One message per proposal.</>
            ) : (
              <>
                No one hears it more than once every{" "}
                <PbTok
                  value={repeat}
                  options={pbWith(monthly ? PB_CADENCES : PB_GAPS, Number(repeat)).map((n) => ({
                    v: n,
                    t: `${n} days`,
                  }))}
                  onChange={monthly ? setCadence : setGap}
                  label={
                    monthly ? "How often the same person hears it" : "The days before the same person hears it again"
                  }
                  testid="pb-gap"
                />
                .
              </>
            )}
          </>
        )}
      </p>
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
          data-tip={pbGuardWords(trig ? trig.kind : "")}
          aria-description={pbGuardWords(trig ? trig.kind : "")}
          data-testid="pb-guard"
        >
          <Icon name="shield" size={12} /> Guardrails
        </span>
      </div>
    </section>
  );
}
