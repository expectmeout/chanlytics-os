/**
 * Content's empty state (14 Nov 2026; the canvas "Content empty state"): while nothing is kept, a raised card that says what
 * AI looked at and what came of it, a line a place (the website, the Google listing, the Instagram), and the one line to AI
 * for a link to any of them, its + adding from the phone. No button per place (Ruben, 12 Nov: an input to AI, never
 * presets): AI is handed the owner's words, and brings in what a link holds through its own tool. Its words and its state
 * are contracts content/sources.ts's; this draws them.
 *
 * Compact (Ruben, 16 Nov 2026: "cleaner, compact, accordions"): what was found is reviewed from the title's own line, where
 * the news is, never under the input and an "or"; a place is one line with no box around the lines; adding from the phone
 * is the input's +; and the clips to film fold under one line, each said whole when it is opened, never cut off.
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
  type FilmSaid,
} from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";
import { LinePress } from "../../kit/line/line";
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
        <Icon name={FOUND_PLACE_GLYPH[line.place]} size={16} />
      </span>
      <b className="cnv-found-name">{line.name}</b>
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
 * The clips to film, folded under one line (how many, and their length where they share one): opened, each says what to
 * film and where to hold the phone, whole. The browser's own disclosure, so the keys and a screen reader know it.
 */
function FilmFold({ film }: { film: FilmSaid }) {
  return (
    <details className="cnv-found-film" data-testid="cnv-found-film">
      <summary className="cnv-found-film-head" data-testid="cnv-found-film-open">
        <Icon name="video" size={16} />
        <span className="cnv-found-film-says">
          <b>{film.head}</b>
          {film.each ? <span>{film.each}</span> : null}
        </span>
        <span className="cnv-found-film-turn" aria-hidden="true">
          <Icon name="chevron-down" size={14} />
        </span>
      </summary>
      <ol className="cnv-found-shots">
        {film.shots.map((shot, index) => (
          <li key={shot.what} className="cnv-found-shot">
            <span className="cnv-found-n" aria-hidden="true">
              {index + 1}
            </span>
            <span className="cnv-found-shot-says">
              <b>{shot.what}</b>
              <span>{shot.how}</span>
            </span>
            {shot.seconds ? <span className="cnv-found-shot-len">{shot.seconds}</span> : null}
          </li>
        ))}
      </ol>
    </details>
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
  // review press rides the title's line, the input stays in every state), so nothing under it moves.
  const wordsFade = useSwapMotion(`${card.state}|${card.title}`);
  // What was found waits in the Library for a Keep: reviewed from the title that says so (Made's way there; the Library
  // itself shows them, so it has none).
  const review = card.state === "found" ? props.onLibrary : null;
  return (
    <Panel className="cnv-found" data-state={card.state} data-testid="cnv-found">
      <div className="cnv-found-head">
        <span className="cnv-found-three">{looking ? <AskLooking looking /> : <Icon name="three" size={26} />}</span>
        <div ref={wordsFade} className="cnv-found-said">
          <h2 className="cnv-found-title">{card.title}</h2>
          <p className="cnv-found-body">{card.body}</p>
        </div>
        {review ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={review}
            className="cnv-found-go"
            data-testid="cnv-found-library"
          >
            {CARD_SAYS.review}
            <Icon name="arrow-right" size={13} />
          </Button>
        ) : null}
      </div>
      {card.lines.length > 0 ? (
        <ul className="cnv-found-lines">
          {card.lines.map((line) => (
            <SourceLine key={line.place} line={line} />
          ))}
        </ul>
      ) : null}
      <AskLine
        about={ABOUT_CONTENT}
        onAsked={() => undefined}
        placeholder={card.ask.placeholder}
        lead={
          props.onAdd ? (
            <LinePress
              kind="attach"
              onClick={props.onAdd}
              aria-label={CARD_SAYS.addFromPhone}
              data-testid="cnv-found-add"
            >
              <Icon name="plus" size={15} />
            </LinePress>
          ) : null
        }
      />
      {props.onLibrary && card.film ? <FilmFold film={card.film} /> : null}
    </Panel>
  );
}
