/**
 * A form, open beside Campaigns › Forms' list (the Forms canvas, board Sheet): three parts and no more. The Form, as a
 * visitor sees it and changed in place; what happens Next; and Share, each place it is shared with what that place
 * brought. Its state rides its pill as a caret: Turn off and Duplicate while it is live, Turn on once it is off, and
 * Delete draft only for one never published, since nothing of it was shared.
 *
 * A form is live only by its owner's press: Publish asks once, saying what goes live and the one rule a customer may
 * wonder about. AI told what to change writes the draft and says so, with one Undo; it never publishes.
 */
import { useCallback, useState } from "react";
import {
  FORM_PARTS,
  type FormDescription,
  type FormPart,
  type FormSheetDto,
  type FormStateDto,
} from "@chanlytics/contracts";
import { AskLooking } from "../../files/looking";
import { Button } from "../../kit/button/button";
import { EmptyState } from "../../kit/empty/empty";
import { Icon } from "../../kit/icon/icon";
import { LinkButton } from "../../kit/link-button/link-button";
import { Menu, type MenuItem } from "../../kit/menu/menu";
import { Sheet } from "../../kit/sheet/sheet";
import { SubTabs } from "../../kit/sub-tabs/sub-tabs";
import type { FrameFlash } from "../../frame-verbs";
import { gate } from "../../shell-doors";
import { CmPane } from "../parts/split";
import { FormPart as FormPartBody, asksAWayToAnswer } from "./fields-part";
import { NextPart } from "./next-part";
import { NoEmailNotice } from "./no-email";
import { SayLine } from "./say-line";
import { SharePart } from "./share-part";
import { doFormPress, useDraftEditing, useFormSheet, type DraftEditing } from "./use-forms";
import { FORMS_WORDS as W, formSheetSub } from "./words";

/** What the sheet hands its presses. */
interface SheetIo {
  sheet: FormSheetDto;
  editing: DraftEditing;
  /** The sheet and the list read again. */
  again: () => Promise<void>;
  flash: ((flash: FrameFlash) => void) | null;
  /** Where a press lands: another form's sheet (a copy), a part of this one, or the list. */
  go: (place: { form: string | null; part?: FormPart }) => void;
}

/** A press on the form's state, said where it fails; answers the form it came to, or null. */
async function pressState(io: SheetIo, act: "publish" | "turn_on" | "turn_off" | "delete" | "duplicate") {
  await io.editing.settle();
  const pressed = await doFormPress({ act, form_id: io.sheet.id });
  await io.again();
  if (pressed.ok) return pressed.data;
  io.flash?.({ tone: "danger", msg: pressed.message });
  return null;
}

/** What rides the state's pill, by where the form stands. */
function stateItems(io: SheetIo): MenuItem[] {
  const allowed = gate("approve", "change a form");
  const duplicate: MenuItem = {
    label: W.pill.duplicate,
    gate: allowed,
    onSelect: () =>
      void pressState(io, "duplicate").then((copy) => {
        if (!copy?.form_id) return;
        io.flash?.({ tone: "ok", msg: W.duplicated });
        io.go({ form: copy.form_id });
      }),
  };
  if (io.sheet.state === "live")
    return [{ label: W.pill.turnOff, gate: allowed, onSelect: () => void pressState(io, "turn_off") }, duplicate];
  if (io.sheet.state === "off")
    return [{ label: W.pill.turnOn, gate: allowed, onSelect: () => void pressState(io, "turn_on") }, duplicate];
  return [
    {
      label: W.pill.deleteDraft,
      tone: "danger",
      gate: allowed,
      onSelect: () =>
        void pressState(io, "delete").then((gone) => {
          if (!gone) return;
          io.flash?.({ msg: W.deleted });
          io.go({ form: null });
        }),
    },
    duplicate,
  ];
}

/** The form's state as a pill with a caret: what can be done to the form rides it (never three dots). */
function StateMenu({ io }: { io: SheetIo }) {
  const state: FormStateDto = io.sheet.state;
  if (!io.sheet.can_change)
    return (
      <span className="fmv-st" data-state={state}>
        {W.state[state]}
      </span>
    );
  return (
    <Menu
      label={W.pill.label(io.sheet.draft.heading)}
      align="end"
      trigger={
        <Button size="sm" className="fmv-st" data-state={state} data-testid="forms-state">
          {W.state[state]} <Icon name="chevron-down" size={12} />
        </Button>
      }
      groups={[{ items: stateItems(io) }]}
    />
  );
}

