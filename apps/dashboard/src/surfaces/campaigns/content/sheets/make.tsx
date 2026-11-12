/**
 * Make (the content canvas, board Act "Make"): a sheet over Content, never Ask's whole screen with its other news above what
 * the owner pressed for. What Ask can make now, each idea a row with the files it would be made from (contracts
 * contentIdeaFilesOf: the pictures the owner sees are the ones Ask is asked to use), and under them Ask's own line for anything
 * else, in their words. An idea, or a line said, is asked of Ask on this page, and the sheet goes.
 *
 * The rows are the first day's too (body.tsx FirstDay): one row, wherever an idea is offered.
 */
import {
  CONTENT_WORDS as W,
  contentIdeaAsk,
  fileViewOf,
  type AskScope,
  type ContentIdea,
  type ContentIdeaFiles,
} from "@chanlytics/contracts";
import { askAbout } from "../../../frame-verbs";
import { Icon } from "../../../kit/icon/icon";
import { Press } from "../../../kit/press";
import { Sheet } from "../../../kit/sheet/sheet";
import { AskLine } from "./ask-change";

/** Each idea's glyph, where it has no picture: a picture for a photo's, a star for a review's, a video for a video's. */
const IDEA_GLYPH = { before_after: "image", review: "star", video: "video", photo_post: "image" } as const;

/** What an idea is asked as: its words, and the files its row shows. */
export type OnIdea = (idea: ContentIdea, files: readonly { name: string }[]) => void;

/** Asks Ask on this page for an idea, naming the files its row showed. */
export const askIdeaOn =
  (about: AskScope): OnIdea =>
  (idea, files) =>
    askAbout({ about, prompts: contentIdeaAsk(idea, files) });

/** The files an idea would use, as the page's read chose them; none where it chose none, or has not said. */
const filesOf = (picks: readonly ContentIdeaFiles[], idea: ContentIdea) =>
  picks.find((pick) => pick.key === idea.key)?.files ?? [];

/**
 * The ideas, a row each: its picture, the first file it would use, else its glyph; what it is and the line under it; and a
 * chevron. A row is the page's own press (the canvas's 18px corner), not a kit button, whose capsule would round a two-line row
 * into a stadium.
 */
export function IdeaRows({
  ideas,
  picks,
  onIdea,
}: {
  ideas: readonly ContentIdea[];
  picks: readonly ContentIdeaFiles[];
  onIdea: OnIdea;
}) {
  return (
    <div className="cnv-ideas">
      {ideas.map((idea) => {
        const files = filesOf(picks, idea);
        const first = files[0];
        return (
          <Press
            key={idea.key}
            className="cnv-idea"
            onClick={() => onIdea(idea, files)}
            data-testid={`cnv-idea-${idea.key}`}
          >
            <span className="cnv-idea-glyph" aria-hidden="true">
              {first ? (
                <img src={`${fileViewOf(first.id)}?w=160`} alt="" loading="lazy" />
              ) : (
                <Icon name={IDEA_GLYPH[idea.key]} size={20} />
              )}
            </span>
            <span className="cnv-idea-words">
              <b>{idea.title}</b>
              <span>{idea.sub}</span>
            </span>
            <Icon name="chevron" size={12} />
          </Press>
        );
      })}
    </div>
  );
}

/** The sheet: Make something, the ideas, and Ask's line for anything else. */
export function MakeSheet(props: {
  open: boolean;
  onClose: () => void;
  ideas: readonly ContentIdea[];
  picks: readonly ContentIdeaFiles[];
  about: AskScope;
}) {
  const { onClose, about } = props;
  const asked: OnIdea = (idea, files) => {
    onClose();
    askIdeaOn(about)(idea, files);
  };
  return (
    <Sheet
      open={props.open}
      onClose={onClose}
      title={W.makeSheet.title}
      sub={W.makeSheet.sub}
      close={{ label: W.viewer.close, glyph: <Icon name="x" size={13} /> }}
      fit
      testid="cnv-make"
    >
      <div className="cnv-over cnv-make">
        <IdeaRows ideas={props.ideas} picks={props.picks} onIdea={asked} />
        <AskLine about={about} onAsked={onClose} placeholder={W.makeSheet.say} />
      </div>
    </Sheet>
  );
}
