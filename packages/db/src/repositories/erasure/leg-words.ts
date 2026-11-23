/**
 * The legs an erasure runs (decision 0036), each named once with where it is written: what the erasure registry beside
 * this (registry.ts) names a column's strategy by, and what people/erasure/erasure-registry.test.mjs holds every named
 * leg to. Moved out of the registry on 21 Nov 2026 so each holds one thing.
 */
export const ERASURE_LEGS = {
  erase_contact:
    "erase_contact: the person's calls (and a review of one, by its key: 00476), messages, conversations and identities deleted, scheduled jobs and decision payloads scrubbed, the tombstone written (00027, 00151)",
  notes_trigger:
    "person_notes_erase_on_contact: their own notes deleted, the old notes field cleared, a note_for_you about them removed (00158)",
  events_trigger: "contact_events_on_erase: an event that named them cut to who did it and from where (00131)",
  consent_trigger:
    "erase_marketing_consent, consent_channels_on_erase, email_marketing_on_erase: their answers and where they came from cleared (00101)",
  email_trigger: "contact_email_on_erase: the address and why it was suppressed cleared (00125)",
  proposal_trigger: "contact_proposal_on_erase: the proposal's link cleared",
  deals_trigger: "deals_erase_on_contact: a deal's note, evidence and link cleared",
  leads_trigger:
    "leads_erase_on_contact: their lead blanked (lead_blank), its places deleted, a reach-out's opening and a preference's example cleared (00391), its drafts cleared (00429), a company's people and key cleared and its domain kept as a digest (00430), its keys kept as digests; one of several people at a business takes only their own address, number and the call's note from it (lead_person_leg, 00413); a person named at any company leaves it, its drafts to them cleared and their address kept as a digest (lead_person_forget, 00430)",
  preview_trigger:
    "lead_previews_erase_with_their_lead: a lead blanked or erased ends its preview, what the business wrote to it and said was not right cleared and its workspace erased, unless it was made theirs (00497)",
  signer_trigger:
    "person_signer_erase_on_contact: the name and title a reply's reading found as its signer, and what became of it, cleared (00413)",
  recipients_trigger:
    "sequence_sends_on_erase: the words each batch kept for them, a visit's time, service and key and a proposal's link, cleared (00391, 00440)",
  jobs_scrub:
    "scrubErasedJobs and erase_contact: a job's payload that carried their number or words overwritten, and its error cleared",
  ask_scrub:
    "scrub_ask_for_contact: the assistant's turns that name them deleted (00238), and the lines Ask remembers and the days of its journal that name them (00470)",
  deliveries_scrub: "provider_events_scrub: a kept delivery that names them deleted (00336)",
  notes_scrub: "person_notes_scrub: their numbers and addresses overwritten in other people's notes (00341)",
  turns_scrub:
    "model_turns_scrub: the receptionist's kept turns that name them, in anyone's thread, deleted (00401); their own went with their conversation",
  appointments_scrub:
    "appointments_scrub: their visits keep their time and service and lose the client's name, number, address and note; the notices that made them, and any whose subject names them, lose the name (00345)",
  before_trigger:
    "contacts_before_erased: what another system said of them before Chanlytics (a client file's visits, last visit and birthday) cleared (00477)",
  mailbox_trigger:
    "mailbox_senders_on_erase: their address off the list of what a connected mailbox left, and a person said of it with it, and what Chanlytics read them to be (00495); what was said of a robot stays (00483)",
  form_entries_trigger:
    "form_entries_erase_on_contact: every form entry they sent deleted (00675); form_entries_held_erase_on_contact: an entry held for a look, which has no person yet, deleted by the address or the number typed into it (00680)",
  touches_trigger:
    "touches_erase_on_contact: their touches of a post or a link keep only that they happened, of what and when; who, which thread and message, and what they wrote (a comment's words and their name there) are emptied (00696)",
} as const;

export type ErasureLeg = keyof typeof ERASURE_LEGS;
