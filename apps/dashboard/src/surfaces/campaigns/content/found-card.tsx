/**
 * Content's empty state (14 Nov 2026; the canvas "Content empty state"): while nothing is kept, a raised card that says what
 * Ask looked at and what came of it, a line a place (the website, the Google listing, the Instagram), and the one line to Ask
 * for a link to any of them, then adding from the phone. No button per place (Ruben, 12 Nov: an input to Ask, never presets):
 * Ask is handed the owner's words, and brings in what a link holds through its own tool. Its words and its state are
 * contracts content/sources.ts's; this draws them.
 */
import {
  CONTENT_SOURCE_WORDS,
  contentSourcesSaid,
  type ContentSourceLine,
  type ContentSourcePlace,
  type ContentSourcesDto,
} from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";
import { Panel } from "../../kit/panel/panel";
import { AskLooking } from "../../files/photo";
import { ABOUT_CONTENT } from "./model/ask-about";
import { AskLine } from "./sheets/ask-change";

const CARD_SAYS = CONTENT_SOURCE_WORDS;

const FOUND_PLACE_GLYPH: Readonly<Record<ContentSourcePlace, "globe" | "place" | "instagram">> = {
  website: "globe",
  google_listing: "place",
  instagram: "instagram",
};

/** A line's tone as the tiles' marks draw it: going while it is read, up once something came, still otherwise. */
const STAND_OF: Readonly<Record<ContentSourceLine["tone"], string>> = { live: "going", ok: "up", rest: "still" };

function SourceLine({ line }: { line: ContentSourceLine }) {
  return (
    <li className="cnv-found-line" data-place={line.place} data-testid={`cnv-found-${line.place}`}>
      <span className="cnv-found-glyph" aria-hidden="true">
        <Icon name={FOUND_PLACE_GLYPH[line.place]} size={15} />
      </span>
      <span className="cnv-found-words">
        <b>{line.name}</b>
        <span>{line.sub}</span>
      </span>
      <span className="cnv-found-status">
        <span className="cnv-stands cnv-found-dot" data-tone={STAND_OF[line.tone]} aria-hidden="true">
          <span className="cnv-stands-dot" />
        </span>
        {line.status}
      </span>
    </li>
  );
}

/**
 * The card. `onAdd` opens the phone's picker (null where this person may not add); `onLibrary` takes Made to the Library,
 * where what was found waits for a Keep (null on the Library itself, which shows them).
 */
export function FoundCard(props: {
  sources: ContentSourcesDto;
  videos: boolean;
  onAdd: (() => void) | null;
  onLibrary: (() => void) | null;
}) {
  const card = contentSourcesSaid(props.sources, props.videos);
  const looking = card.state === "looking";
  return (
    <Panel className="cnv-found" data-state={card.state} data-testid="cnv-found">
      <div className="cnv-found-head">
        <span className="cnv-found-three">{looking ? <AskLooking looking /> : <Icon name="three" size={30} />}</span>
        <div className="cnv-found-card">
          <h2 className="cnv-found-title">{card.title}</h2>
          <p className="cnv-found-body">{card.body}</p>
        </div>
      </div>
      {card.lines.length > 0 ? (
        <ul className="cnv-found-lines">
          {card.lines.map((line) => (
            <SourceLine key={line.place} line={line} />
          ))}
        </ul>
      ) : null}
      {card.state === "found" && props.onLibrary ? (
        <Button variant="secondary" onClick={props.onLibrary} data-testid="cnv-found-library">
          {CARD_SAYS.openLibrary}
        </Button>
      ) : (
        <div className="cnv-found-ask">
          <AskLine about={ABOUT_CONTENT} onAsked={() => undefined} placeholder={card.ask.placeholder} />
          <p className="cnv-found-hint">{card.ask.hint}</p>
        </div>
      )}
      {props.onLibrary && props.videos && props.sources.film.length > 0 ? (
        <div className="cnv-found-film" data-testid="cnv-found-film">
          <p className="cnv-found-film-head">{CARD_SAYS.film}</p>
          <ol className="cnv-found-shots">
            {props.sources.film.map((shot, index) => (
              <li key={shot.what} className="cnv-found-shot">
                <span className="cnv-found-n" aria-hidden="true">
                  {index + 1}
                </span>
                <span className="cnv-found-words">
                  <b>{shot.what}</b>
                  <span>{shot.how}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
      {props.onAdd && card.state !== "found" ? (
        <>
          <p className="cnv-found-or">{CARD_SAYS.or}</p>
          <Button variant="secondary" onClick={props.onAdd} data-testid="cnv-found-add">
            <Icon name="plus" size={14} />
            {CARD_SAYS.addFromPhone}
          </Button>
        </>
      ) : null}
    </Panel>
  );
}
