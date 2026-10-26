/**
 * WhatsApp's approval at Go live (decision 0073, canvas 5B·g, 5C; R12, R21): on the number customers call, keeping the
 * WhatsApp Business app, Meta's own steps said before its window opens, what sharing the chat history brings and what not
 * sharing it means; on its own number, Meta's window at once. Skip keeps the choice as later. Drawn in Switch it on's list
 * and, where going live did not wait for it, on You're live. Meta's SDK is fetched as it opens, as Connections fetches it.
 */
import { useEffect, useState } from "react";
import { FIRST_RUN_HELPERS, formatPhoneDisplay, type WhatsappChoice } from "@chanlytics/contracts";
import { refusalToast, type LegacyFlash } from "../../../legacy-verbs";
import { waConnect } from "../../../settings/connections/whatsapp";
import { setupVerbs } from "../../surface";
import { W } from "../words";

const SO = FIRST_RUN_HELPERS.goLiveWords.switchOn;

/** WhatsApp's row, opened: Meta's steps for keeping the app first, or the window at once for its own number. */
export function WhatsappSteps(o: {
  choice: WhatsappChoice | null;
  number: string | null;
  flash: (f: LegacyFlash) => void;
}) {
  const [notShared, setNotShared] = useState(false);
  const [busy, setBusy] = useState(false);
  const keep = o.choice === "same";
  // Meta's SDK fetched as the row opens, as Connections fetches it (useSignupAhead): a phone's browser gives a page Meta's
  // window only inside the press itself, so the press must have it in hand. A door not ready fetches nothing of Meta's.
  useEffect(() => {
    void waConnect
      .config()
      .then((door) => {
        if (door.canConnect) waConnect.prepare(door);
      })
      .catch(() => {});
  }, []);
  const open = async () => {
    if (busy) return;
    setBusy(true);
    const r = await waConnect.start({ keepApp: keep });
    setBusy(false);
    if (!r.ok) o.flash({ tone: r.reason === "cancelled" ? "info" : "warn", msg: <>{r.message}</> });
    else void setupVerbs.peek();
  };
  const skip = async () => {
    const r = await setupVerbs.choose({ whatsapp: "later" });
    if (!r.ok) o.flash(refusalToast(r, W.find.notSaved));
  };
  return (
    <div className="fr-wa-steps" data-testid="fr-wa-steps">
      {keep ? (
        <>
          <h3 className="fr-sub">{SO.keepApp}</h3>
          <ol className="fr-steps">
            {SO.keepAppSteps(formatPhoneDisplay(o.number)).map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ol>
          <p className="fr-detail">{SO.keepAppAfter}</p>
          <button type="button" className="link-btn" aria-expanded={notShared} onClick={() => setNotShared((x) => !x)}>
            {SO.ifNot}
          </button>
          {notShared ? (
            <ul className="fr-notes" data-testid="fr-wa-not-shared">
              {SO.ifNotSays.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          ) : null}
        </>
      ) : null}
      <div className="fr-links">
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => void open()}
          aria-busy={busy || undefined}
          data-testid="fr-wa-open"
        >
          {keep ? SO.openMeta : SO.whatsappGo}
        </button>
        <button type="button" className="link-btn" onClick={() => void skip()} data-testid="fr-wa-skip">
          {SO.skipWhatsapp}
        </button>
      </div>
    </div>
  );
}
