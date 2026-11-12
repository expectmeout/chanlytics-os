/**
 * A piece, opened on a desk (the content canvas, board Desk; plan Part B): Campaigns' pane beside the grid, with no head of its
 * own (parts/split.tsx CmPane `bare`). On top the picture on the dark, a video playing as the phone's viewer plays it and a
 * post fitted over its own copy blurred to the edges, with a video's sound and Close on the glass over it. Under it the name
 * and its one line, where it stands in one row, the acts (the one coral next step, Save, Ask's three, More), what Details
 * holds (the words first), and the keys a desk walks it with. It is the phone's viewer laid out for a desk, drawn from its
 * parts (the line, the status row, the acts, More, Details) over the same record, presses and drafts (piece.tsx,
 * piece-presses.tsx).
 *
 * What a phone opens as a sheet over the viewer (a draft, Ask for a change, Rename) stands in the pane's body
 * here, under the picture, with its acts in the pane's foot; Escape lets it go first, as a sheet's does, before the piece.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { CONTENT_WORDS as W, fileSaidOf } from "@chanlytics/contracts";
import { Button } from "../../../kit/button/button";
import { Icon } from "../../../kit/icon/icon";
import { NameField } from "../../../files/file-fields";
import { CmPane } from "../../parts/split";
import { useSave } from "../piece-foot";
import { draftBody, draftFoot } from "../piece-presses";
import { pieceNextOf } from "../model/piece-open";
import { viewerSaidOf } from "../model/viewer-line";
import { AskLine } from "../sheets/ask-change";
import { ViewerFacts } from "./details";
import { ViewerActs, ViewerStatus, statusOpensOf, viewerHasStatus, viewerLeadOf } from "./foot";
import { ViewerMore } from "./more";
import { ViewerPicture } from "./picture";
import { draftHeadOf } from "./sheets";
import { viewerClockOf } from "./clock";
import { removeAsk, type ViewerHands } from "./viewer";

/** What a phone opens over the viewer as a sheet of its own, standing in the desk pane's body. */
type DeskOpen = "change" | "rename" | null;

/** What stands in the body while something is open: its head, what it holds, and its acts for the pane's foot. */
interface DeskOpened {
  title: string;
  sub: string | null;
  close: () => void;
  body: ReactNode;
  foot?: ReactNode;
}

/** The keys a desk walks a piece with: the one before and after, a video's sound, the coral act. */
interface DeskKeys {
  before: (() => void) | null;
  after: (() => void) | null;
  sound: (() => void) | null;
  lead: (() => void) | null;
}

function deskKeyOf(key: string, keys: DeskKeys): (() => void) | null {
  if (key === "ArrowLeft" || key === "ArrowUp") return keys.before;
  if (key === "ArrowRight" || key === "ArrowDown") return keys.after;
  if (key === " ") return keys.sound;
  if (key === "p" || key === "P") return keys.lead;
  return null;
}

/** Where the keys are typed: a field, a menu, a dialog, the player. */
const DESK_KEYS_TYPED = "input, textarea, select, [contenteditable], [role='menu'], [role='dialog'], iframe";
/** What Space presses itself, where it has the focus. */
const DESK_KEYS_PRESSES =
  "button, a, summary, [role='button'], [role='switch'], [role='checkbox'], [role='radio'], [role='tab'], [role='option']";
/** What the arrows move inside, where it has the focus: a row of tabs or of choices (Made or Library, Campaigns' tabs). */
const DESK_KEYS_CHOICES = "[role='tablist'], [role='radiogroup'], [role='listbox'], [role='grid'], [role='slider']";

/**
 * Whether a key is another's: taken already, or with a modifier; typed into a field, a menu, a dialog or the player; Space
 * over a press, which it presses; an arrow inside a row of choices, which it moves along.
 */
function deskKeyIsTheirs(event: KeyboardEvent): boolean {
  if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return true;
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return false;
  if (target.closest(DESK_KEYS_TYPED)) return true;
  if (event.key === " ") return !!target.closest(DESK_KEYS_PRESSES);
  return event.key.startsWith("Arrow") && !!target.closest(DESK_KEYS_CHOICES);
}

