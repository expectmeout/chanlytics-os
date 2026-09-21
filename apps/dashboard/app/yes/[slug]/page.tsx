import type { Metadata } from "next";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { businessPageVM, consentPageMetadata, consentPageVM, CONSENT_PHRASE, CONSENT_PHRASE_ES } from "@chanlytics/contracts";
import { consentPageFor } from "@/server/consent-page";
import { businessPageFor } from "@/server/business-page";

/** How many services the page names before it sends the reader to the business's own page for the rest. */
const SERVICES_SHOWN = 6;

/**
 * A workspace's public "say yes" page.
 *
 * Two audiences, one page. A customer scans the QR at the desk or taps the
 * link in a bio, sees what they are agreeing to, and says yes in their own
 * message from their own phone — the strongest consent there is, and the
 * only kind this product records. A carrier reviewing the business's
 * registration opens the same URL and finds the wording they ask for.
 *
 * TWO ASKS. It used to be one — "Text YES OFFERS … Sending it is your yes" —
 * covering offers, news AND appointment reminders together, and the carriers
 * refused the campaign for exactly that (error 30913: "marketing consent was
 * combined with other consents"). Each ask now stands on its own with its own
 * keyword and its own disclosures, and the promotional one says in its own words
 * that it is optional and changes nothing if declined.
 *
 * No form, no field, no write: a number typed into a box is not proof that
 * its owner agreed, and inventing one would be the only dishonest thing on
 * the page. Not indexed — it is for the people given the link, not for a
 * search result competing with the business's own site.
 */
// Named for the business the customer is agreeing to hear from, in the page's own heading, or Not found when no
// workspace answers to the slug (the wiring audit's N14 and N21). Never indexed; the rule is contracts'.
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  return consentPageMetadata(await consentPageFor(slug));
}
export const dynamic = "force-dynamic";

export default async function ConsentPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const facts = await consentPageFor(slug);
  if (!facts) notFound();
  const vm = consentPageVM(facts);
  // The business's own facts, by the rule `/b/<slug>` publishes by: a record too thin to identify anybody shows nothing.
  const record = await businessPageFor(slug);
  const who = record ? businessPageVM(record) : null;
  const business = who && !who.empty ? who : null;
  const qr = vm.qrLink ? await QRCode.toString(vm.qrLink, { type: "svg", margin: 1, width: 190, errorCorrectionLevel: "M" }) : null;

  return (
    <main className="yes">
      <h1>{vm.title}</h1>
      <p className="yes-lead">{vm.lead}</p>

      {vm.asks.map((ask) => (
        <section className="yes-ask" key={ask.purpose} data-testid={`yes-ask-${ask.purpose}`}>
          <h2 className="yes-ask-title">{ask.title}</h2>
          <p className="yes-ask-lead">{ask.lead}</p>
          {ask.optional && <p className="yes-ask-optional" data-testid="yes-optional">{ask.optional}</p>}
          <div className="yes-ways">
            {ask.ways.map((w) => (
              <div className="yes-way" key={w.kind} data-testid={`yes-way-${ask.purpose}-${w.kind}`}>
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
          <ul className="yes-terms" data-testid={`yes-terms-${ask.purpose}`}>
            {ask.terms.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </section>
      ))}

      {qr && (
        <div className="yes-qr" data-testid="yes-qr">
          <div className="yes-qr-code" role="img" aria-label={`QR code that opens WhatsApp with ${CONSENT_PHRASE} ready to send`} dangerouslySetInnerHTML={{ __html: qr }} />
          <p className="yes-qr-note">
            Scanning this opens WhatsApp with <b>{CONSENT_PHRASE}</b> ready to send — the offers one. In Spanish, <b>{CONSENT_PHRASE_ES}</b> works too.
          </p>
        </div>
      )}

      <ul className="yes-terms" data-testid="yes-terms">
        {vm.terms.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>

      {/*
        WHO IS ASKING, as a reviewer reads it. This URL is what a carrier opens as
        the business's website as well as its opt-in page, and the eighth refusal
        of the live campaign (30919, 21 Sep 2026) was for exactly this page: it
        "does not clearly identify the business, such as the business name,
        contact details, or a description of the services you provide". All three
        were one link away on `/b/<slug>`, and a reviewer does not follow links.
        So they are here too, from the same view model, under the asks: a customer
        came to say yes and reads that first.
      */}
      {business && (
        <section className="yes-who" data-testid="yes-who">
          <h2 className="yes-ask-title">Who we are</h2>
          <ul data-testid="yes-who-identity">
            {business.identity.map((f) => (
              <li key={f.label}>
                <b>{f.label}</b>:{" "}
                {f.href ? <a href={f.href} {...(f.href.startsWith("http") ? { rel: "noreferrer" } : {})}>{f.value}</a> : f.value}
              </li>
            ))}
          </ul>
          {business.services.length > 0 && (
            <>
              <h2 className="yes-ask-title">What we do</h2>
              <ul data-testid="yes-who-services">
                {business.services.slice(0, SERVICES_SHOWN).map((s) => (
                  <li key={s.name}>{s.name}{s.detail ? ` — ${s.detail}` : ""}</li>
                ))}
              </ul>
            </>
          )}
          <p className="yes-who-more">
            <a href={vm.links.privacy} data-testid="yes-who-more">More about {business.title}</a>
          </p>
        </section>
      )}

      {/*
        The same two questions on paper, for a customer who would rather sign than
        text. It is also where a reviewer finds the paper form the filing describes.
      */}
      <p className="yes-foot" data-testid="yes-paper-link">
        Rather sign on paper? <a href={`/yes/${slug}/form`}>Print the sign-up form</a> — the same {vm.asks.length > 1 ? "questions" : "question"} on paper, each box signed on its own.
      </p>

      {/*
        Who is actually sending, spelled out. This page is the opt-in URL on
        every carrier registration, and a reviewer landing here has to be able
        to tell which business a customer is agreeing to hear from and who
        operates the sending. One campaign was already rejected for a website
        that "does not contain sufficient business information".
      */}
      <p className="yes-foot">
        Messages are answered by a receptionist operated by Chanlytics (RJ Capital LLC, 193 Jamaica Ave, Brooklyn, NY 11207,{" "}
        <a href="tel:+19175746416">+1 (917) 574-6416</a>) on behalf of {facts.businessName}.{" "}
        <a href={vm.links.privacy} data-testid="yes-privacy">Privacy</a> · <a href={vm.links.terms} data-testid="yes-policy-terms">Terms</a>
      </p>
    </main>
  );
}
