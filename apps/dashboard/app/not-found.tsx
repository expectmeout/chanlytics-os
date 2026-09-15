import type { Metadata } from "next";
import { pageTitle } from "@chanlytics/contracts";

/**
 * What an address that names nothing shows: a business's page or opt-in page under a slug no workspace has, a
 * mistyped address, an old link. It was Next's bare default page, with nothing of Chanlytics on it and no way on (the
 * wiring audit's N21). The public pages are the ones a customer reaches from a link someone sent, so it says what to do
 * about that; everyone else is a sign-in away.
 *
 * Static and reads nothing, like the legal pages whose look it borrows.
 */
export const metadata: Metadata = { title: pageTitle(["Not found"]) };

export default function NotFound() {
  return (
    <main className="legal">
      <h1>This page isn&rsquo;t here</h1>
      <p>The address may be mistyped, or the link may be out of date. If a business sent it to you, ask them for the current link.</p>
      <p className="legal-foot">Chanlytics OS · <a href="/login">Sign in</a> · <a href="https://www.chanlytics.com" target="_blank" rel="noreferrer">chanlytics.com</a></p>
    </main>
  );
}
