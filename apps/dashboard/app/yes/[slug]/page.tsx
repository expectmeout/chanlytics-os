import type { Metadata } from "next";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { consentPageVM, CONSENT_PHRASE, CONSENT_PHRASE_ES } from "@chanlytics/contracts";
import { consentPageFor } from "@/server/consent-page";

/**
 * A workspace's public "say yes to offers" page.
 *
 * Two audiences, one page. A customer scans the QR at the desk or taps the
 * link in a bio, sees what they are agreeing to, and says yes in their own
 * message from their own phone — the strongest consent there is, and the
 * only kind this product records. A carrier reviewing the business's
 * registration opens the same URL and finds the wording they ask for.
 *
 * No form, no field, no write: a number typed into a box is not proof that
 * its owner agreed, and inventing one would be the only dishonest thing on
 * the page. Not indexed — it is for the people given the link, not for a
 * search result competing with the business's own site.
 */
export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function ConsentPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const facts = await consentPageFor(slug);
  if (!facts) notFound();
  const vm = consentPageVM(facts);
  const qr = vm.qrLink ? await QRCode.toString(vm.qrLink, { type: "svg", margin: 1, width: 190, errorCorrectionLevel: "M" }) : null;

  return (
    <main className="yes">
      <h1>{vm.title}</h1>
      <p className="yes-lead">{vm.lead}</p>

      {vm.ways.length > 0 && (
        <div className="yes-ways">
          {vm.ways.map((w) => (
            <div className="yes-way" key={w.kind} data-testid={`yes-way-${w.kind}`}>
              <div className="yes-way-body">
                <span className="yes-way-title">{w.title}</span>
                <span className="yes-way-sentence">{w.sentence}</span>
              </div>
              {w.href && (
                <a className="yes-btn" href={w.href} target="_blank" rel="noreferrer">
                  Say yes
                </a>
              )}
            </div>
          ))}
        </div>
      )}

      {qr && (
        <div className="yes-qr" data-testid="yes-qr">
          <div className="yes-qr-code" role="img" aria-label={`QR code that opens WhatsApp with ${CONSENT_PHRASE} ready to send`} dangerouslySetInnerHTML={{ __html: qr }} />
          <p className="yes-qr-note">
            Scanning this opens WhatsApp with the words ready to send. In Spanish, <b>{CONSENT_PHRASE_ES}</b> works too.
          </p>
        </div>
      )}

      <ul className="yes-terms" data-testid="yes-terms">
        {vm.terms.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>

      <p className="yes-foot">
        Messages are answered by a receptionist from Chanlytics on behalf of {facts.businessName}.{" "}
        <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a>
      </p>
    </main>
  );
}
