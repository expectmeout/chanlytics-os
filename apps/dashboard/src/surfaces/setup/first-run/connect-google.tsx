/**
 * Connect it to Google (decision 0073, R17; canvas 1B·g, 1B·h, 1B·i): after "That's us", for an owner who manages the
 * profile. Before Google's window, what one sign-in brings; Connect Google goes to it (and comes back to Your business,
 * `back: "start"`), Someone else manages it says who can add them, Not now goes on with the public listing watched
 * (GOOGLE_CONNECT_LATER, the member's own). Back from Google: what came in (the reviews, as the imports ledger counts
 * them; the hours; the services and prices the profile listed; new reviews on the bell), and Continue. An account that
 * manages no such location: who can add them, and the way on without it. Every word is contracts'.
 */
import { useEffect, useState } from "react";
import { FIRST_RUN_HELPERS, ratingWords, type ImportRowDto } from "@chanlytics/contracts";
import { googleVerbs } from "@/legacy-bridge/google";
import { Icon } from "../../kit/icon/icon";
import { gate, refusalToast, type LegacyFlash } from "../../legacy-verbs";
import { setupVerbs } from "../surface";
import { W } from "./words";

const G = FIRST_RUN_HELPERS.words.google;

/** Not now: Your business goes on, and Setup's Google row keeps Connect for later. */
async function notNow(flash: (f: LegacyFlash) => void, goOn: () => void): Promise<void> {
  const r = await setupVerbs.later(FIRST_RUN_HELPERS.googleConnectLater, { on: true, why: "answer" });
  if (!r.ok) return flash(refusalToast(r, W.find.notSaved));
  goOn();
}

/** What the browser came back from Google with, on Your business: connected, or an account that manages no such place. */
export type GoogleBack = "connected" | "not_manager";

/**
 * Google's answer, read once as the page opens (the callback's `?google=`, cleared as it is read): connected; an account
 * that manages no location of this business (several, none of them this one, is the same); or a refusal, said in the
 * toast as Connections says it, the ask staying on screen.
 */
export function useGoogleBack(flash: (f: LegacyFlash) => void): [GoogleBack | null, (b: GoogleBack | null) => void] {
  const [back, setBack] = useState<GoogleBack | null>(null);
  useEffect(() => {
    const o = googleVerbs.outcome();
    if (!o) return;
    if (o.outcome === "connected") return setBack("connected");
    if (o.outcome === "choose" || (o.why && G.notManagerWhy.includes(o.why))) return setBack("not_manager");
    const words = googleVerbs.outcomeWords;
    flash({ tone: "danger", msg: <>{(o.why && words[o.why]) || G.failed}</> });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on arrival: Google's answer is the address's, said once
  }, []);
  return [back, setBack];
}

/** Who can add the owner on Google, and the two ways on: another account, or without it. */
export function FrNotManager(o: {
  business: string | null;
  email: string | null;
  assistant: string | null;
  flash: (f: LegacyFlash) => void;
  goOn: () => void;
}) {
  return (
    <div className="fr-google" data-testid="fr-google-not-manager">
      <h2 className="fr-sub">{G.notManagerHeading}</h2>
      <p className="fr-sentence">{G.notManagerLead(o.business)}</p>
      <ol className="fr-steps">
        {G.notManagerSteps(o.business, o.email).map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ol>
      <p className="fr-detail">{G.notManagerUntil(o.assistant)}</p>
      <div className="fr-foot">
        <span />
        <button
          type="button"
          className="link-btn"
          onClick={() => void notNow(o.flash, o.goOn)}
          data-testid="fr-google-go-on"
        >
          {G.goOn}
        </button>
        <button
          type="button"
          className="btn btn-lg btn-primary fr-go"
          onClick={() => googleVerbs.connect({ back: "start" })}
          data-testid="fr-google-try-another"
          {...gate("settings", "connect Google")}
        >
          {G.tryAnother}
        </button>
      </div>
    </div>
  );
}

/** Before Google's window: the listing, what one sign-in brings, and the three ways on. */
export function FrConnectGoogle(o: {
  business: string | null;
  assistant: string | null;
  listing: { name: string; rating: number | null; review_count: number | null } | null;
  email: string | null;
  flash: (f: LegacyFlash) => void;
  goOn: () => void;
}) {
  const [someoneElse, setSomeoneElse] = useState(false);
  if (someoneElse)
    return <FrNotManager business={o.business} email={o.email} assistant={o.assistant} flash={o.flash} goOn={o.goOn} />;
  const l = o.listing;
  return (
    <div className="fr-google" data-testid="fr-google-connect">
      {l ? (
        <p className="fr-detail" data-testid="fr-google-listing">
          {[
            l.name,
            ratingWords(l.rating),
            l.review_count !== null ? `${l.review_count.toLocaleString()} reviews` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      ) : null}
      <ul className="fr-google-brings">
        {G.brings.map((t) => (
          <li key={t}>
            <Icon name="check" size={12} />
            <span>{t}</span>
          </li>
        ))}
      </ul>
      <p className="fr-detail">{G.note(o.assistant)}</p>
      <div className="fr-foot">
        <button type="button" className="link-btn" onClick={() => setSomeoneElse(true)} data-testid="fr-google-someone">
          {G.someoneElse}
        </button>
        <button
          type="button"
          className="link-btn"
          onClick={() => void notNow(o.flash, o.goOn)}
          data-testid="fr-google-not-now"
        >
          {G.notNow}
        </button>
        <button
          type="button"
          className="btn btn-lg btn-primary fr-go"
          onClick={() => googleVerbs.connect({ back: "start" })}
          data-testid="fr-google-connect-press"
          {...gate("settings", "connect Google")}
        >
          {G.connect}
        </button>
      </div>
    </div>
  );
}

/** Back from Google: what came in, a line each with where it stands, and Continue. */
export function FrGoogleConnected(o: {
  business: string | null;
  email: string | null;
  reviews: ImportRowDto | null;
  services: number;
  onContinue: () => void;
}) {
  const r = o.reviews;
  const back = r?.oldest ? new Date(r.oldest).getFullYear().toString() : null;
  const rows = [
    {
      key: "reviews",
      label: G.rows.reviews,
      says: G.reviewsSay(r?.counts.reviews ?? null, back, r?.counts.unanswered ?? null),
      stand: r?.state === "done" ? G.in : G.reading,
    },
    { key: "hours", label: G.rows.hours, says: G.hoursSay, stand: G.in },
    { key: "services", label: G.rows.services, says: G.servicesSay(o.services), stand: G.in },
    { key: "news", label: G.rows.news, says: G.newsSay, stand: G.on },
  ];
  return (
    <div className="fr-google" data-testid="fr-google-connected">
      <h2 className="fr-sub">{G.connectedHeading(o.business)}</h2>
      <p className="fr-detail">{G.connectedWho(o.email)}</p>
      <ul className="fr-imports">
        {rows.map((x) => (
          <li key={x.key} className="fr-import" data-testid={`fr-google-${x.key}`}>
            <span className="fr-import-words">
              <b>{x.label}</b>
              <span className="fr-detail">{x.says}</span>
            </span>
            <span className="fr-import-stand">{x.stand}</span>
          </li>
        ))}
      </ul>
      <p className="fr-detail">{G.replies}</p>
      <div className="fr-foot">
        <span />
        <button
          type="button"
          className="btn btn-lg btn-primary fr-go"
          onClick={o.onContinue}
          data-testid="fr-google-continue"
        >
          {W.continue}
        </button>
      </div>
    </div>
  );
}
