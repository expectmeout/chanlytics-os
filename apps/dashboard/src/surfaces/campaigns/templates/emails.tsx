/**
 * A reach-out's emails on Templates (moved from legacy/pages/messages.jsx, decision 0015; Reach out Part 4 PR 8, R19):
 * contracts' rows (emailTemplateRowsOf) over the reach_outs surface's chains, each a message with an email version
 * (../reach-out/email-message.tsx, step 5), opened in the pane beside the list and edited there, and found by their words
 * too. Unread is no row and no claim either way; a read that failed is said. "All approved" is WhatsApp's to say, of its
 * own rows. There is no "nothing on file" line: the starter set is always offered, a workspace with no WhatsApp number
 * included, so the list is never bare.
 */
import { LIBRARY_WORDS } from "@chanlytics/contracts";
import { FailedRead } from "../../kit/empty/empty";
import { surfaceValue } from "../../surface-values";
import { ReachOutEmailRow } from "../reach-out/email-message";
import type { ReachOutsSurface } from "../reach-out/override";
import { reachOuts } from "../reach-out/surface";

type Emails = ReturnType<typeof reachOuts.words.emailTemplateRowsOf>;

// A reach-out's emails, as rows: unread is none, and so is a read that failed.
export const tplEmails = (chains: ReachOutsSurface | undefined): Emails =>
  Array.isArray(chains) ? reachOuts.words.emailTemplateRowsOf(chains) : [];

// The head's hover: what the Library holds, and when the count takes a reach-out's email rows, contracts' sentence saying so.
export const tplHeadTip = (emails: Emails): string =>
  emails.length > 0
    ? `${LIBRARY_WORDS.headTip} ${reachOuts.words.EMAIL_TEMPLATE_LIST_WORDS.headTip(emails.length)}`
    : LIBRARY_WORDS.headTip;

export const tplEmailsMatching = (emails: Emails, needle: string): Emails =>
  emails.filter((t) => !needle || `${t.subject || ""} ${t.body} ${t.chain_name}`.toLowerCase().includes(needle));

export const tplAllApproved = (approved: number, shown: readonly unknown[], emails: Emails): boolean =>
  approved === shown.length && emails.length === 0;

// Under the list: the reach-outs' read that failed, said with its Retry. An unread one says nothing.
export function TplEmailsFailed() {
  // What the surface holds as this draws, as the JSX read `window.__REACH_OUTS` with no surface argument: the page
  // above subscribes to the surface, so this is drawn again whenever it moves.
  const chains = surfaceValue("reach_outs");
  return chains === null ? (
    <FailedRead
      kind="line"
      what={reachOuts.words.EMAIL_TEMPLATE_LIST_WORDS.failed}
      surface="reach_outs"
      testid="templates-email-failed"
    />
  ) : null;
}

/**
 * An email's key among the page's open messages: a WhatsApp message's is its own, and this one is told apart by its prefix.
 * A row is a step's email, so the key is the step's: two reach-outs' follow-ups on one template were one key, React drew
 * one row for both, and opening either opened the two (18 Oct 2026, the sample walk).
 */
const emailKey = (t: Emails[number]): string => `e:${t.step_id}`;

/** The email whose pane is open, by the page's key for the open message; none where the key is a message's, or it is gone. */
export const tplEmailOpen = (emails: Emails, openKey: string | null): Emails[number] | null =>
  (openKey && emails.find((t) => emailKey(t) === openKey)) || null;

interface TplEmailRowsProps {
  emails: Emails;
  openKey: string | null;
  onOpenKey: (key: string) => void;
}

export const TplEmailRows = ({ emails, openKey, onOpenKey }: TplEmailRowsProps) =>
  emails.map((t) => {
    const key = emailKey(t);
    return <ReachOutEmailRow key={key} t={t} open={openKey === key} onOpen={() => onOpenKey(key)} />;
  });
