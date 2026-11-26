/**
 * The one lead call another page makes too: Check again, which a sequence's People press as well
 * (decision 0131). Apart from the Leads surface so that a page reaching for it does not load the Leads page with it.
 */
import { api } from "@/bridge/api";

/** Check again (D3): the mailbox check once more for the addresses whose last check did not answer. */
export async function checkLeadsAgain(ids: string[]) {
  return api()("POST leads/check-again", {
    body: { ids },
    once: true,
  });
}
