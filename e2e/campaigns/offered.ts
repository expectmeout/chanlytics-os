import {
  APPOINTMENT_WORDS,
  CONSENT_CHANNELS,
  LIFECYCLE_WORDS,
  PLAYBOOK_TRIGGERS,
  campaignMessagesOf,
  compareTemplates,
  groupTemplates,
  isLibrarySample,
  sendableTemplates,
  templateSlots,
  type CampaignMessage,
  type CampaignMessageRow,
  type TemplateGroup,
} from "../../packages/contracts/src/index";

/**
 * What the Campaigns specs expect the pages to draw of the workspace's messages, worked out from the rows by the rules
 * contracts holds and the pages apply, so the same expectation holds on a workspace with a WhatsApp number and on one with
 * none: a message is a name in a language with a version on each channel it was written for (campaignMessagesOf), and a
 * message needs no WhatsApp row. Nothing here assumes a channel.
 */

/** A template row as GET /api/v1/templates answers it, as far as a picker reads it. */
export interface TemplateRow extends CampaignMessageRow {
  variables: unknown;
  source?: string | null;
}

/** GET /api/v1/templates's body, as far as the composers and the Library read it. */
export interface TemplatesRead {
  templates: TemplateRow[];
  /**
   * The messages the route makes of EVERY row of the workspace, a WhatsApp version still in review among their versions;
   * where the answer holds none, messagesOf makes them of `templates`.
   */
  messages?: CampaignMessage[];
}

/**
 * The workspace's messages: the route's own where it answers them, else made of the rows it answered, as the pages do
 * (parts/channels.ts cmOfferedMessages). The route's are the ones to read, because a message's standing is in rows the
 * composers' list leaves out: a message whose WhatsApp version the workspace hid is hidden whole, and one whose WhatsApp
 * version is still in review is offered by the email beside it, which the rows the list keeps (approved, not hidden) cannot tell.
 */
export const messagesOf = (read: TemplatesRead): CampaignMessage[] =>
  read.messages ?? campaignMessagesOf(read.templates);

/** What a composer may fill a slot from: a broadcast has no visit and no proposal, a playbook's moment says. */
export interface SlotRule {
  visits: boolean;
  bookingLink: boolean;
  proposal: boolean;
}

/** The broadcast composer's rule (broadcasts/page/words.ts bcSlots): no visit's time or service, no proposal's link. */
export const broadcastSlots = (bookingLink: boolean): SlotRule => ({ visits: false, bookingLink, proposal: false });

/**
 * A playbook composer's rule for the moment it is on (playbooks/composer-model.ts): a visit moment has a visit and the
 * follow-up of a proposal has its link. The moment is the one the picker says, as its sentence names the people it reaches
 * ("everyone with an appointment tomorrow", in whichever word the workspace uses: contracts LIFECYCLE_WORDS.compose.sentence
 * .who), or by its label (contracts PLAYBOOK_TRIGGERS).
 */
export function momentSlots(face: string, bookingLink: boolean): SlotRule {
  const said = (t: (typeof PLAYBOOK_TRIGGERS)[number]) =>
    APPOINTMENT_WORDS.some((word) => LIFECYCLE_WORDS.compose.sentence.who(t.id, word) === face);
  const byWho = PLAYBOOK_TRIGGERS.filter(said);
  // Else the longest label the face holds, and every moment that goes by it ("Win-back" is two moments, each of a list).
  const longest = Math.max(0, ...PLAYBOOK_TRIGGERS.filter((t) => face.includes(t.label)).map((t) => t.label.length));
  const named =
    byWho.length > 0 ? byWho : PLAYBOOK_TRIGGERS.filter((t) => t.label.length === longest && face.includes(t.label));
  if (named.length === 0) throw new Error(`the moment "${face}" is none of contracts' PLAYBOOK_TRIGGERS`);
  const kinds = new Set(named.map((t) => t.kind));
  return { visits: kinds.has("visit"), bookingLink, proposal: kinds.has("deal") };
}

/**
 * The row a message's words are drawn from, under the message's own id: the anchor's, else the first of its rows in the
 * product's order of channels (parts/channels.ts cmOfferedMessages).
 */
function wordsRowOf(rows: readonly TemplateRow[], m: CampaignMessage): TemplateRow | null {
  const own = rows.filter((r) => r.name === m.name && r.language === m.language);
  return (
    own.find((r) => r.id === m.anchor.id) ??
    CONSENT_CHANNELS.flatMap((c) => own.filter((r) => r.channel === c))[0] ??
    null
  );
}

/**
 * What a composer's picker lists, in the order it lists it, and the one sentence under it for what cannot go out from here:
 * every message that is offered (not hidden, at least one channel held), and one whose WhatsApp version is approved but
 * cannot go whole (a picture for a heading) and holds nothing else, which is listed to say why it is not offered; in the
 * library's order, left with those whose every slot the composer can fill (contracts templateSlots), and one option a message
 * whatever languages it has.
 */
export function messagesOffered(
  read: TemplatesRead,
  how: SlotRule,
): { groups: TemplateGroup<TemplateRow>[]; why: string | null } {
  const rows = messagesOf(read).flatMap((m) => {
    const whatsapp = m.versions.whatsapp;
    const blockedAlone = !m.hidden && whatsapp !== null && whatsapp.status === "approved" && whatsapp.blocked !== null;
    const row = wordsRowOf(read.templates, m);
    if (!(m.offered || blockedAlone) || !row) return [];
    return [{ ...row, title: m.title, category: m.category, blocked: m.offered ? null : (whatsapp?.blocked ?? null) }];
  });
  const { sendable, why } = sendableTemplates(rows.sort(compareTemplates));
  return {
    groups: groupTemplates(
      sendable.filter((t) => templateSlots({ name: t.name, variables: t.variables }, how) !== null),
    ),
    why,
  };
}

/**
 * What the Library lists of the workspace's messages (templates/group.ts listingOf): a row to each starter of the set
 * offered here, whatever of it the workspace holds; a row to each name the workspace wrote or synced, whatever languages and
 * channels it holds, and a fold for what it hid. Meta's sample is never one.
 */
export function libraryRows(
  messages: readonly CampaignMessage[],
  starterNames: readonly string[],
): { starterRows: number; customRows: number; hidden: boolean } {
  const written = messages.filter((m) => !isLibrarySample(m.name) && !starterNames.includes(m.name));
  return {
    starterRows: starterNames.length,
    customRows: new Set(written.filter((m) => !m.hidden).map((m) => m.name)).size,
    hidden: written.some((m) => m.hidden),
  };
}