/**
 * Left and Up walk to the one before, Right and Down to the next, Space turns a video's sound, P presses the coral act; never
 * a key that is another's (deskKeyIsTheirs). Escape is the pane's own (CmPane), as every Campaigns pane closes.
 */
function useDeskKeys(on: boolean, keys: DeskKeys): void {
  const held = useRef(keys);
  held.current = keys;
  useEffect(() => {
    if (!on) return undefined;
    const press = (event: KeyboardEvent) => {
      if (deskKeyIsTheirs(event)) return;
      const go = deskKeyOf(event.key, held.current);
      if (!go) return;
      event.preventDefault();
      go();
    };
    window.addEventListener("keydown", press);
    return () => window.removeEventListener("keydown", press);
  }, [on]);
}

/**
 * The keys, said under it as the canvas says them: "← → Next piece" (where there is a piece beside it), "Space Sound", "P Post",
 * "Esc Close".
 */
function DeskKeysLine(props: {
  beside: Pick<ViewerHands["acts"], "onBefore" | "onAfter">;
  sound: boolean;
  lead: string | undefined;
}) {
  const { beside, sound, lead } = props;
  const keys = W.viewer.keys;
  return (
    <p className="cnv-keys" data-testid="cnv-keys">
      {beside.onBefore || beside.onAfter ? (
        <span>
          {keys.walk.map((cap) => (
            <kbd key={cap}>{cap}</kbd>
          ))}
          {keys.next}
        </span>
      ) : null}
      {sound ? (
        <span>
          <kbd>{keys.space}</kbd>
          {keys.sound}
        </span>
      ) : null}
      {lead ? (
        <span>
          <kbd>{keys.lead}</kbd>
          {lead}
        </span>
      ) : null}
      <span>
        <kbd>{keys.esc}</kbd>
        {keys.close}
      </span>
    </p>
  );
}

/**
 * What is open in the body: a draft first (the pane's own: the list of places with the composer, a post's or a video's
 * Change it), else the line to Ask alone (a piece with nothing to change by hand), or Rename.
 */
function deskOpenedOf(open: DeskOpen, at: { hands: ViewerHands; close: () => void }): DeskOpened | null {
  const { hands, close } = at;
  const { drafts, made, presses } = hands;
  if (drafts.open) {
    const head = draftHeadOf(drafts);
    return {
      title: head.title,
      sub: head.sub,
      close: head.cancel,
      body: draftBody(drafts, null, hands.doors),
      foot: draftFoot(drafts),
    };
  }
  if (open === "change")
    return { title: W.piece.changeIt, sub: null, close, body: <AskLine about={drafts.about} onAsked={close} alone /> };
  if (open === "rename")
    return { title: W.piece.rename, sub: null, close, body: <NameField file={made.file} change={presses.change} /> };
  return null;
}

/**
 * The head of what is open in the body: its name, the line under it, and its Close. The press that opened it has gone with
 * the acts, so the name takes the focus where nothing inside has it (a field that asks for it keeps it), and a keyboard
 * goes on from there.
 */
function DeskOpenHead({ opened }: { opened: DeskOpened }) {
  const named = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const at = document.activeElement;
    if (!at || at === document.body) named.current?.focus();
  }, []);
  return (
    <div className="cnv-desk-open">
      <div>
        <h3 className="cnv-desk-open-title" ref={named} tabIndex={-1}>
          {opened.title}
        </h3>
        {opened.sub ? <p className="cnv-desk-line">{opened.sub}</p> : null}
      </div>
      <Button
        iconOnly
        variant="quiet"
        size="sm"
        onClick={opened.close}
        aria-label={W.viewer.close}
        data-testid="cnv-open-close"
      >
        <Icon name="x" size={13} />
      </Button>
    </div>
  );
}

