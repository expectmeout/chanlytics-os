import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { businessPageVM } from "@chanlytics/contracts";
import { businessPageFor } from "@/server/business-page";

/**
 * A workspace's own public page: who they are, what they do, and their text
 * terms.
 *
 * WHO READS IT. A carrier reviewer, opening the URL filed as a campaign's
 * website and privacy policy, checking two things they have already refused this
 * product for: that the page identifies a real business (30919) and that it sits
 * on the same domain as the opt-in page (30907). And a customer, following a
 * link, wanting to know who is texting them.
 *
 * WHY WE HOST IT. Most salons have a Facebook page and a Booksy link. Asking
 * them for a website that names their legal entity and a privacy policy carrying
 * carrier-required SMS language is not a requirement they can meet, and it is
 * the single biggest gap between signing up and texting working. So the facts
 * they already gave us — the same ones the carriers vetted on the brand — are
 * published here, on the domain the opt-in page is already on.
 *
 * The floor, not the ceiling: a business with its own website has it linked
 * here, and keeps filing it.
 *
 * INDEXED, unlike `/yes/<slug>`. This one is meant to be findable — a business
 * that cannot be looked up is what 30919 was complaining about.
 */
/**
 * The title is the BUSINESS, not the product.
 *
 * This page is indexed and it is filed with the carriers as a business's
 * website. A reviewer's tab, a search result and a link preview all read the
 * title first, and "Chanlytics OS" on a page that exists to identify Melany's
 * Beauty Salon is the same failure as the page saying nothing at all.
 */
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const facts = await businessPageFor(slug);
  const name = facts ? (facts.tradeName?.trim() || facts.legalName.trim()) : null;
  if (!name) return { robots: { index: false, follow: false } };
  return {
    title: name,
    description: `${name} — who we are, what we do, and our text-message terms.`,
    robots: { index: true, follow: true },
  };
}

export const dynamic = "force-dynamic";

export default async function BusinessPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const facts = await businessPageFor(slug);
  if (!facts) notFound();
  const vm = businessPageVM(facts);
  if (vm.empty) notFound();

  return (
    <main className="legal biz-public">
      <h1>{vm.title}</h1>
      <p className="legal-meta">{vm.lead}</p>

      <h2>Who we are</h2>
      <ul data-testid="bp-identity">
        {vm.identity.map((f) => (
          <li key={f.label}>
            <b>{f.label}</b>:{" "}
            {f.href ? <a href={f.href} {...(f.href.startsWith("http") ? { rel: "noreferrer" } : {})}>{f.value}</a> : f.value}
          </li>
        ))}
      </ul>

      {vm.services.length > 0 && (
        <>
          <h2>What we do</h2>
          <ul data-testid="bp-services">
            {vm.services.map((s) => (
              <li key={s.name}>{s.name}{s.detail ? <span className="legal-meta"> — {s.detail}</span> : null}</li>
            ))}
          </ul>
        </>
      )}

      {/*
        The clauses, from contracts, so this page and Chanlytics' own privacy
        policy cannot drift. Two copies of a compliance sentence is one copy
        that will be edited and one that will not.
      */}
      <h2>Text messages</h2>
      <p data-testid="bp-sms-lead">{vm.smsLead}</p>
      <ul data-testid="bp-sms-clauses">
        {vm.smsClauses.map((c) => <li key={c}>{c}</li>)}
      </ul>
      <p>
        To say yes, or to see exactly what you would be agreeing to, open{" "}
        <a href={vm.optInUrl} data-testid="bp-opt-in">the sign-up page</a>. Saying yes to messages about your own
        appointments and saying yes to offers are two separate choices, and either can be declined without
        affecting the other.
      </p>

      <h2>Your data</h2>
      <p>
        Messages to {vm.title} are answered by a receptionist operated by Chanlytics (RJ Capital LLC,
        193 Jamaica Ave, Brooklyn, NY 11207, <a href="tel:+19175746416">+1 (917) 574-6416</a>) on their behalf.
        What is held, why, and how to have it removed is in the{" "}
        <a href="/privacy">Chanlytics privacy policy</a>; the terms of the service are in the{" "}
        <a href="/terms">Chanlytics terms</a>. Questions about {vm.title}&rsquo;s own handling of your data go to
        them at the address above.
      </p>
    </main>
  );
}
