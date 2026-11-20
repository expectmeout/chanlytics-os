-- Each small draft is counted apart (the AI audit, 20 Nov 2026).
--
-- A lead's first email, a list from the owner's words, a message to a person, a campaign's draft and the check that reads
-- whether a person's words are a yes to a card all ride the small JSON route (lead_json: one model, one fallback, one
-- bound), and until now the ledger kept all five as lead_json, so what each cost could not be read. ai_usage.purpose takes
-- each as its own (contracts SMALL_JSON_PURPOSES); the route stays one. Rows written before keep lead_json.
-- Deploy order: this first. An edge that writes a new purpose before it is applied still answers the call; only the
-- ledger's row is refused (ai_usage_write_failed). Re-runnable.

set local lock_timeout = '3s';

-- contracts AI_USAGE_PURPOSES (ai/hearing.ts): 00656's set, with the small JSON calls last.
alter table public.ai_usage drop constraint if exists ai_usage_purpose_check;
alter table public.ai_usage add constraint ai_usage_purpose_check
  check (purpose in ('receptionist', 'reply_draft', 'ask', 'lead_json', 'template_draft', 'review_reply',
                     'lead_judge', 'note_suggest', 'reach_out_check', 'reply_read', 'booking_read', 'lead_suggest',
                     'ask_journal', 'receptionist_review', 'fix_route', 'website_read', 'sender_read', 'file_look',
                     'preview_starters', 'ad_draft', 'file_words', 'file_hear', 'lead_draft', 'list_draft',
                     'person_draft', 'sequence_draft', 'yes_check'));
