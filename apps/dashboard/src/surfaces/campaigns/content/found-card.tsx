/**
 * Content's empty state (14 Nov 2026; the canvas "Content empty state"): while nothing is kept, a raised card that says what
 * Ask looked at and what came of it, a line a place (the website, the Google listing, the Instagram), and the one line to Ask
 * for a link to any of them, then adding from the phone. No button per place (Ruben, 12 Nov: an input to Ask, never presets):
 * Ask is handed the owner's words, and brings in what a link holds through its own tool. Its words and its state are
 * contracts content/sources.ts's; this draws them.
 */
import { useEffect } from "react";
import {
  CONTENT_SOURCE_WORDS,
  DAY_MS,
  SECOND_MS,
  contentSourcesSaid,
  type ContentSourceLine,
  type ContentSourcePlace,
  type ContentSourcesDto,
} from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";
import { refreshSurface } from "../../frame-verbs";
import { useSwapMotion } from "../../kit/motion/use-swap-motion";
import { Panel } from "../../kit/panel/panel";
import { AskLooking } from "../../files/photo";
import { ABOUT_CONTENT } from "./model/ask-about";
import { AskLine } from "./sheets/ask-change";

const CARD_SAYS = CONTENT_SOURCE_WORDS;

/** The reads the card comes with: Made's (Content's page) and the Library's (the files page). */
type FoundCardSurface = "content" | "files";

const FOUND_PLACE_GLYPH: Readonly<Record<ContentSourcePlace, "globe" | "place" | "instagram">> = {
  website: "globe",
  google_listing: "place",
  instagram: "instagram",
};

/** A line's tone as the tiles' marks draw it: going while it is read, up once something came, still otherwise. */
const STAND_OF: Readonly<Record<ContentSourceLine["tone"], string>> = { live: "going", ok: "up", rest: "still" };

function SourceLine({ line }: { line: ContentSourceLine }) {
  // "Looking" turning into what came is the same line answering: its words fade where they stand (the kit's swap).
  const statusFades = useSwapMotion<HTMLSpanElement>(`${line.status}|${line.tone}`);
  return (
    <li className="cnv-found-line" data-place={line.place} data-testid={`cnv-found-${line.place}`}>
      <span className="cnv-found-glyph" aria-hidden="true">
        <Icon name={FOUND_PLACE_GLYPH[line.place]} size={15} />
      </span>
      <span className="cnv-found-words">
        <b>{line.name}</b>
        <span>{line.sub}</span>
      </span>
      <span ref={statusFades} className="cnv-found-status">
        <span className="cnv-stands cnv-found-dot" data-tone={STAND_OF[line.tone]} aria-hidden="true">
          <span className="cnv-stands-dot" />
        </span>
        {line.status}
      </span>
    </li>
  );
}

/**
 * The card's one press under its input, in the same place in every state so the card keeps its height: once something was
 * found, where it waits (Made's way to the Library); else adding from the phone. Nothing where this person may do neither.
 */
function FoundCardPress(props: { found: boolean; onAdd: (() => void) | null; onLibrary: (() => void) | null }) {
  const library = props.found ? props.onLibrary : null;
  if (!library && !props.onAdd) return null;
  return (
    <>
      <p className="cnv-found-or">{CARD_SAYS.or}</p>
      {library ? (
        <Button variant="secondary" onClick={library} data-testid="cnv-found-library">
          {CARD_SAYS.openLibrary}
        </Button>
      ) : (
        <Button variant="secondary" onClick={props.onAdd ?? undefined} data-testid="cnv-found-add">
          <Icon name="plus" size={14} />
          {CARD_SAYS.addFromPhone}
        </Button>
      )}
    </>
  );
}

/**
 * Reads the page once more as the soonest place being read stops being believed (contracts sources.ts `reading_until`): what
 * a read brings is told by the live feed as it lands, so nothing asks while it runs, but a run that ends with nothing told
 * would say "Looking" until the page was read again. A day at most, as a timer holds no more; that read sets the next.
 */
function useReadsWhenLookingEnds(sources: ContentSourcesDto, surface: FoundCardSurface): void {
  const until = sources.places.flatMap((p) => (p.reading && p.reading_until ? [Date.parse(p.reading_until)] : []));
  const soonest = until.length ? Math.min(...until) : null;
  useEffect(() => {
    if (soonest === null) return undefined;
    const timer = setTimeout(
      () => void refreshSurface(surface),
      Math.min(Math.max(soonest - Date.now(), 0) + SECOND_MS, DAY_MS),
    );
    return () => clearTimeout(timer);
  }, [soonest, surface]);
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
  /** The page's read the card came in, read again for a run that ends unheard (useReadsWhenLookingEnds). */
  surface: FoundCardSurface;
}) {
  const card = contentSourcesSaid(props.sources, props.videos);
  const looking = card.state === "looking";
  useReadsWhenLookingEnds(props.sources, props.surface);
  // The card's own words change as a read runs and lands: they fade where they stand, and the card keeps its shape (the
  // input and the press under it stay in every state), so nothing under it moves.
  const wordsFade = useSwapMotion(`${card.state}|${card.title}`);
  return (
    <Panel className="cnv-found" data-state={card.state} data-testid="cnv-found">
      <div className="cnv-found-head">
        <span className="cnv-found-three">{looking ? <AskLooking looking /> : <Icon name="three" size={30} />}</span>
        <div ref={wordsFade} className="cnv-found-said">
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
      <div className="cnv-found-ask">
        <AskLine about={ABOUT_CONTENT} onAsked={() => undefined} placeholder={card.ask.placeholder} />
        <p className="cnv-found-hint">{card.ask.hint}</p>
      </div>
      {/* The press under the input, before the shots: in reach on a phone in every state. */}
      <FoundCardPress found={card.state === "found"} onAdd={props.onAdd} onLibrary={props.onLibrary} />
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
    </Panel>
  );
}
