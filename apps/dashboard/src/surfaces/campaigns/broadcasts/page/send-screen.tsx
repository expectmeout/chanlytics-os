/**
 * The send screen: who, what and when side by side, and the send alone at the foot (moved from
 * legacy/pages/broadcasts.jsx, decision 0015). Plain functions that return the elements they draw, called from
 * BroadcastsReal with the page's state.
 */
import type { ParamSourceKind } from "@chanlytics/contracts";
import { FailedRead } from "../../../kit/empty/empty";
import { Icon } from "../../../kit/icon/icon";
import { confirmPart, unsavedAskPart } from "../../../legacy-parts";
import { gate, gateTitle, navigate } from "../../../legacy-verbs";
import { CmHead } from "../../parts/head";
import { MessagePreview, PreviewStepper } from "../../parts/message-preview";
import { TemplateChips } from "../../parts/template-chips";
import { TemplateComposer } from "../../templates/composer";
import { broadcasts } from "../verbs";
import { BcWhenBox } from "../when";
import { BcAudience } from "./audience";
import type { BcV } from "./types";
import { BC_TEXT, bcFooter, bcKey, bcLangWords, bcTitle } from "./words";

// Who: the lists as chips with the count this message reaches on each, the people behind the count, and why anyone
// on it is held back.
function bcColWho(v: BcV) {
  const {
    audiences,
    active,
    sizeOf,
    setAud,
    data,
    sample,
    people,
    who,
    setWho,
    yesWords,
    purpose,
    overLimit,
    number,
    activeCount,
    canSend,
    noNumber,
    yesDoor,
  } = v;
  return (
    <div className="bc-col" data-testid="bc-col-who">
      <span className="bc-col-label">Who</span>
      <div className="bc-chips" style={{ flexWrap: "wrap" }}>
        {audiences.map((a) => (
          <button
            key={bcKey(a)}
            className={"bc-chip" + (active && bcKey(active) === bcKey(a) ? " active" : "")}
            onClick={() => setAud(bcKey(a))}
            title={a.hint}
            data-testid="bc-audience"
          >
            {a.label} <span className="bc-chip-count tabular">{sizeOf(a)}</span>
          </button>
        ))}
        {data.listsRead === false && (
          <FailedRead
            kind="line"
            what="your saved lists"
            body="People's lists are current; the lists you made are missing until they read."
            surface="broadcasts"
            testid="bc-lists-failed"
          />
        )}
      </div>
      <BcAudience sample={sample} people={people} who={who} onWho={setWho} />
      <div className="bc-meta">
        <Icon name="shield" size={11} />
        <span>
          {active ? yesWords : "Pick who this goes to"}
          {" · "}people who asked to stop, have no number, or are mid-thread with a person are held back at the wire
          {data.chunk ? ` · sent ${data.chunk} at a time` : ""}
        </span>
      </div>
      {/* Said once, here, where an offer is picked: why a customer who only ever
                texted is not in an offer's count. The wire refuses per customer
                (sms_carries_no_promotions); the page states the rule. */}
      {purpose === "marketing" && data.offersNote && (
        <div className="bc-excl-hint" data-testid="bc-offers-note">
          {data.offersNote}
        </div>
      )}
      {/* Who of these already heard from a run this week: a send by hand is not held back by the week a playbook
                waits, so the owner is told here, before it goes (contracts heardWords). */}
      {active && sample && sample.heard > 0 && (
        <div className="bc-excl-hint" data-testid="bc-heard">
          {broadcasts.heardWords(sample.heard)}
        </div>
      )}
      {overLimit && active && number && (
        <div className="bc-excl-hint" data-testid="bc-over-limit">
          This number can start up to {number.health.limitPerDay?.toLocaleString()} new conversations a day; “
          {active.label}” is {activeCount.toLocaleString()}. Send to a smaller list or split it.
        </div>
      )}
      {canSend && active && activeCount === 0 && (
        <div className="bc-excl-hint" data-testid="bc-nobody">
          {noNumber ? (
            noNumber
          ) : purpose === "marketing" ? (
            <>
              Nobody on “{active.label}” has said yes to offers yet — that is a separate answer from saying yes to
              messages. Record it under “Offers and news” on their profile{yesDoor}.
            </>
          ) : (
            <>
              Nobody on “{active.label}” has said yes to messages yet. Record it on their profile{yesDoor}.
            </>
          )}
        </div>
      )}
    </div>
  );
}

