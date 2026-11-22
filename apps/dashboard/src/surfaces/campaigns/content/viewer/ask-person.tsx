/**
 * Ask a person in a piece for their yes (the journey canvas, board Piece, cell 30, and PieceDesk, cell 46; the content loop
 * PRD's 5.3, call 13): the ask AI drafts and the owner sends. AI writes the words from what the workspace knows of the
 * person (POST people/[id]/draft, the draft every first message is written by); the owner changes them where they stand,
 * says whether ads are asked about too, and sends. The send is a reply in the person's own conversation, through the one
 * send door (POST conversations/[id]/reply), and only on the press; that they were asked is kept after it went.
 *
 * The kit's sheet: from the bottom edge on a phone, the kit's pane on a desk.
 */
import { useEffect, useId, useRef, useState } from "react";
import {
  CONSENT_CHANNELS,
  PERSON_ASK_WORDS as W,
  POST_PLACE_SAID,
  isOneOf,
  type FileYesUse,
  type PiecePersonDto,
  type PostPlace,
} from "@chanlytics/contracts";
import { draftPersonAsk, markPersonAsked, sendPersonAsk } from "@/bridge/verbs/pieces";
import { Button } from "../../../kit/button/button";
import { Icon } from "../../../kit/icon/icon";
import { LineField } from "../../../kit/line/line";
import { Sheet } from "../../../kit/sheet/sheet";
import { Switch } from "../../../kit/switch/switch";
import { channelSaid } from "./people";

/** The piece the ask is about: its file, its name, and what it is ("the 15-second video", "the photo"). */
interface AskAboutPiece {
  id: string;
  name: string;
  what: string;
  /** The places the workspace posts to, as the ask names them: "Instagram and Google". */
  places: readonly PostPlace[];
}

const placesSaid = (places: readonly PostPlace[]): string => places.map((p) => POST_PLACE_SAID[p]).join(" and ");

/** The words AI wrote, asked for as the sheet opens and again when ads are added: what was asked for, and what came. */
function useAskDraft(person: PiecePersonDto | null, piece: AskAboutPiece, uses: readonly FileYesUse[]) {
  const [state, setState] = useState<{ key: string; text: string | null; problem: string | null }>({
    key: "",
    text: null,
    problem: null,
  });
  const key = person ? `${person.id}|${uses.join()}` : "";
  const contactId = person?.contact_id ?? null;
  const wire = person?.conversation?.channel ?? null;
  const about = W.instruction(piece, uses, placesSaid(piece.places));
  useEffect(() => {
    if (!key || !contactId) return undefined;
    let live = true;
    setState({ key, text: null, problem: null });
    void draftPersonAsk(contactId, {
      how: "message",
      ...(wire && isOneOf(CONSENT_CHANNELS, wire) ? { wire } : {}),
      about,
    }).then((answer) => {
      if (!live) return;
      // A draft that could not be written leaves the box empty for the owner's own words, with why.
      setState({ key, text: answer.ok ? answer.data.text : "", problem: answer.ok ? null : answer.message });
    });
    return () => {
      live = false;
    };
  }, [key, contactId, wire, about]);
  return state.key === key ? state : { key, text: null, problem: null };
}

/** Where the ask goes: the person's own thread. */
type AskThread = NonNullable<PiecePersonDto["conversation"]>;

/**
 * The ask's send: the message through the one send door, then that they were asked, kept. One key for an ask, so a
 * second press of the same words is the same message, never a second one. A note that could not be kept does not
 * unsend what went, and says so. Answers whether it went and was kept.
 */
function useAskSend(ask: { piece: AskAboutPiece; uses: FileYesUse[]; onAsked: (person: PiecePersonDto) => void }) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const sendKey = useRef("");
  const send = async (person: PiecePersonDto, thread: AskThread, words: string): Promise<boolean> => {
    if (!words || busy) return false;
    setBusy(true);
    setProblem(null);
    sendKey.current ||= crypto.randomUUID();
    const sent = await sendPersonAsk(thread.id, words, sendKey.current);
    if (!sent.ok) {
      setBusy(false);
      setProblem(sent.message);
      return false;
    }
    const kept = await markPersonAsked(ask.piece.id, { subject_id: person.id, via: thread.channel, uses: ask.uses });
    setBusy(false);
    ask.onAsked(person);
    if (!kept.ok) setProblem(kept.message);
    return kept.ok;
  };
  const reset = () => {
    setProblem(null);
    sendKey.current = "";
  };
  return { busy, problem, send, reset };
}

