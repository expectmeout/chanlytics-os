/**
 * A reach-out's emails on Templates (moved from legacy/pages/messages.jsx, decision 0015; Reach out Part 4 PR 8, R19):
 * contracts' rows (emailTemplateRowsOf) over the reach_outs surface's chains, drawn by their own row
 * (../reach-out/email-row.tsx) and found by their words too. Unread is no row and no claim either way; a read that
 * failed is said. "All approved" is WhatsApp's to say, of its own rows.
 */
import type { Dispatch, SetStateAction } from "react";
import { EmptyState, FailedRead } from "../../kit/empty/empty";
import { surfaceValue } from "../../surface-values";
import { EmailTemplateRow } from "../reach-out/email-row";
import type { ReachOutsSurface } from "../reach-out/surface";
import { reachOuts } from "../reach-out/surface";

type Emails = ReturnType<typeof reachOuts.words.emailTemplateRowsOf>;

// A reach-out's emails, as rows: unread is none, and so is a read that failed.
export const tplEmails = (chains: ReachOutsSurface | undefined): Emails =>
  Array.isArray(chains) ? reachOuts.words.emailTemplateRowsOf(chains) : [];

// The head's hover: WhatsApp's, and when the count takes email rows, contracts' sentence saying so.
const TPL_WHATSAPP_TIP =
  "What the receptionist and your campaigns send on WhatsApp, as the customer sees it. Written here or in WhatsApp Manager, WhatsApp approves either way, usually within minutes. A marketing template can only go to people who said yes to offers.";
export const tplHeadTip = (emails: Emails): string =>
  emails.length > 0
    ? `${TPL_WHATSAPP_TIP} ${reachOuts.words.EMAIL_TEMPLATE_LIST_WORDS.headTip(emails.length)}`
    : TPL_WHATSAPP_TIP;

export const tplEmailsMatching = (emails: Emails, needle: string): Emails =>
  emails.filter((t) => !needle || `${t.subject || ""} ${t.body} ${t.chain_name}`.toLowerCase().includes(needle));

export const tplAllApproved = (approved: number, shown: readonly unknown[], emails: Emails): boolean =>
  approved === shown.length && emails.length === 0;

interface TplNothingProps {
  hasWhatsApp: boolean;
  customN: number;
  emails: Emails;
}

// Under the list: the reach-outs' read that failed, said with its Retry; else "Nothing on file yet." only when every
// kind was read and holds nothing -- an email-only workspace has its rows, and an unread one is not empty.
export function TplNothing({ hasWhatsApp, customN, emails }: TplNothingProps) {
  // What the surface holds as this draws, as the JSX read `window.__REACH_OUTS` with no surface argument: the page
  // above subscribes to the surface, so this is drawn again whenever it moves.
  const chains = surfaceValue("reach_outs");
  if (chains === null) {
    return (
      <FailedRead
        kind="line"
        what={reachOuts.words.EMAIL_TEMPLATE_LIST_WORDS.failed}
        surface="reach_outs"
        testid="templates-email-failed"
      />
    );
  }
  return !hasWhatsApp && customN === 0 && emails.length === 0 && Array.isArray(chains) ? (
    <EmptyState kind="line" title="Nothing on file yet." testid="templates-nothing" />
  ) : null;
}

interface TplEmailRowsProps {
  emails: Emails;
  openKey: string | null;
  setOpenKey: Dispatch<SetStateAction<string | null>>;
}

export const TplEmailRows = ({ emails, openKey, setOpenKey }: TplEmailRowsProps) =>
  emails.map((t) => {
    const key = `e:${t.template_id}`;
    return (
      <EmailTemplateRow
        key={key}
        t={t}
        open={openKey === key}
        onOpen={() => setOpenKey((k) => (k === key ? null : key))}
      />
    );
  });
