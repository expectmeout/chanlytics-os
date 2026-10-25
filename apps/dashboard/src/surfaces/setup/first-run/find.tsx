/**
 * Find (canvas R1, P1; moved from legacy/pages/first-run.jsx, decision 0015): what Google has for the business, asked on
 * arrival with the name on record -- the receptionist's, or the one typed at sign-up (the search route falls back to it).
 * The best match first and chosen, the others under it (on a phone, behind "Not this one? Search again"); one press links
 * the one chosen, or the owner says they are not on Google, which puts Google's row off (their saved view) and leaves
 * the step's rows -- or, where Find was asked for by name, goes to the step's own address (`done`). The step is Find only
 * for an owner, who alone may search and link. The toast is the page's (`flash`): a link ends Find as the surfaces repaint.
 *
 * The candidates are the kit's choice of a few, each with the line under it (the record kit's group, one above the
 * other); the search its box and button; the step's two presses stand in the step's foot, where every step's do.
 */
import { useEffect, useState, type ReactNode } from "react";
import type { FIRST_RUN_WORDS, GoogleCandidateDto } from "@chanlytics/contracts";
import { googleVerbs } from "@/legacy-bridge/google";
import { StatePill } from "../../kit/pill/state-pill";
import { RecordBox, RecordToggleGroup } from "../../kit/record/field";
import { canDo, gate, refusalToast, type LegacyFlash } from "../../legacy-verbs";
import { setupVerbs } from "../surface";

type FindWords = (typeof FIRST_RUN_WORDS)["find"];

/** What Google said: the candidates, the words it was asked, whether they were the owner's, and why it could not. */
interface Found {
  ok: boolean;
  candidates: GoogleCandidateDto[];
  query: string;
  ownWords: boolean;
  message: string;
}

interface FindProps {
  W: FindWords;
  flash: (f: LegacyFlash) => void;
  done: string | null;
  go: (to: string) => void;
  make: () => void;
  /** What Google found, for Your workspace, building beside Find: asked (null), the count, or no answer (undefined). */
  onFound?: (n: number | null | undefined) => void;
}

/** A choice's words with what marks it beside them (the best match, the way most businesses take): a state's pill. */
export function markedLabel(words: string, mark: string | null): ReactNode {
  if (!mark) return words;
  return (
    <span className="fr-opt">
      {words}
      <StatePill kind="setup" value="ready" label={mark} />
    </span>
  );
}

/** The candidates as one choice: the best first, chosen, with its pill; under them, the one chosen on Google's map. */
function hitsOf(o: {
  W: FindWords;
  hits: GoogleCandidateDto[];
  picked: string | null;
  setPicked: (id: string) => void;
  busy: boolean;
}) {
  const { W, hits, picked, setPicked, busy } = o;
  const chosen = hits.find((c) => c.place_id === picked) ?? null;
  return (
    <div className="panel fr-pane">
      <div className="fr-stack">
        <RecordToggleGroup<string>
          id="fr-find-hits"
          label={W.pick}
          value={picked}
          options={hits.map((c, i) => ({
            value: c.place_id,
            label: markedLabel(c.name, i === 0 ? W.best : null),
            hint: [c.category, c.address || W.noAddress].filter(Boolean).join(" · "),
          }))}
          onChange={setPicked}
          readOnly={busy}
          testid="fr-find-hits"
        />
      </div>
      {chosen && chosen.maps_uri ? (
        <a className="link-btn" href={chosen.maps_uri} target="_blank" rel="noreferrer" data-testid="fr-find-maps">
          {W.maps}
        </a>
      ) : null}
    </div>
  );
}

/**
 * What Find says above the candidates: reading, a failure with its retry, nothing found, or the owner's own words. While
 * Google is asked the pane its answer comes in stands already and says so, as tall as the answer usually is, so what is
 * under it holds still when it lands (first-run.css .fr-find-looking).
 */
function findNotes(W: FindWords, found: Found | null, busy: boolean, ask: (words: string | null) => void) {
  const hits = found ? found.candidates : [];
  return (
    <>
      {found === null ? (
        <div className="panel fr-pane fr-find-looking" role="status" data-testid="fr-find-reading">
          <span className="fr-pulse" aria-hidden="true" />
          <span className="fr-note">{W.reading}</span>
        </div>
      ) : null}
      {found && !found.ok ? (
        <p className="fr-note" role="alert" data-testid="fr-find-failed">
          {found.message}{" "}
          <button
            type="button"
            className="link-btn"
            onClick={() => ask(found.ownWords ? found.query : null)}
            disabled={busy}
            data-testid="fr-find-retry"
          >
            {W.retry}
          </button>
        </p>
      ) : null}
      {found && found.ok && hits.length === 0 ? (
        <p className="fr-note" data-testid="fr-find-none">
          {W.none(found.query)}
        </p>
      ) : null}
      {found && found.ok && hits.length > 0 && found.ownWords ? (
        <p className="fr-note">{W.typed(found.query)}</p>
      ) : null}
    </>
  );
}

