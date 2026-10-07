import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { consentFormMetadata, consentFormVM } from "@chanlytics/contracts";
import { consentPageFor } from "@/server/public/consent-page";
import { printableOrigin } from "@/server/origin";

/**
 * A workspace's "say yes" page, on paper.
 *
 * A yes to offers has to be WRITTEN — the carriers refuse a campaign whose
 * marketing opt-in relies on a spoken yes (Twilio lists it among the causes of
 * error 30913) — and a customer at the desk may not want to text anything. This
 * is the written way that is not a text: the page's two questions as two
 * separate boxes, printed unticked, each with the page's own disclosures and its
 * own signature. Staff record each signed box on the customer's profile as
 * "Sign-up form" and keep the sheet.
 *
 * It is also the evidence. The filing names this URL as the paper way to say
 * yes, and a reviewer can only accept a form they can see — so it is public for
 * the same reason the page beside it is, and not indexed for the same reason.
 *
 * Nothing on it is an input. It is printed and filled in by hand; a number typed
 * into a box on a web page is not proof that its owner agreed, and a signature
 * on paper in front of the business is the paper version of their own message.
 */
// Named as the sheet it is, for the business it asks for, or Not found (the wiring audit's N14 and N21). Never indexed;
// the rule is contracts'.
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  return consentFormMetadata(await consentPageFor(slug));
}
export const dynamic = "force-dynamic";

export default async function ConsentFormPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const facts = await consentPageFor(slug);
  if (!facts) notFound();
  const vm = consentFormVM(facts);
  // Printed, so its links are printed as addresses a person can type -- and
  // therefore NOT taken from the request's own headers. This sheet is the
  // carriers' evidence that the business asked properly; a host header chosen
  // by whoever fetched the page would print someone else's address as the
  // place to read the privacy policy. Only a host we actually answer on is
  // believed, and anything else falls back to the one on the filing.
  const h = await headers();
  const origin = printableOrigin(h.get("x-forwarded-proto"), h.get("x-forwarded-host") ?? h.get("host"));

  return (
    <main className="yes yes-paper">
      <h1>{vm.title}</h1>
      <p className="yes-lead">{vm.lead}</p>

      <div className="yes-paper-fields">
        {vm.fields.map((f) => (
          <div className="yes-paper-line" key={f}>
            {f}
          </div>
        ))}
      </div>

      {vm.sections.map((s) => (
        <section className="yes-ask yes-paper-section" key={s.purpose} data-testid={`form-${s.purpose}`}>
          <h2 className="yes-ask-title">{s.title}</h2>
          <p className="yes-paper-box">
            <span className="yes-paper-tick" aria-hidden="true" />
            <span>{s.box}</span>
          </p>
          {s.optional && <p className="yes-ask-optional">{s.optional}</p>}
          <ul className="yes-terms">
            {s.terms.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
          <div className="yes-paper-sign">
            <div className="yes-paper-line">{s.sign}</div>
            <div className="yes-paper-line">Date</div>
          </div>
        </section>
      ))}

      <ul className="yes-terms">
        {vm.terms.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>

      <p className="yes-paper-office">{vm.office}</p>

      <p className="yes-foot">
        Texts are sent for {facts.businessName} by a receptionist operated by Chanlytics (RJ Capital LLC). Privacy:{" "}
        <a href={vm.links.privacy}>
          {origin}
          {vm.links.privacy}
        </a>{" "}
        · Terms:{" "}
        <a href={vm.links.terms}>
          {origin}
          {vm.links.terms}
        </a>
      </p>
      <p className="yes-foot yes-paper-noprint">
        Print this page to use it as a form, or <a href={`/yes/${slug}`}>say yes by text instead</a>.
      </p>
    </main>
  );
}
