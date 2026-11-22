/**
 * Take down asks first (the journey canvas, board Piece, cell 36, and PieceDesk, cell 45; the content loop PRD's 8.3): its
 * own card, saying what each place will be asked and what stays, before the press. Never an Undo once it is up: a post
 * taken down is posted again as a new post. What follows the press is the piece's own lines, a line a place, as each one
 * answers (viewer/goes.tsx): this only asks, and sends.
 *
 * The kit's sheet: from the bottom edge on a phone, the kit's pane on a desk.
 */
import { useState } from "react";
import {
  PLACE_CAPABILITIES,
  POST_PLACE_SAID,
  TAKE_DOWN_WORDS as W,
  capabilityStands,
  takeDownWillOf,
  type PostDto,
  type PostPlace,
} from "@chanlytics/contracts";
import { Button } from "../../../kit/button/button";
import { Icon } from "../../../kit/icon/icon";
import { Sheet } from "../../../kit/sheet/sheet";
import { fileVerbs } from "../../../files/verbs";

const GLYPH = { reel: "instagram", story: "instagram", post: "instagram", google: "place", ad: "bolt" } as const;

/** Whether a piece has anything a take-down would reach: a post up, on its way, or still waiting. */
export const takeDownOffered = (posts: readonly Pick<PostDto, "status">[]): boolean =>
  posts.some((p) => ["published", "publishing", "checking"].includes(p.status));

/** The places it comes off, for the card's sentence: where a post is up. */
const upAt = (posts: readonly PostDto[]): PostPlace[] => [
  ...new Set(posts.filter((p) => p.status === "published").map((p) => p.place)),
];

export function TakeDownAsk(props: {
  open: boolean;
  piece: { id: string; name: string };
  posts: readonly PostDto[];
  /** Whether an ad made here shows the piece, where that is known: it is paused with it, and the card says so. */
  adShows?: boolean;
  onClose: () => void;
  /** Told once the places were asked: the piece is read again, and its lines say what each answered. */
  onBegun: () => void;
}) {
  const { piece, posts } = props;
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const will = takeDownWillOf(posts, (place) => capabilityStands(PLACE_CAPABILITIES[place].remoteDelete), Date.now());
  const places = upAt(posts).map((place) => POST_PLACE_SAID[place]);
  const close = () => {
    setProblem(null);
    props.onClose();
  };
  const go = async () => {
    setBusy(true);
    setProblem(null);
    const asked = await fileVerbs.takeDown(piece.id);
    setBusy(false);
    if (!asked.ok) return setProblem(asked.message);
    props.onBegun();
    close();
    return undefined;
  };
  return (
    <Sheet
      open={props.open}
      onClose={close}
      title={W.title(piece.name)}
      close={{ label: "Close", glyph: <Icon name="x" size={13} /> }}
      fit
      testid="cnv-take-down"
      foot={
        <div className="cnv-acts" data-foot-acts="">
          <Button onClick={close} disabled={busy} data-testid="cnv-take-down-no">
            {W.no}
          </Button>
          <Button
            variant="danger"
            className="cnv-lead"
            onClick={() => void go()}
            disabled={busy}
            aria-busy={busy}
            data-testid="cnv-take-down-yes"
          >
            {W.yes}
          </Button>
        </div>
      }
    >
      <div className="cnv-take-down">
        <p data-testid="cnv-take-down-says">{places.length > 0 ? W.body(places) : W.bodyNowhere}</p>
        <ul>
          {will.map((line) => (
            <li key={line.key} data-testid={`cnv-take-down-will-${line.glyph}`}>
              <Icon name={GLYPH[line.glyph]} size={15} />
              <div>
                {line.name}
                <span>{line.will}</span>
              </div>
            </li>
          ))}
          {props.adShows ? (
            <li data-testid="cnv-take-down-will-ad">
              <Icon name={GLYPH.ad} size={15} />
              <div>
                {W.adShowing}
                <span>{W.will.ad}</span>
              </div>
            </li>
          ) : null}
        </ul>
        {problem ? (
          <p className="cnv-note cnv-refused" role="alert" data-testid="cnv-take-down-problem">
            {problem}
          </p>
        ) : null}
      </div>
    </Sheet>
  );
}