export const FrFind = ({ W, flash, done, go, make, onFound }: FindProps) => {
  // null while Google is asked; then what it said: the candidates, the words it was asked, whether they were the owner's.
  const [found, setFound] = useState<Found | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [words, setWords] = useState("");
  const [busy, setBusy] = useState(false);
  // A phone shows the best match alone until the owner asks for more (canvas P1).
  const [more, setMore] = useState(false);
  const askGoogle = async (ownWords: string | null) => {
    const G = googleVerbs;
    setBusy(true);
    onFound?.(null);
    const r = await G.find(ownWords || undefined);
    setBusy(false);
    onFound?.(r.ok ? r.candidates.length : undefined);
    setFound(
      r.ok
        ? { ok: true, candidates: r.candidates, query: r.query, ownWords: !!ownWords, message: "" }
        : { ok: false, candidates: [], query: ownWords || "", ownWords: !!ownWords, message: r.message },
    );
    const best = r.ok ? r.candidates[0] : undefined;
    setPicked(best ? best.place_id : null);
  };
  useEffect(() => {
    void askGoogle(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on arrival: Google is asked by the name on file, then by the owner's words
  }, []);
  const searchWords = words.replace(/\s+/g, " ").trim();
  const search = (e: { preventDefault(): void }) => {
    e.preventDefault();
    if (busy || searchWords.length < 3) return;
    void askGoogle(searchWords);
  };
  const linkPicked = async () => {
    const c = found && found.candidates.find((x) => x.place_id === picked);
    const G = googleVerbs;
    if (!c || busy || !canDo("settings")) return;
    setBusy(true);
    const r = await G.link(c.place_id);
    setBusy(false);
    flash(r.ok ? { tone: "ok", msg: <>{W.linked(c.name, r.read)}</> } : refusalToast(r, W.notLinked));
    // "Yes, this is us": the receptionist is set up from what Google says, where none is yet.
    if (r.ok) make();
  };
  const notOnGoogle = async () => {
    if (busy) return;
    setBusy(true);
    const r = await setupVerbs.later("google", true);
    setBusy(false);
    if (!r.ok) {
      flash(refusalToast(r, W.notSaved));
      return;
    }
    // Not on Google: the receptionist is set up with the name typed at sign-up, and Check asks for the rest.
    make();
    if (done) go(done);
  };
  const hits = found ? found.candidates : [];
  return (
    <div
      className="fr-find"
      data-testid="fr-find"
      data-hits={hits.length > 0 ? "true" : undefined}
      data-more={more ? "true" : undefined}
    >
      {findNotes(W, found, busy, (w) => void askGoogle(w))}
      {hits.length > 0 ? hitsOf({ W, hits, picked, setPicked, busy }) : null}
      {hits.length > 0 && !more ? (
        <button
          type="button"
          className="link-btn fr-find-more"
          onClick={() => setMore(true)}
          data-testid="fr-find-more"
        >
          {W.more}
        </button>
      ) : null}
      <form className="fr-find-form" role="search" onSubmit={search}>
        <RecordBox
          id="fr-find-words"
          label={W.search}
          value={words}
          onChange={setWords}
          placeholder={W.search}
          maxLength={200}
          testid="fr-find-words"
        />
        <button className="btn" type="submit" disabled={busy || searchWords.length < 3} data-testid="fr-find-search">
          {W.searchCta}
        </button>
      </form>
      <p className="fr-legal">
        <a className="link-btn" href="/terms">
          {W.terms}
        </a>
        <span aria-hidden="true"> · </span>
        <a className="link-btn" href="/privacy">
          {W.privacy}
        </a>
      </p>
      <div className="fr-foot">
        <span />
        <button type="button" className="link-btn" onClick={notOnGoogle} disabled={busy} data-testid="fr-find-not">
          {W.notOnGoogle}
        </button>
        {/* Drawn while Google is asked too, held, so the foot does not change as its answer lands. */}
        {found === null || hits.length > 0 ? (
          <button
            type="button"
            className="btn btn-lg btn-primary fr-go"
            onClick={linkPicked}
            disabled={busy || !picked}
            aria-busy={busy || undefined}
            data-testid="fr-find-yes"
            {...gate("settings", "link the listing")}
          >
            {W.yes}
          </button>
        ) : null}
      </div>
    </div>
  );
};
