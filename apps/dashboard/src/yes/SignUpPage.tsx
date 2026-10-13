import { CONSENT_PHRASE, CONSENT_PHRASE_ES, type BusinessPageVM, type ConsentPageVM } from "@chanlytics/contracts";

/** How many services the page names before it sends the reader to the business's own page for the rest. */
const SERVICES_SHOWN = 6;

/**
 * A workspace's public "say yes" page, as markup: its view model, the business's own facts when its page publishes, and
 * the code as an SVG. Apart from its page (app/yes/[slug]/page.tsx, whose comment says what the page is for) so what it
 * draws, open and paused, is checked by rendering this with a fixture: a paused workspace's page keeps each ask's words
 * and terms and draws no way to say yes, no code and no paper form (the wiring's second audit, X4-1).
 */
export function SignUpPage({
  vm,
  business,
  qr,
  slug,
  businessName,
}: {
  vm: ConsentPageVM;
  business: BusinessPageVM | null;
  qr: string | null;
  slug: string;
  businessName: string;
}) {
  return (
    <main className="yes">
      <h1>{vm.title}</h1>
      <p className="yes-lead">{vm.lead}</p>

      {vm.asks.map((ask) => (
        <section className="yes-ask" key={ask.purpose} data-testid={`yes-ask-${ask.purpose}`}>
          <h2 className="yes-ask-title">{ask.title}</h2>
          <p className="yes-ask-lead">{ask.lead}</p>
          {ask.optional && (
            <p className="yes-ask-optional" data-testid="yes-optional">
              {ask.optional}
            </p>
          )}
          {ask.ways.length > 0 && (
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
          )}
          <ul className="yes-terms" data-testid={`yes-terms-${ask.purpose}`}>
            {ask.terms.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </section>
      ))}

      {qr && (
        <div className="yes-qr" data-testid="yes-qr">
          <div
            className="yes-qr-code"
            role="img"
            aria-label={`QR code that opens WhatsApp with ${CONSENT_PHRASE} ready to send`}
            dangerouslySetInnerHTML={{ __html: qr }}
          />
          <p className="yes-qr-note">
            Scanning this opens WhatsApp with <b>{CONSENT_PHRASE}</b> ready to send — the offers one. In Spanish,{" "}
            <b>{CONSENT_PHRASE_ES}</b> works too.
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
      {business && <YesWho business={business} privacy={vm.links.privacy} />}

      {/*
        The same two questions on paper, for a customer who would rather sign than
        text. It is also where a reviewer finds the paper form the filing describes.
      */}
      {vm.taking && (
        <p className="yes-foot" data-testid="yes-paper-link">
          Rather sign on paper? <a href={`/yes/${slug}/form`}>Print the sign-up form</a> — the same{" "}
          {vm.asks.length > 1 ? "questions" : "question"} on paper, each box signed on its own.
        </p>
      )}

      {/*
        Who is actually sending, spelled out. This page is the opt-in URL on
        every carrier registration, and a reviewer landing here has to be able
        to tell which business a customer is agreeing to hear from and who
        operates the sending. One campaign was already rejected for a website
        that "does not contain sufficient business information".
      */}
      <p className="yes-foot">
        Messages are answered by a receptionist operated by Chanlytics (RJ Capital LLC, 193 Jamaica Ave, Brooklyn, NY
        11207, <a href="tel:+19175746416">+1 (917) 574-6416</a>) on behalf of {businessName}.{" "}
        <a href={vm.links.privacy} data-testid="yes-privacy">
          Privacy
        </a>{" "}
        ·{" "}
        <a href={vm.links.terms} data-testid="yes-policy-terms">
          Terms
        </a>
      </p>
    </main>
  );
}

/**
 * WHO IS ASKING, as a reviewer reads it: the business's identity, what it does and what can be booked, from the view
 * model `/b/<slug>` publishes by, under the asks.
 */
function YesWho({ business, privacy }: { business: BusinessPageVM; privacy: string }) {
  return (
    <section className="yes-who" data-testid="yes-who">
      <h2 className="yes-ask-title">Who we are</h2>
      <ul data-testid="yes-who-identity">
        {business.identity.map((f) => (
          <li key={f.label}>
            <b>{f.label}</b>:{" "}
            {f.href ? (
              <a href={f.href} {...(f.href.startsWith("http") ? { rel: "noreferrer" } : {})}>
                {f.value}
              </a>
            ) : (
              f.value
            )}
          </li>
        ))}
      </ul>
      {/* What the business is before what can be booked: the ninth refusal (30919) asked for the business model. */}
      {(business.about || business.services.length > 0) && <h2 className="yes-ask-title">What we do</h2>}
      {business.about && (
        <p className="yes-who-about" data-testid="yes-who-about">
          {business.about}
        </p>
      )}
      {business.services.length > 0 && (
        <>
          <ul data-testid="yes-who-services">
            {business.services.slice(0, SERVICES_SHOWN).map((s) => (
              <li key={s.name}>
                {s.name}
                {s.detail ? ` — ${s.detail}` : ""}
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="yes-who-more">
        <a href={privacy} data-testid="yes-who-more">
          More about {business.title}
        </a>
      </p>
    </section>
  );
}
