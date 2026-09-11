import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { textingTermsVM } from "@chanlytics/contracts";
import { businessPageFor } from "@/server/business-page";

/**
 * A workspace's text-messaging terms: `/b/<slug>/terms`.
 *
 * Filed with the carriers as the campaign's TermsAndConditionsUrl -- a required
 * field since 30 June 2026 -- and read by a reviewer against a list of eight
 * things (the program's name and description, the rates disclosure, the
 * frequency, help, how to stop, a privacy link, carrier liability), each its own
 * error code since 15 September 2026. Chanlytics' /terms is a software
 * agreement for workspace owners and carries none of them, so filing it named
 * the wrong company's terms for the wrong reader. These are the business's own,
 * from the same record the brand was vetted on, beside the page filed as its
 * privacy policy.
 *
 * Public by the `/b/` prefix like its neighbour, indexed like it; it reads by
 * slug and writes nothing.
 */
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const facts = await businessPageFor(slug);
  const name = facts ? (facts.tradeName?.trim() || facts.legalName.trim()) : null;
  if (!name) return { robots: { index: false, follow: false } };
  return {
    title: `Text messaging terms: ${name}`,
    description: `The terms of the text messages ${name} sends.`,
    robots: { index: true, follow: true },
  };
}

export const dynamic = "force-dynamic";

/** HELP and STOP in bold, which the reviewers' guide asks of a program's terms. */
function Emphasised({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\bHELP\b|\bSTOP\b)/).map((part, i) => (part === "HELP" || part === "STOP" ? <b key={i}>{part}</b> : <span key={i}>{part}</span>))}
    </>
  );
}

export default async function TextingTermsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const facts = await businessPageFor(slug);
  if (!facts) notFound();
  const vm = textingTermsVM(facts);
  if (vm.empty) notFound();

  return (
    <main className="legal biz-public">
      <h1>{vm.title}</h1>
      <p className="legal-meta">{vm.lead}</p>
      <ul data-testid="bt-items">
        {vm.items.map((it) => (
          <li key={it.label}>
            <b>{it.label}</b>: <Emphasised text={it.text} />
          </li>
        ))}
      </ul>
      <p>
        Privacy policy: <a href={vm.privacyUrl} data-testid="bt-privacy">{vm.privacyUrl}</a>. These messages are sent for the business named
        above by a receptionist operated by Chanlytics (RJ Capital LLC, 193 Jamaica Ave, Brooklyn, NY 11207,{" "}
        <a href="tel:+19175746416">+1 (917) 574-6416</a>); what Chanlytics holds as their processor is in the{" "}
        <a href="/privacy">Chanlytics privacy policy</a>.
      </p>
    </main>
  );
}
