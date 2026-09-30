/**
 * Campaigns › Playbooks: the composer a playbook is made and edited in (moved from legacy/pages/playbook-composer.jsx,
 * decision 0015; Reach out Part 2.5). The model it reads is composer-model.ts, its three sections composer-sections.tsx
 * and its verbs composer-acts.ts; this holds the sheet and every hook, in the order they were.
 *
 * The composer: a new playbook, or one being changed, in a sheet beside the page (RecordSheet). The moments stay where
 * they were behind it: it was a panel over the grid that pushed the cards down and took the unset moments away while
 * it was open, so opening it moved the whole page.
 *
 * It reads the way a playbook is: who it is for (the moment, and who that reaches today), what it says (the message as
 * a customer reads it, and what fills each of its slots), and when it runs (one sentence, its numbers chosen in place).
 * Everything else is a press away -- every moment and every message behind their own control, the rules every run keeps
 * behind the shield.
 *
 * A slot takes only what keeps its message true (contracts slotChoices): a first name is each person's own and a visit's
 * time each visit's, so neither is a choice; the business name and the booking link may be typed over; a slot on a
 * message written elsewhere may be anything, its guess first. Each slot had a free choice of all six, so a first name
 * could be set to the booking link and a run greeted everyone "Hi your booking link". A message one of whose slots
 * nothing can fill here -- a visit's reminder, on a list -- is not offered at all.
 *
 * Checked here the way the route checks it -- a message chosen, every slot filled -- so an enabled Start is a Start that
 * succeeds unless the server knows something newer (a template no longer approved, a booking link gone).
 */
import { useMemo, useState } from "react";
import { recordSheetPart, tabDraft, unsavedAskPart, useLegacyUnsavedWork } from "../../legacy-parts";
import { canDo } from "../../legacy-verbs";
import { Icon } from "../../kit/icon/icon";
import { useSurface } from "../../use-surface";
import { composerActs } from "./composer-acts";
import { composerModel, composerOffered, composerOpened } from "./composer-model";
import type { Fields } from "./composer-model";
import { clockSection, messageSection, whoSection } from "./composer-sections";
import type { SectionCtx } from "./composer-sections";
import type { PlaybookCardVM, PlaybooksSurface } from "./surface";

interface ComposerProps {
  data: PlaybooksSurface;
  editing: PlaybookCardVM | null;
  initialTrigger?: string | null;
  onDone: (d: { name?: string }, changed: boolean) => void;
  onCancel: () => void;
}

/** The sheet's foot: what stops Start, Cancel, and Start; with something changed, Cancel asks once first (UnsavedAsk). */
function sheetFoot(p: {
  x: SectionCtx;
  work: ReturnType<typeof useLegacyUnsavedWork>;
  editing: PlaybookCardVM | null;
  busy: boolean;
  error: string | null;
  save: () => Promise<void>;
}) {
  const { x, work, editing, busy, error, save } = p;
  const { say, ready } = x;
  const UnsavedAsk = unsavedAskPart();
  return (
    <div className="pb-foot">
      {/* Cancel, and Escape, with something changed: the one question first (UnsavedAsk), where the buttons were. */}
      {work.asking ? (
        <UnsavedAsk onYes={work.discard} onNo={work.stay} what="saved" testid="pb-leave" />
      ) : (
        <>
          <span
            className="pb-foot-say"
            data-tone={say ? say.tone : undefined}
            role={error ? "alert" : undefined}
            data-testid={error ? "pb-error" : "pb-foot-say"}
          >
            {say ? say.t : null}
          </span>
          <button type="button" className="btn" onClick={work.leave} data-testid="pb-cancel">
            Cancel
          </button>
          <button type="button" className="btn btn-primary" disabled={!ready} onClick={save} data-testid="pb-save">
            {busy ? "Saving…" : editing ? "Save changes" : "Start it"}
          </button>
        </>
      )}
    </div>
  );
}

