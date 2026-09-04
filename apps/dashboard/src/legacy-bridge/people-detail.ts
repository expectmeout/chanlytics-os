import { toPersonVM, type PersonDetailDto, type PersonVM } from "@chanlytics/contracts";
import { fetchEnvelope, UnauthorizedError } from "./surface-data";

/**
 * The profile courier: `window.__personDetail(id)`.
 *
 * The list feeds the surface through the seam's globals; a profile is one
 * person in full — every message, call and decision — and is fetched when it
 * opens, the way the Inbox fetches an off-page escalation. The mockup's
 * ClientProfile (a classic script that cannot import) calls this and renders
 * the view model it gets back, so the mapping stays in contracts where it is
 * tested by execution.
 *
 * Resolves null for "not in your workspace" (404) so the page can say so;
 * a session expiry propagates as UnauthorizedError for the runner to handle.
 */
export async function personDetail(id: string): Promise<PersonVM | null> {
  try {
    const data = await fetchEnvelope<{ person: PersonDetailDto }>(`/api/v1/contacts/${encodeURIComponent(id)}`);
    return toPersonVM(data.person);
  } catch (e) {
    if (e instanceof UnauthorizedError) throw e;
    if (e instanceof Error && / -> 404$/.test(e.message)) return null;
    throw e;
  }
}

declare global {
  interface Window {
    __personDetail?: (id: string) => Promise<PersonVM | null>;
  }
}

export function installPeopleCourier(): void {
  window.__personDetail = personDetail;
}
