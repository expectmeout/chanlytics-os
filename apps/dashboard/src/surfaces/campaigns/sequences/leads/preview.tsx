/**
 * Preview as a real lead (the lead-to-sequence canvas's board D): one step's email as each lead in it gets it, ‹ › through
 * them, drawn whole by the part the lead sheet draws it with (place/email-as.tsx): from, to, subject, its words with each
 * value marked where it came from, the opening as the line written for them when it goes, and what holds it. Nobody in
 * it yet: an example business, said so. The emails the check held stand under it, one press from the Leads tab. Its foot
 * is the test: the step as this lead gets it, to your own inbox (step-sheet.tsx).
 */
import {
  LEAD_BUILD_WORDS as W,
  REACH_OUT_LANGUAGE,
  chainFirstSender,
  coldEndingOf,
  emailFoot,
  leadDraftChainOf,
  leadPreviewEmailOf,
  sequenceRoute,
  whyFrom,
  type LeadCardLead,
  type SequenceRecordDto,
} from "@chanlytics/contracts";
import { Button } from "../../../kit/button/button";
import { Icon } from "../../../kit/icon/icon";
import { LinkButton } from "../../../kit/link-button/link-button";
import { navigate } from "../../../legacy-verbs";
import { surfaceValue } from "../../../surface-values";
import { brainOf } from "../../templates/words";
import { EmailAs } from "../place/email-as";
import { cardLeadOf, exampleCardLead, useLeadRow, workspaceOf, type PreviewLead } from "./reads";
import type { LeadChain } from "./use-chain";

interface PreviewProps {
  rec: SequenceRecordDto;
  lc: LeadChain;
  place: number;
  leads: readonly PreviewLead[];
  at: number;
  onAt: (at: number) => void;
}

/** Who it is from: the name it signs with, and the inbox or the mailbox its next email leaves (0077). */
function fromOf(lc: LeadChain): string | null {
  const name = lc.draft.signed_by.trim();
  const box = lc.draft.owner_sends ? W.yourInbox : (chainFirstSender(lc.chain, lc.draft.mailbox_ids)?.address ?? null);
  return [name, box].filter(Boolean).join(" · ") || null;
}

/**
 * How this step's email ends under its words, as the send ends it (0077, contracts coldEndingOf): the name, or the
 * mailbox's own signature where the sequence chose it. An email its owner sends ends with the name alone: their mail app
 * adds their signature.
 */
function endingOf(lc: LeadChain, place: number): string | null {
  const words = lc.draft.steps[place - 1];
  if (!words || words.hand) return null;
  const e = coldEndingOf({
    signsWith: lc.draft.signs_with,
    signedBy: lc.draft.signed_by,
    signature: lc.draft.owner_sends
      ? null
      : (chainFirstSender(lc.chain, lc.draft.mailbox_ids)?.signature?.words ?? null),
    first: place === 1,
    body: words.body,
  });
  return e.signature ?? e.signOff;
}

/**
 * The foot the send writes under this lead's email (the edge's request builder: why they hear from you by how they were
 * found, your business and address, how to stop), or none while the address is not set: the send refuses then, and How
 * it runs says so.
 */
function previewFootOf(lead: LeadCardLead, businessName: string | null): string | null {
  const brain = brainOf(surfaceValue("settings")?.settings);
  const address = typeof brain.profile?.address === "string" ? brain.profile.address.trim() : "";
  const business = (businessName ?? "").trim();
  if (!business || !address) return null;
  try {
    return emailFoot(
      business,
      address,
      { kind: "cold", why: whyFrom(lead.source ?? "local_businesses"), unsubscribeUrl: null },
      REACH_OUT_LANGUAGE,
    );
  } catch {
    return null;
  }
}

export function LeadPreview({ rec, lc, place, leads, at, onAt }: PreviewProps) {
  const one = leads[at] ?? null;
  const row = useLeadRow(one?.id ?? null);
  const lead = row ? cardLeadOf(row) : one ? null : exampleCardLead();
  const workspace = workspaceOf(lc.draft.signed_by);
  const email = lead
    ? leadPreviewEmailOf({ chain: leadDraftChainOf(lc.chain, lc.draft), lead, workspace, place })
    : null;
  const name = one ? one.name || row?.business_name || "" : (lead?.business_name ?? "");
  const held = rec.sequence.needs.held;
  return (
    <div className="ld-pre" data-testid="ld-preview">
      <div className="ld-pre-who">
        <span className="ld-pre-name" data-testid="ld-preview-who">
          {one ? W.previewOf(name, at + 1, leads.length) : name}
        </span>
        {leads.length > 1 ? (
          <span className="ld-pre-step">
            <Button
              iconOnly
              variant="quiet"
              size="sm"
              aria-label={W.prev}
              disabled={at === 0}
              onClick={() => onAt(at - 1)}
              data-testid="ld-preview-prev"
            >
              <span className="ld-flip">
                <Icon name="chevron" size={14} />
              </span>
            </Button>
            <Button
              iconOnly
              variant="quiet"
              size="sm"
              aria-label={W.next}
              disabled={at >= leads.length - 1}
              onClick={() => onAt(at + 1)}
              data-testid="ld-preview-next"
            >
              <Icon name="chevron" size={14} />
            </Button>
          </span>
        ) : null}
      </div>
      {one ? null : <p className="ld-note">{W.example}</p>}
      {email && lead ? (
        <EmailAs
          email={email}
          whole
          from={fromOf(lc)}
          ending={endingOf(lc, place)}
          foot={previewFootOf(lead, workspace.businessName)}
          testid="ld-preview-email"
        />
      ) : null}
      {held > 0 ? (
        <p className="ld-pre-held" data-testid="ld-preview-held">
          <Icon name="alert" size={13} />
          <span>{W.heldLine(held)}</span>
          <LinkButton onClick={() => navigate(sequenceRoute(rec.sequence.id, "people"))} data-testid="ld-preview-show">
            {W.show}
          </LinkButton>
        </p>
      ) : null}
    </div>
  );
}