/** The sheet's body: the three sections, and what stops a run from sending from the number. */
function sheetBody(x: SectionCtx) {
  const { data } = x;
  return (
    <div className="pb-compose">
      {whoSection(x)}
      {messageSection(x)}
      {clockSection(x)}
      {data.number && data.number.present && !data.number.health.canSend && (
        <p className="pb-warn" data-testid="pb-number">
          {data.number.health.refusal}
        </p>
      )}
      {data.number && !data.number.present && (
        <p className="pb-warn" data-testid="pb-number">
          No WhatsApp number connected — connect one in Settings › Connections before a run can send.
        </p>
      )}
    </div>
  );
}

export function PlaybookComposer({ data, editing, initialTrigger = null, onDone, onCancel }: ComposerProps) {
  // As on Broadcasts: a template this product cannot put on the wire is not
  // offered, rather than offered and refused by Meta for every recipient.
  const offered = useMemo(() => composerOffered(data.templates), [data.templates]);
  // What it opens as: the playbook being changed, or a new one on the moment pressed. Words typed here before and
  // not saved come back over that (the tab's draft, useUnsavedWork), except the moment a slot was pressed for.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- what it opened as, read once
  const opened = useMemo(() => composerOpened(editing, initialTrigger, data), [editing, initialTrigger]);
  const draftKey = editing ? editing.id : "new";
  // What the tab kept of this sheet's words: what `held` below was, when it was left.
  const [kept] = useState(() => tabDraft("playbook", draftKey) as Fields | null);
  const start = kept ? { ...kept, trigger: initialTrigger || kept.trigger } : opened;
  const [trigger, setTrigger] = useState(start.trigger);
  // The message the owner chose. Until they choose one it is the moment's own,
  // and it follows the moment -- nothing is picked for them that the moment
  // was not written for: it opened on whichever template sorted first.
  const [tplId, setTplId] = useState(start.tplId);
  const [picked, setPicked] = useState(start.picked);
  // Null follows the name the route gives a playbook given none; words are the owner's.
  const [name, setName] = useState(start.name);
  const [hour, setHour] = useState(start.hour);
  const [cap, setCap] = useState(start.cap);
  const [gap, setGap] = useState(start.gap);
  const [cadence, setCadence] = useState(start.cadence);
  // Per message: what fills each slot, and the words typed into it.
  const [fills, setFills] = useState(start.fills);
  const [typed, setTyped] = useState(start.typed);
  const [listId, setListId] = useState(start.listId === undefined ? null : start.listId);
  const [cls, setCls] = useState(start.cls || "campaign");
  // What the sheet holds, against what it opened as: changed, it is kept in the tab, and Cancel asks first.
  const held: Fields = { trigger, tplId, picked, name, hour, cap, gap, cadence, listId, cls, fills, typed };
  const work = useLegacyUnsavedWork("playbook", draftKey, {
    value: held,
    dirty: JSON.stringify(held) !== JSON.stringify(opened),
    onLeave: onCancel,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const templatesAll = useSurface("settings")?.templatesAll;
  const canEdit = canDo("approve");

  const m = composerModel({ data, editing, offered, templatesAll, f: held, busy, error });
  const acts = composerActs({
    m,
    f: held,
    editing,
    adding,
    setTrigger,
    setTplId,
    setPicked,
    setBusy,
    setError,
    setAdding,
    done: () => work.done(),
    onDone,
  });
  const x: SectionCtx = {
    ...m,
    data,
    editingTemplateName: editing ? editing.template_name : null,
    f: held,
    canEdit,
    adding,
    setHour,
    setCap,
    setGap,
    setCadence,
    setListId,
    setCls,
    setFills,
    setTyped,
    ...acts,
  };
  const RecordSheet = recordSheetPart();
  return (
    <RecordSheet
      id="playbook"
      testid="pb-composer"
      className="pb-sheet"
      title={
        <span className="pb-title-wrap">
          <input
            className="pb-title"
            value={m.title}
            placeholder={m.auto}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            spellCheck={false}
            aria-label="The playbook's name"
            data-testid="pb-name"
          />
          <Icon name="pencil" size={13} />
        </span>
      }
      sub={
        editing
          ? "A change counts from its next run."
          : "One approved message, to the people a moment names who said yes — each on its own clock. Replies land in the Inbox."
      }
      onClose={work.leave}
      closeLabel="Cancel"
      foot={sheetFoot({ x, work, editing, busy, error, save: acts.save })}
    >
      {sheetBody(x)}
    </RecordSheet>
  );
}