/** The sheet's body: who it goes to and about what, AI's words where the owner changes them, and ads too. */
function AskBody(props: {
  person: PiecePersonDto;
  thread: AskThread;
  piece: AskAboutPiece;
  uses: readonly FileYesUse[];
  /** AI's words are still being written: the box waits for them. */
  writing: boolean;
  words: string;
  onWords: (words: string) => void;
  busy: boolean;
  ads: boolean;
  onAds: (ads: boolean) => void;
  problem: string | null;
}) {
  const adsId = useId();
  return (
    <div className="cnv-ask-person">
      <dl className="cnv-ask-to">
        <dt>{W.to}</dt>
        <dd data-testid="cnv-ask-person-to">
          {props.person.name} · {channelSaid(props.thread.channel)}
        </dd>
        <dt>{W.about}</dt>
        <dd>{W.aboutSaid(props.uses, placesSaid(props.piece.places))}</dd>
      </dl>
      <div className="cnv-ask-draft" data-busy={props.writing || undefined}>
        <small>
          <Icon name="three" size={13} />
          {props.writing ? W.writing : W.writtenByAi}
        </small>
        <LineField
          rows={6}
          value={props.words}
          onChange={(event) => props.onWords(event.currentTarget.value)}
          disabled={props.writing || props.busy}
          aria-label={W.changeWords}
          maxLength={1000}
          data-testid="cnv-ask-person-words"
        />
      </div>
      <div className="cnv-ask-ads">
        <span id={adsId}>{W.adsToo}</span>
        <Switch labelledBy={adsId} checked={props.ads} onCheckedChange={props.onAds} data-testid="cnv-ask-person-ads" />
      </div>
      {props.problem ? (
        <p className="cnv-note cnv-refused" role="alert" data-testid="cnv-ask-person-problem">
          {props.problem}
        </p>
      ) : null}
    </div>
  );
}

export function AskPerson(props: {
  /** The person being asked; null while the sheet is closed. */
  person: PiecePersonDto | null;
  piece: AskAboutPiece;
  /** Whether the ask opens asking about ads too: from Run as an ad's reason. */
  adsFirst?: boolean;
  onClose: () => void;
  /** Told once the ask went and was kept, with who was asked. */
  onAsked: (person: PiecePersonDto) => void;
}) {
  const { person, piece } = props;
  const [adsPicked, setAds] = useState<boolean | null>(null);
  const ads = adsPicked ?? props.adsFirst ?? false;
  const [typed, setTyped] = useState<{ key: string; text: string } | null>(null);
  const uses: FileYesUse[] = ads ? ["post", "ad"] : ["post"];
  const draft = useAskDraft(person, piece, uses);
  // What is sent is what is on screen: AI's words until the owner changes them, then theirs, for this draft.
  const words = typed?.key === draft.key ? typed.text : (draft.text ?? "");
  const thread = person?.conversation ?? null;
  const sending = useAskSend({ piece, uses, onAsked: props.onAsked });
  const close = () => {
    setTyped(null);
    setAds(null);
    sending.reset();
    props.onClose();
  };
  const ready = person !== null && thread !== null;
  const send = async () => {
    if (ready && (await sending.send(person, thread, words.trim()))) close();
  };
  return (
    <Sheet
      open={person !== null}
      onClose={close}
      title={person ? W.title(person.name) : ""}
      sub={W.sub(piece.name)}
      close={{ label: "Close", glyph: <Icon name="x" size={13} /> }}
      fit
      testid="cnv-ask-person"
      foot={
        <div className="cnv-acts" data-foot-acts="">
          <Button
            variant="primary"
            className="cnv-lead"
            onClick={() => void send()}
            disabled={sending.busy || !words.trim() || !ready}
            aria-busy={sending.busy}
            data-testid="cnv-ask-person-send"
          >
            <Icon name="send" size={14} />
            {W.send}
          </Button>
        </div>
      }
    >
      {ready ? (
        <AskBody
          person={person}
          thread={thread}
          piece={piece}
          uses={uses}
          writing={draft.text === null}
          words={words}
          onWords={(text) => setTyped({ key: draft.key, text })}
          busy={sending.busy}
          ads={ads}
          onAds={setAds}
          problem={sending.problem ?? draft.problem}
        />
      ) : null}
    </Sheet>
  );
}
