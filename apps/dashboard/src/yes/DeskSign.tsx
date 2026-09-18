import { CONSENT_PHRASE, CONSENT_PHRASE_ES, type DeskSignVM } from "@chanlytics/contracts";
import { PrintButton } from "./PrintButton";

/**
 * The desk sign, as markup: the view model, the code as an SVG, and the host its addresses are printed under.
 *
 * Apart from its page so it can be rendered without one -- the page reads a workspace with the service role, and
 * what a sign LOOKS like, on a screen and on paper, is checked by rendering this with a fixture.
 */
export function DeskSign({ vm, qr, host }: { vm: DeskSignVM; qr: string | null; host: string }) {
  if (vm.empty || !qr) {
    return (
      <main className="yes" data-testid="desk-sign-empty">
        <h1>{vm.business}</h1>
        <p className="yes-lead">{vm.emptyLine}</p>
      </main>
    );
  }
  return (
    <main className="sign-page">
      <div className="sign-bar" data-testid="desk-sign-bar">
        <p>Your desk sign: one sheet, Letter or A4.</p>
        <PrintButton label="Print the sign" />
      </div>
      <article className="sign-sheet" data-testid="desk-sign">
        <div className={vm.business.length > LONG_NAME ? "sign-body sign-long" : "sign-body"}>
          <p className="sign-business">{vm.business}</p>
          <h1 className="sign-headline">{vm.headline}</h1>
          <div
            className="sign-qr"
            data-testid="desk-sign-qr"
            role="img"
            aria-label={`QR code that opens WhatsApp with ${CONSENT_PHRASE} ready to send`}
            dangerouslySetInnerHTML={{ __html: qr }}
          />
          <p className="sign-how">{withPhrases(vm.how)}</p>
          {vm.byHand && <p className="sign-byhand">{withPhrases(vm.byHand)}</p>}
          <div className="sign-fine" data-testid="desk-sign-terms">
            <p>{vm.terms.join(" ")}</p>
            <p>{vm.operator}</p>
            <p>
              <span className="sign-addr">Privacy: {host}{vm.links.privacy}</span> · <span className="sign-addr">Terms: {host}{vm.links.terms}</span>
            </p>
          </div>
        </div>
      </article>
    </main>
  );
}

/**
 * Past this many characters the name takes a second line at the top and a line more in the small print, and the sheet
 * gives the room back from the code (globals.css .sign-long) so it still fits one sheet of Letter.
 */
const LONG_NAME = 44;

/** The words a customer sends, in bold wherever the sign says them: they are what to look for when WhatsApp opens. */
const PHRASES = new RegExp(`(${CONSENT_PHRASE}|${CONSENT_PHRASE_ES})`);
function withPhrases(text: string): React.ReactNode[] {
  return text.split(PHRASES).map((part, i) => (i % 2 ? <b key={i}>{part}</b> : part));
}