// Each slot on its line: its label, what fills it (typed, or said in words), and the choice where it has one.
function bcSlotFills({ tpl, vars, srcOf, choices, HINTS, labels, typed, data, setTyped, SRC, chooseSource }: BcV) {
  return (
    tpl &&
    vars.length > 0 && (
      <div className="pb-fills" data-testid="bc-vars">
        {vars.map((v, i) => {
          const src = srcOf(i);
          const c = choices[i] || BC_TEXT;
          const hint = src !== "text" ? HINTS[src] : null;
          return (
            <div
              key={v.position || i}
              className={`pb-fill${src === "text" ? " is-typed" : ""}`}
              data-kind={src}
              data-testid="bc-var"
            >
              <span className="pb-fill-key" id={`bc-var-${i}`}>
                {labels[i]}
              </span>
              {src === "text" ? (
                <input
                  className="pb-fill-input"
                  value={typed[i]}
                  placeholder={c[0] === "business_name" ? data.businessName || "" : v.example ? String(v.example) : ""}
                  maxLength={1024}
                  onChange={(e) => setTyped(i, e.target.value)}
                  aria-labelledby={`bc-var-${i}`}
                  data-testid="bc-var-input"
                />
              ) : (
                <span className="pb-fill-val" data-tip={hint || undefined}>
                  <span className="pb-fill-words">
                    {src === "business_name" && data.businessName ? data.businessName : SRC[src] || src}
                  </span>
                  {hint && <span className="pb-fill-hint">{hint}</span>}
                </span>
              )}
              {c.length > 1 && (
                <span className="pb-fill-src" data-tip="What fills it">
                  <Icon name={src === "text" ? "pencil" : "chevrons"} size={12} />
                  <select
                    value={src}
                    onChange={(e) => chooseSource(i, e.target.value as ParamSourceKind)}
                    aria-label={`What fills ${labels[i]}`}
                    data-testid="bc-var-source"
                  >
                    {c.map((k) => (
                      <option key={k} value={k}>
                        {SRC[k] || k}
                      </option>
                    ))}
                  </select>
                </span>
              )}
            </div>
          );
        })}
      </div>
    )
  );
}

