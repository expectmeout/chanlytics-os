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
  THREAD_CHANNEL_WORDS,
  isOneOf,
  type FileYesUse,
  type PiecePersonDto,
  type PostPlace,
} from "@chanlytics/contracts";
import { api } from "@/bridge/api";
import { Button } from "../../../kit/button/button";
import { Icon } from "../../../kit/icon/icon";
import { LineField } from "../../../kit/line/line";
import { Sheet } from "../../../kit/sheet/sheet";
import { Switch } from "../../../kit/switch/switch";
import { fileVerbs } from "../../../files/verbs";

/** The piece the ask is about: its file, its name, and what it is ("the 15-second video", "the photo"). */
export interface AskAboutPiece {
  id: string;
  name: string;
  what: string;
  /** The places the workspace posts to, as the ask names them: "Instagram and Google". */
  places: readonly PostPlace[];
}

const placesSaid = (places: readonly PostPlace[]): string => places.map((p) => POST_PLACE_SAID[p]).join(" and ");

const channelSaid = (via: string): string =>
  isOneOf(Object.keys(THREAD_CHANNEL_WORDS), via)
    ? THREAD_CHANNEL_WORDS[via as keyof typeof THREAD_CHANNEL_WORDS]
    : via;

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
    void api()("POST people/[id]/draft", {
      params: { id: contactId },
      body: { how: "message", ...(wire && isOneOf(CONSENT_CHANNELS, wire) ? { wire } : {}), about },
      once: true,
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
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const sendKey = useRef("");
  const adsId = useId();
  const uses: FileYesUse[] = ads ? ["post", "ad"] : ["post"];
  const draft = useAskDraft(person, piece, uses);
  // What is sent is what is on screen: AI's words until the owner changes them, then theirs, for this draft.
  const words = typed?.key === draft.key ? typed.text : (draft.text ?? "");
  const conversation = person?.conversation ?? null;
  const close = () => {
    setTyped(null);
    setProblem(null);
    setAds(null);
    sendKey.current = "";
    props.onClose();
  };
  const send = async () => {
    if (!person || !conversation || !words.trim() || busy) return;
    setBusy(true);
    setProblem(null);
    // One key for this ask: a second press of the same words is the same message, never a second one.
    sendKey.current ||= crypto.randomUUID();
    const sent = await api()("POST conversations/[id]/reply", {
      params: { id: conversation.id },
      body: { text: words.trim() },
      idempotencyKey: sendKey.current,
    });
    if (!sent.ok) {
      setBusy(false);
      setProblem(sent.message);
      return;
    }
    // It went: that they were asked is kept. A note that could not be kept does not unsend it, and says so.
    const kept = await fileVerbs.personAsked(piece.id, { subject_id: person.id, via: conversation.channel, uses });
    setBusy(false);
    if (!kept.ok) setProblem(kept.message);
    props.onAsked(person);
    if (kept.ok) close();
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
            disabled={busy || !words.trim() || !conversation}
            aria-busy={busy}
            data-testid="cnv-ask-person-send"
          >
            <Icon name="send" size={14} />
            {W.send}
          </Button>
        </div>
      }
    >
      {person && conversation ? (
        <div className="cnv-ask-person">
          <dl className="cnv-ask-to">
            <dt>{W.to}</dt>
            <dd data-testid="cnv-ask-person-to">
              {person.name} · {channelSaid(conversation.channel)}
            </dd>
            <dt>{W.about}</dt>
            <dd>{W.aboutSaid(uses, placesSaid(piece.places))}</dd>
          </dl>
          <div className="cnv-ask-draft" data-busy={draft.text === null || undefined}>
            <small>
              <Icon name="three" size={13} />
              {draft.text === null ? W.writing : W.writtenByAi}
            </small>
            <LineField
              rows={4}
              value={words}
              onChange={(event) => setTyped({ key: draft.key, text: event.currentTarget.value })}
              disabled={draft.text === null || busy}
              aria-label={W.changeWords}
              maxLength={1000}
              data-testid="cnv-ask-person-words"
            />
          </div>
          <div className="cnv-ask-ads">
            <span id={adsId}>{W.adsToo}</span>
            <Switch labelledBy={adsId} checked={ads} onCheckedChange={setAds} data-testid="cnv-ask-person-ads" />
          </div>
          {(problem ?? draft.problem) ? (
            <p className="cnv-note cnv-refused" role="alert" data-testid="cnv-ask-person-problem">
              {problem ?? draft.problem}
            </p>
          ) : null}
        </div>
      ) : null}
    </Sheet>
  );
}
