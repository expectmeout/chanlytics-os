/**
 * Find (canvas R1, P1; moved from legacy/pages/first-run.jsx, decision 0015): what Google has for the business, asked on
 * arrival with the name on record -- the receptionist's, or the one typed at sign-up (the search route falls back to it).
 * The best match first and checked, the others under it (on a phone, behind "Not this one? Search again"); one press links
 * the one checked, or the owner says they are not on Google, which puts Google's row off (their saved view) and leaves
 * the step's rows -- or, where Find was asked for by name, goes to the step's own address (`done`). The step is Find only
 * for an owner, who alone may search and link. The toast is the page's (`flash`): a link ends Find as the surfaces repaint.
 */
import { useEffect, useState } from "react";
import type { FIRST_RUN_WORDS, GoogleCandidateDto } from "@chanlytics/contracts";
import { canDo, gate, refusalToast, type LegacyFlash } from "../../legacy-verbs";
import { googleVerbs } from "@/legacy-bridge/google";
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
}

/** The candidates as a radiogroup: the best first, checked, with its pill. */
function hitsOf(o: {
  W: FindWords;
  hits: GoogleCandidateDto[];
  picked: string | null;
  setPicked: (id: string) => void;
  busy: boolean;
}) {
  const { W, hits, picked, setPicked, busy } = o;
  return (
    <div className="fr-find-hits" role="radiogroup" aria-label={W.pick}>
      {hits.map((c, i) => (
        <label key={c.place_id} className={i === 0 ? "fr-find-hit is-best" : "fr-find-hit"} data-testid="fr-find-hit">
          <input
            type="radio"
            name="fr-find"
            value={c.place_id}
            checked={picked === c.place_id}
            onChange={() => setPicked(c.place_id)}
            disabled={busy}
          />
          <span className="fr-find-body">
            <span className="fr-find-name">{c.name}</span>
            <span className="fr-find-where">{[c.category, c.address || W.noAddress].filter(Boolean).join(" · ")}</span>
            {c.maps_uri ? (
              <a className="fr-find-maps" href={c.maps_uri} target="_blank" rel="noreferrer">
                {W.maps}
              </a>
            ) : null}
          </span>
          {i === 0 ? <span className="pill pill-ok fr-find-best">{W.best}</span> : null}
        </label>
      ))}
    </div>
  );
}

/** What Find says above the candidates: reading, a failure with its retry, nothing found, or the owner's own words. */
function findNotes(W: FindWords, found: Found | null, busy: boolean, ask: (words: string | null) => void) {
  const hits = found ? found.candidates : [];
  return (
    <>
      {found === null ? (
        <p className="fr-find-note" role="status" data-testid="fr-find-reading">
          {W.reading}
        </p>
      ) : null}
      {found && !found.ok ? (
        <p className="fr-find-note" role="alert" data-testid="fr-find-failed">
          {found.message}{" "}
          <button
            type="button"
            className="fr-find-link"
            onClick={() => ask(found.ownWords ? found.query : null)}
            disabled={busy}
            data-testid="fr-find-retry"
          >
            {W.retry}
          </button>
        </p>
      ) : null}
      {found && found.ok && hits.length === 0 ? (
        <p className="fr-find-note" data-testid="fr-find-none">
          {W.none(found.query)}
        </p>
      ) : null}
      {found && found.ok && hits.length > 0 && found.ownWords ? (
        <p className="fr-find-note">{W.typed(found.query)}</p>
      ) : null}
    </>
  );
}

export const FrFind = ({ W, flash, done, go, make }: FindProps) => {
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
    const r = await G.find(ownWords || undefined);
    setBusy(false);
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
          className="fr-find-link fr-find-more"
          onClick={() => setMore(true)}
          data-testid="fr-find-more"
        >
          {W.more}
        </button>
      ) : null}
      <form className="fr-find-search" role="search" onSubmit={search}>
        <input
          className="fr-find-input"
          value={words}
          onChange={(e) => setWords(e.target.value)}
          placeholder={W.search}
          aria-label={W.search}
          maxLength={200}
          data-testid="fr-find-words"
        />
        <button
          type="submit"
          className="btn btn-sm"
          disabled={busy || searchWords.length < 3}
          data-testid="fr-find-search"
        >
          {W.searchCta}
        </button>
      </form>
      <div className="fr-find-acts">
        {hits.length > 0 ? (
          <button
            type="button"
            className="fr-onward"
            onClick={linkPicked}
            disabled={busy || !picked}
            aria-busy={busy || undefined}
            data-testid="fr-find-yes"
            {...gate("settings", "link the listing")}
          >
            {W.yes}
          </button>
        ) : null}
        <button type="button" className="fr-find-link" onClick={notOnGoogle} disabled={busy} data-testid="fr-find-not">
          {W.notOnGoogle}
        </button>
      </div>
      <p className="fr-find-legal">
        <a href="/terms">{W.terms}</a>
        <span aria-hidden="true"> · </span>
        <a href="/privacy">{W.privacy}</a>
      </p>
    </div>
  );
};