// What: the messages as chips (or why there are none), each slot and what fills it, and the message as this person
// reads it.
function bcColWhat(v: BcV) {
  const {
    templatesRead,
    templates,
    starterPending,
    addingStarters,
    addStarters,
    tplId,
    setTplId,
    setComposing,
    offered,
    tpl,
    data,
    forPerson,
    goesAt,
    person,
    people,
    sample,
    who,
    setWho,
    personNote,
    noName,
  } = v;
  return (
    <div className="bc-col bc-col-what" data-testid="bc-col-what">
      <span className="bc-col-label">What</span>
      <div className="bc-chips" style={{ flexWrap: "wrap" }}>
        {!templatesRead && (
          <FailedRead kind="line" what="your templates" surface="broadcasts" testid="bc-templates-failed" />
        )}
        {templatesRead && templates.length === 0 && (
          <span className="bc-excl-hint" data-testid="bc-no-template">
            {starterPending > 0 ? (
              `Your starter templates are in review at WhatsApp (${starterPending}) — they appear here once approved, usually within minutes.`
            ) : (
              <>
                No approved template yet — add the starter set, write one here, or sync yours from WhatsApp Manager in{" "}
                <button
                  className="cl-bucket-link"
                  onClick={() => navigate("messages")}
                  data-testid="bc-no-template-open"
                >
                  Templates
                </button>
                .
              </>
            )}
          </span>
        )}
        {templatesRead && templates.length === 0 && starterPending === 0 && (
          <button
            className="bc-chip"
            disabled={addingStarters}
            onClick={addStarters}
            data-testid="bc-add-starters"
            {...gate("approve", "add the starter set")}
          >
            <Icon name="sparkle" size={10} /> {addingStarters ? "Adding…" : "Add the starter set"}
          </button>
        )}
        <TemplateChips templates={templates} value={tplId} onPick={setTplId} testid="bc-template" />
        <button
          className="bc-chip"
          onClick={() => setComposing((c) => !c)}
          data-testid="bc-new-template"
          {...gate("approve", "write a template")}
        >
          <Icon name="plus" size={10} /> New template
        </button>
      </div>
      {offered.why && (
        <div className="bc-excl-hint warn" data-testid="bc-blocked">
          {offered.why}
        </div>
      )}
      {/* Each slot on one line, as on a playbook: what it is, what fills it, and
                a choice only where it has one. */}
      {bcSlotFills(v)}
      {tpl && (
        <div className="bc-preview-wrap" data-testid="bc-preview">
          <MessagePreview
            from={data.businessName}
            body={tpl.body_preview}
            values={forPerson}
            header={tpl.header}
            footer={bcFooter(tpl)}
            buttons={tpl.buttons}
            at={goesAt}
            held={person ? person.refusal : null}
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

// When: the time box by the business's clock, what that time means, and the number it goes from.
function bcColWhen({ whenAt, maxDays, setWhenAt, whenNote, number }: BcV) {
  return (
    <div className="bc-col" data-testid="bc-col-when">
      <span className="bc-col-label">When</span>
      <BcWhenBox at={whenAt} maxDays={maxDays} onChange={setWhenAt} />
      <div
        id="bc-when-note"
        className={`bc-excl-hint${whenNote.tone === "warn" ? " bc-when-note-warn" : ""}`}
        data-testid="bc-when-note"
      >
        {whenNote.words}
      </div>
      {number && (
        <div className={`bc-number bc-number-${number.health.tone}`} data-testid="bc-number">
          <Icon name="chat" size={11} />
          <span>
            {number.present
              ? `WhatsApp ${number.display || ""} · ${number.health.label}`
              : "No WhatsApp number connected — connect one in Settings › Connections."}
          </span>
        </div>
      )}
      {number && number.present && !number.health.canSend && (
        <div className="bc-excl-hint" data-testid="bc-number-refusal">
          {number.health.refusal}
        </div>
      )}
    </div>
  );
}

// The send screen: who, what and when side by side, and the send alone at the foot.
export function bcComposer(v: BcV) {
  const Confirm = confirmPart();
  const UnsavedAsk = unsavedAskPart();
  const {
    work,
    composing,
    data,
    setComposing,
    flash,
    name,
    setName,
    canSend,
    armed,
    ready,
    whenNote,
    submit,
    setArmed,
    active,
    activeCount,
    tpl,
    busy,
  } = v;
  return (
    <section className="bc-composer bc-send" data-testid="bc-composer">
      {/* The one screen in Campaigns that cannot be undone, opened on its own:
            who, what and when at once, with the people named rather than counted,
            and the send alone at the foot. */}
      {/* The three columns say who, what and when; the sentence that said so over them went (23 Sep). */}
      <CmHead
        title="New broadcast"
        right={
          work.asking ? (
            <UnsavedAsk onYes={work.discard} onNo={work.stay} testid="bc-leave" />
          ) : (
            <button className="btn btn-ghost" onClick={work.leave} data-testid="bc-compose-close">
              Cancel
            </button>
          )
        }
      />
      {composing && (
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
      )}
      <div className="bc-cols">
        {bcColWho(v)}

        {bcColWhat(v)}

        {bcColWhen(v)}
      </div>

      <div className="bc-foot">
        <input
          className="bc-subject"
          type="text"
          placeholder="Name this broadcast (optional)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
        />
        {/* Stop, Skip and Cancel stay with the roles that may press them; the page says why once, in the gate's words. */}
        {!canSend && (
          <div className="bc-excl-hint" data-testid="bc-role">
            {gateTitle("approve", "stop or cancel a broadcast")}
          </div>
        )}
        <span className="bc-actions-spacer" />
        <div className="bc-actions">
          {/* Schedule stays one press: a scheduled run is cancelled from the row above,
                and nothing has left. Send now does not -- it is the only act on this
                surface that cannot be taken back, and it was the only one that was not
                armed, while Stop, Skip and both Deletes each ask first. */}
          {!armed && (
            <button
              className="btn bc-send-later"
              disabled={!ready || !whenNote.ok}
              onClick={() => submit(true)}
              {...gate("approve", "schedule a broadcast")}
            >
              Schedule it
            </button>
          )}
          {!armed && (
            <button
              className="btn btn-primary bc-send-now"
              disabled={!ready}
              onClick={() => setArmed(true)}
              data-testid="bc-send"
              {...gate("approve", "send a broadcast")}
            >
              <Icon name="send" size={13} /> {active && activeCount > 0 ? `Send to ${activeCount} now` : "Send now"}
            </button>
          )}
          {armed && tpl && active && (
            <Confirm
              question={`Send “${bcTitle(tpl.name)}”${bcLangWords(tpl)} to ${activeCount} ${activeCount === 1 ? "person" : "people"} on “${active.label}”?`}
              detail={`It goes out now${data.chunk ? `, ${data.chunk} at a time` : ""}. A message already delivered cannot be taken back.`}
              yes="Yes, send it"
              busy={busy}
              onYes={() => submit(false)}
              onNo={() => setArmed(false)}
              testid="bc-send"
            />
          )}
        </div>
      </div>
    </section>
  );
}
