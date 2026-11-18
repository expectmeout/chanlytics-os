-- A preview's first questions are counted apart (decision 0079, amended 18 November 2026).
--
-- The questions a lead's own preview offers first are written for its business by the model as the preview is built:
-- one short read, on the preview's own workspace. ai_usage.purpose takes preview_starters, so what they cost is a line
-- of the ledger of its own and never mixed into the website's read.
-- Deploy order: this first. An edge that asks before it is applied still gets its answer; only the ledger's row is
-- refused (ai_usage_write_failed). Re-runnable.

set local lock_timeout = '3s';

-- contracts AI_USAGE_PURPOSES (ai/hearing.ts): 00556's set, with the preview's first questions last of Anthropic's.
alter table public.ai_usage drop constraint if exists ai_usage_purpose_check;
alter table public.ai_usage add constraint ai_usage_purpose_check
  check (purpose in ('receptionist', 'reply_draft', 'ask', 'lead_json', 'template_draft', 'review_reply',
                     'lead_judge', 'note_suggest', 'reach_out_check', 'reply_read', 'booking_read', 'lead_suggest',
                     'ask_journal', 'receptionist_review', 'fix_route', 'website_read', 'sender_read', 'file_look',
                     'preview_starters', 'file_words', 'file_hear'));