/**
 * Publish, asked once: what goes live, and the one rule a customer may wonder about. Where no reply by email can go
 * yet it says so here too, with the way to connect it: the form still publishes, and its thank-you promises none.
 * AI never presses it.
 */
function PublishAsk({
  heading,
  email,
  open,
  busy,
  onClose,
  onPublish,
}: {
  heading: string;
  email: FormSheetDto["email"];
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onPublish: () => void;
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={W.publish.title(heading)}
      sub={W.publish.sub}
      close={{ label: W.publish.cancel, glyph: <Icon name="x" size={13} /> }}
      fit
      testid="forms-publish-ask"
      foot={
        <Button
          variant="primary"
          disabled={busy}
          onClick={onPublish}
          data-testid="forms-publish-yes"
          {...gate("approve", "publish a form")}
        >
          {busy ? W.publish.busy : W.publish.act}
        </Button>
      }
    >
      <div className="fmv-publish">
        <p className="fmv-note">{W.publish.body}</p>
        <NoEmailNotice email={email} testid="forms-publish-no-email" />
      </div>
    </Sheet>
  );
}

/** "Tell AI what to change": one line; AI writes the draft and says so, with one Undo. */
function TellAi({ io }: { io: SheetIo }) {
  const [busy, setBusy] = useState(false);
  const [told, setTold] = useState<{ said: string; before: FormDescription } | null>(null);
  const [away, setAway] = useState(false);
  const tell = async (sentence: string) => {
    setBusy(true);
    setAway(false);
    await io.editing.settle();
    const before = io.editing.draft;
    const pressed = await doFormPress({ act: "tell", form_id: io.sheet.id, sentence });
    await io.again();
    setBusy(false);
    if (pressed.ok && !pressed.data.failed && !pressed.data.asked) {
      setTold({ said: pressed.data.said || W.form.changed, before });
      return true;
    }
    // One question back is said where the change would be; nothing changed either way.
    if (pressed.ok && pressed.data.asked && pressed.data.said) setTold(null);
    setAway(true);
    return false;
  };
  return (
    <div className="fmv-tell" aria-busy={busy || undefined}>
      {told ? (
        <div className="fmv-told" role="status" data-testid="forms-told">
          <Icon name="three" size={14} />
          <span>{told.said}</span>
          <LinkButton
            onClick={() => {
              void io.editing.put(told.before);
              setTold(null);
            }}
            data-testid="forms-told-undo"
          >
            {W.form.undo}
          </LinkButton>
        </div>
      ) : null}
      {away ? (
        <p className="fmv-note" role="status">
          {W.form.aiAway}
        </p>
      ) : null}
      <SayLine
        mark={
          busy ? (
            <span className="fmv-three" data-small="">
              <AskLooking looking />
            </span>
          ) : (
            <Icon name="three" size={15} />
          )
        }
        placeholder={W.form.tell}
        label={W.form.tellLabel}
        send={W.form.tell}
        busy={busy}
        onSay={tell}
        testid="forms-tell"
      />
    </div>
  );
}

/**
 * The sheet's foot, by where the form stands: Publish, the changes of a live form, or Turn on. Null where it holds
 * nothing, so the pane draws no empty foot. Called, not drawn: the pane asks whether there is one.
 */
function sheetFoot(io: SheetIo, part: FormPart, onPublish: () => void) {
  const { sheet, editing } = io;
  if (!sheet.can_change) return null;
  const blocked = !asksAWayToAnswer(editing.draft);
  if (sheet.state === "off")
    return (
      <div className="fmv-foot">
        <Button variant="primary" onClick={() => void pressState(io, "turn_on")} data-testid="forms-turn-on">
          {W.pill.turnOn}
        </Button>
      </div>
    );
  const tell = part === "form" ? <TellAi io={io} /> : null;
  if (sheet.state === "live" && !sheet.changed) return tell ? <div className="fmv-foots">{tell}</div> : null;
  return (
    <div className="fmv-foots">
      {tell}
      <div className="fmv-foot">
        <Button
          variant="primary"
          disabled={blocked}
          onClick={onPublish}
          data-testid="forms-publish"
          {...gate("approve", "publish a form")}
        >
          {sheet.state === "live" ? W.publish.changes : W.publish.act}
        </Button>
        {sheet.state === "live" && sheet.live ? (
          <LinkButton onClick={() => sheet.live && void editing.put(sheet.live)} data-testid="forms-undo-all">
            {W.publish.undoAll}
          </LinkButton>
        ) : null}
      </div>
    </div>
  );
}