/** The picture on the dark, its sound and Close on the glass over it. */
function DeskPicture(props: {
  hands: ViewerHands;
  name: string;
  sound: { on: boolean; flip: () => void } | null;
  /** A form is open under it: the stage steps back. */
  small: boolean;
}) {
  const { hands, name, sound } = props;
  return (
    <div className="cnv-desk-media" data-theme="dark" data-small={props.small || undefined}>
      <ViewerPicture file={hands.made.file} name={name} sound={sound?.on ?? false} />
      {sound ? (
        <Button
          variant="glass"
          size="lg"
          iconOnly
          className="cnv-desk-sound"
          onClick={sound.flip}
          aria-label={sound.on ? W.viewer.soundOff : W.viewer.soundOn}
          data-testid="cnv-sound"
        >
          <Icon name={sound.on ? "sound-on" : "sound-off"} size={16} />
        </Button>
      ) : null}
      <Button
        variant="glass"
        size="lg"
        iconOnly
        className="cnv-desk-close"
        onClick={hands.acts.onClose}
        aria-label={W.viewer.close}
        data-testid="cnv-close"
      >
        <Icon name="x" size={16} />
      </Button>
    </div>
  );
}

/** What Escape lets go of first: what is open in the body, then Delete's question, and only then the piece. */
function deskEscapeOf(opened: DeskOpened | null, hands: ViewerHands): () => void {
  if (opened) return opened.close;
  if (hands.presses.asking) return () => hands.presses.ask(false);
  return hands.acts.onClose;
}

export function PieceDesk({ hands, over }: { hands: ViewerHands; over: boolean }) {
  const { made, record, presses, drafts, acts } = hands;
  const { file, posts } = made;
  const [open, setOpen] = useState<DeskOpen>(null);
  const [sound, setSound] = useState(false);
  const save = useSave(file, "portrait");
  const name = fileSaidOf(file.name);
  const clock = viewerClockOf();
  const says = viewerSaidOf({ file, posts, name }, record, clock);
  const next = pieceNextOf(file, posts, hands.takes, Date.now());
  const close = () => setOpen(null);
  const opened = deskOpenedOf(open, { hands, close });
  const onLead = () => {
    presses.clear();
    acts.onNext(next);
  };
  const lead = hands.may ? viewerLeadOf(file, next) : null;
  // Where it stands, opened: a post's list of places once its record is read (foot.tsx statusOpensOf).
  const onStatus = statusOpensOf({ ready: drafts.both.ready }, () => {
    presses.clear();
    drafts.both.begin();
  });
  const playable = file.kind === "video" && file.media_status === "ready";
  const flip = playable ? () => setSound((on) => !on) : null;
  useDeskKeys(!opened && !presses.asking, {
    before: acts.onBefore,
    after: acts.onAfter,
    sound: flip,
    lead: lead && !presses.busy ? onLead : null,
  });
  const more = hands.may ? <ViewerMore file={file} desk acts={{ ...acts, onRename: () => setOpen("rename") }} /> : null;
  return (
    <CmPane
      bare
      title={name}
      onClose={deskEscapeOf(opened, hands)}
      foot={opened?.foot}
      over={over}
      className="cnv-open cnv-desk"
      testid="cnv-piece"
    >
      <DeskPicture hands={hands} name={name} sound={flip ? { on: sound, flip } : null} small={!!opened} />
      <div className="cnv-desk-body">
        <div>
          <h2 className="cnv-desk-name">{name}</h2>
          <p className="cnv-desk-line" data-testid="cnv-line">
            {says.line}
          </p>
        </div>
        {opened ? (
          <>
            <DeskOpenHead opened={opened} />
            {opened.body}
          </>
        ) : (
          <>
            {viewerHasStatus(file) ? (
              <ViewerStatus posts={posts} next={next} clock={clock} opens={onStatus} desk />
            ) : null}
            {(presses.problem ?? save.said) ? (
              <p className="cnv-desk-line" role="alert" data-testid="cnv-problem">
                {presses.problem ?? save.said}
              </p>
            ) : null}
            {removeAsk(hands) ?? (
              <ViewerActs
                file={file}
                next={next}
                may={hands.may}
                busy={presses.busy}
                save={save}
                caption={file.kind === "video" ? says.words : null}
                acts={{
                  onLead,
                  onAsk: acts.onAsk,
                  onChange: acts.onChange ?? (file.source === "made" ? () => setOpen("change") : null),
                }}
                desk={{ more }}
              />
            )}
            <ViewerFacts
              shown={says.details}
              may={hands.may}
              busy={presses.busy}
              say={presses.say}
              caption={presses.caption}
            />
            <DeskKeysLine beside={acts} sound={!!flip} lead={lead?.words} />
          </>
        )}
      </div>
    </CmPane>
  );
}
