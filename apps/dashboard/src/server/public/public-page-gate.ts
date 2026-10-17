import "server-only";

/**
 * Whether the address of a public page names nothing, decided in the proxy before the page renders.
 *
 * Under Cache Components a page's prerendered shell goes out first, with its 200, and the page's own `notFound()`
 * runs after it: Next cannot take the status back (its streaming guide, "The HTTP contract"). So `/yes/<unknown>`
 * answered 200 with the Not found page in it, a soft 404, and a carrier's check of `/b/<slug>` read an empty page as a
 * page that publishes (the closed-loop audit of 17 Oct 2026, D). The proxy asks first, and an address that names
 * nothing is the not-found page with a 404.
 *
 * The rules are the pages' own: the opt-in page, its paper form and its desk sign need the workspace's consent facts
 * (`consentPageFor`); the business's page and its texting terms need a record that says who the business is
 * (`businessPageVM`, `textingTermsVM`). The pages keep their own `notFound()` for their metadata and as the floor.
 */
import { businessPageVM, textingTermsVM, type BusinessPageFacts } from "@chanlytics/contracts";
import { businessPageFor } from "./business-page";
import { consentPageFor } from "./consent-page";

/** The reads the rules ask: the pages' own, or a test's. */
export interface PublicPageReads {
  consent: (slug: string) => Promise<unknown>;
  business: (slug: string) => Promise<BusinessPageFacts | null>;
}

const PAGES_READ: PublicPageReads = { consent: consentPageFor, business: businessPageFor };

/** Each public page under a slug, and whether a slug has it. */
const PAGES: { at: RegExp; has: (slug: string, read: PublicPageReads) => Promise<boolean> }[] = [
  { at: /^\/yes\/([^/]+)(?:\/(?:form|sign))?\/?$/, has: async (slug, read) => (await read.consent(slug)) !== null },
  {
    at: /^\/b\/([^/]+)\/?$/,
    has: async (slug, read) => {
      const facts = await read.business(slug);
      return !!facts && !businessPageVM(facts).empty;
    },
  },
  {
    at: /^\/b\/([^/]+)\/terms\/?$/,
    has: async (slug, read) => {
      const facts = await read.business(slug);
      return !!facts && !textingTermsVM(facts).empty;
    },
  },
];

/**
 * True when `path` is a public page's address and no page answers to its slug. False for any other address, and for a
 * read that failed: the page then answers as it would, and a page that cannot read a fact fails as a page.
 */
export async function publicPageNamesNothing(path: string, read: PublicPageReads = PAGES_READ): Promise<boolean> {
  for (const page of PAGES) {
    const m = page.at.exec(path);
    if (!m) continue;
    let slug: string;
    try {
      slug = decodeURIComponent(m[1] ?? "");
    } catch {
      return true;
    }
    try {
      return !(await page.has(slug, read));
    } catch {
      return false;
    }
  }
  return false;
}