interface FormSheetProps {
  formId: string;
  part: FormPart;
  flash: ((flash: FrameFlash) => void) | null;
  /** The list read again: a row's state, its heading, its last request. */
  listAgain: () => Promise<void>;
  go: SheetIo["go"];
}

/** The form's sheet, read: its parts over one draft. */
function SheetRead({
  sheet,
  part,
  flash,
  again,
  go,
}: Omit<FormSheetProps, "formId" | "listAgain"> & { sheet: FormSheetDto; again: () => Promise<void> }) {
  const editing = useDraftEditing(sheet, again);
  const [asking, setAsking] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [justLive, setJustLive] = useState(false);
  const [now] = useState(() => Date.now());
  const io: SheetIo = { sheet, editing, again, flash, go };
  const publish = async () => {
    setPublishing(true);
    const first = sheet.state === "draft";
    const published = await pressState(io, "publish");
    setPublishing(false);
    setAsking(false);
    if (!published) return;
    // Live: the link first (the canvas, "Live: the link first").
    if (first) {
      setJustLive(true);
      go({ form: sheet.id, part: "share" });
    }
  };
  return (
    <CmPane
      title={editing.draft.heading}
      sub={formSheetSub(sheet, now)}
      tools={<StateMenu io={io} />}
      onClose={() => go({ form: null })}
      testid="forms-sheet"
      className="fmv-pane"
      foot={sheetFoot(io, part, () => (sheet.state === "draft" ? setAsking(true) : void publish()))}
    >
      <SubTabs
        label={W.partsLabel}
        value={part}
        tabs={FORM_PARTS.map((id) => ({ id, label: W.parts[id] }))}
        onSelect={(id) => go({ form: sheet.id, part: FORM_PARTS.find((known) => known === id) ?? "form" })}
        className="fmv-parts"
      />
      {part === "form" ? (
        <FormPartBody formId={sheet.id} editing={editing} changed={sheet.changed} canChange={sheet.can_change} />
      ) : part === "next" ? (
        <NextPart editing={editing} chat={sheet.chat} email={sheet.email} canChange={sheet.can_change} />
      ) : (
        <SharePart
          sheet={sheet}
          again={again}
          fail={(message) => flash?.({ tone: "danger", msg: message })}
          justLive={justLive}
        />
      )}
      <PublishAsk
        heading={editing.draft.heading}
        email={sheet.email}
        open={asking}
        busy={publishing}
        onClose={() => setAsking(false)}
        onPublish={() => void publish()}
      />
    </CmPane>
  );
}

/** A form's sheet: read as it opens, said plainly while it is, and where it could not be. */
export function FormSheet({ formId, part, flash, listAgain, go }: FormSheetProps) {
  const read = useFormSheet(formId);
  const readAgain = read.again;
  const again = useCallback(async () => {
    await Promise.all([readAgain(), listAgain()]);
  }, [readAgain, listAgain]);
  if (!read.dto)
    return (
      <CmPane title={W.tab} onClose={() => go({ form: null })} testid="forms-sheet" className="fmv-pane">
        {read.failed ? (
          <EmptyState
            kind="page"
            glyph="note"
            title={W.unread.title}
            body={W.unread.body}
            action={{ label: W.unread.act, onClick: () => void again() }}
            testid="forms-sheet-unread"
          />
        ) : (
          <div className="route-reading" role="status" data-testid="forms-sheet-reading" />
        )}
      </CmPane>
    );
  return <SheetRead key={read.dto.id} sheet={read.dto} part={part} flash={flash} again={again} go={go} />;
}
