/**
 * Your workspace, building (canvas 1B): beside Find and Connect it to Google, what is done, what waits on the owner and
 * what comes next, a line each: the workspace made, Google searched and what it found, the listing confirmed, the
 * Business Profile connected, the website read, the receptionist written. Each line is a fact the page already holds;
 * nothing is promised that no read stands behind. While Google is asked the confirming is said as a line to come, so the
 * list keeps its length when the answer lands. Every word is contracts' (FIRST_RUN_WORDS.building).
 */
import { FIRST_RUN_HELPERS } from "@chanlytics/contracts";
import { Icon } from "../../kit/icon/icon";

const B = FIRST_RUN_HELPERS.words.building;

/** A line's state: done, waiting on the owner (or on Google), or still to come. */
type LineState = "done" | "waiting" | "ahead";

interface BuildingFacts {
  name: string;
  /** Google's matches for the business: null while it is asked, undefined where Find is not on screen or got no answer. */
  matches: number | null | undefined;
  /** A listing is linked: the one Find confirmed, or one linked before. */
  linked: boolean;
  /** Offered here (a profile can be connected), and connected. */
  connectOffered: boolean;
  connected: boolean;
  /** The website: none to read (null), being read (false), read (true). */
  website: boolean | null;
  written: boolean;
}

function mark(state: LineState) {
  if (state === "done") return <Icon name="check" size={12} />;
  if (state === "waiting") return <span className="fr-pulse" aria-hidden="true" />;
  return <span className="fr-building-dot" aria-hidden="true" />;
}

export function FrBuilding({ f }: { f: BuildingFacts }) {
  const lines: Array<{ key: string; state: LineState; words: string }> = [
    { key: "made", state: "done", words: B.made(f.name) },
  ];
  if (!f.linked && f.matches !== undefined)
    lines.push({
      key: "found",
      state: f.matches === null ? "waiting" : "done",
      words: f.matches === null ? B.searching : B.found(f.matches),
    });
  if (f.linked) lines.push({ key: "confirm", state: "done", words: B.confirmed });
  else if (f.matches) lines.push({ key: "confirm", state: "waiting", words: B.confirm });
  else if (f.matches === null) lines.push({ key: "confirm", state: "ahead", words: B.confirmNext });
  if (f.connectOffered || f.connected)
    lines.push({ key: "connect", state: f.connected ? "done" : "ahead", words: f.connected ? B.connected : B.connect });
  if (f.website !== null)
    lines.push({ key: "website", state: f.website ? "done" : "ahead", words: f.website ? B.websiteRead : B.website });
  lines.push({ key: "write", state: f.written ? "done" : "ahead", words: f.written ? B.written : B.write });
  return (
    <section className="panel fr-pane fr-building" aria-label={B.title} data-testid="fr-building">
      <span className="fr-label">{B.title}</span>
      <ul className="fr-building-lines">
        {lines.map((l) => (
          <li key={l.key} className="fr-building-line" data-state={l.state} data-testid={`fr-building-${l.key}`}>
            <span className="fr-building-sign">{mark(l.state)}</span>
            <span>{l.words}</span>
          </li>
        ))}
      </ul>
      {!f.connected ? <p className="fr-detail">{B.note}</p> : null}
    </section>
  );
}
