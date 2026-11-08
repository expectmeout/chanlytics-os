-- 00557 · Every link between tables has an index.
--
-- 77 links from one table to another had no index that served them (decision 0111, layer 8 of the backend review):
-- a delete of the parent row, or a change of its key, read the whole child table to find what pointed at it, and a join
-- from the parent read it too. Production is small today, so each build here takes milliseconds; at full volume deleting
-- one person's account would have read every note, decision and send for the column naming who wrote it. This file
-- indexes the 70 links on the quiet tables; the six on the busy tables (messages, calls, contacts, conversations) are
-- 00558-00563, each CONCURRENTLY and alone. jobs.kind stays unindexed, named with why in tests/repo/data/_data.mjs.
--
-- A link that carries the workspace beside its parent is indexed workspace first, as the house's indexes are; a column
-- that may be empty is indexed where it is not, so the index holds only rows that point somewhere.
--
-- Additive and re-runnable.

set local lock_timeout = '3s';

create index if not exists ai_usage_user on public.ai_usage (user_id) where user_id is not null;
create index if not exists appointments_conversation on public.appointments (tenant_id, conversation_id) where conversation_id is not null;
create index if not exists appointments_created_by on public.appointments (created_by) where created_by is not null;
create index if not exists ask_memory_lines_forgotten_by on public.ask_memory_lines (forgotten_by) where forgotten_by is not null;
create index if not exists ask_memory_lines_kept_by on public.ask_memory_lines (kept_by) where kept_by is not null;
create index if not exists ask_memory_lines_thread on public.ask_memory_lines (tenant_id, thread_id) where thread_id is not null;
create index if not exists ask_messages_user on public.ask_messages (user_id);
create index if not exists ask_mornings_thread on public.ask_mornings (tenant_id, thread_id) where thread_id is not null;
create index if not exists ask_mornings_user on public.ask_mornings (user_id);
create index if not exists ask_voice_sessions_tenant on public.ask_voice_sessions (tenant_id);
create index if not exists billing_events_tenant on public.billing_events (tenant_id);
create index if not exists capability_activations_activated_by on public.capability_activations (activated_by) where activated_by is not null;
create index if not exists conversation_drafts_made_by on public.conversation_drafts (made_by) where made_by is not null;
create index if not exists deals_created_by on public.deals (created_by) where created_by is not null;
create index if not exists deals_lead on public.deals (tenant_id, lead_id) where lead_id is not null;
create index if not exists decisions_actor_user on public.decisions (actor_user_id) where actor_user_id is not null;
create index if not exists decisions_undo_of on public.decisions (tenant_id, undo_of) where undo_of is not null;
create index if not exists escalations_resolved_by_user on public.escalations (resolved_by_user_id) where resolved_by_user_id is not null;
create index if not exists event_outbox_tenant on public.event_outbox (tenant_id);
create index if not exists fact_suggestions_conversation on public.fact_suggestions (tenant_id, conversation_id) where conversation_id is not null;
create index if not exists fact_suggestions_decided_by on public.fact_suggestions (decided_by) where decided_by is not null;
create index if not exists files_created_by on public.files (created_by) where created_by is not null;
create index if not exists invitations_invited_by on public.invitations (invited_by) where invited_by is not null;
create index if not exists lead_judgments_round on public.lead_judgments (tenant_id, round_id);
create index if not exists lead_judgments_tenant on public.lead_judgments (tenant_id);
create index if not exists lead_operations_tenant on public.lead_operations (tenant_id);
create index if not exists lead_runs_tenant on public.lead_runs (tenant_id);
create index if not exists lead_searches_adds_to on public.lead_searches (tenant_id, adds_to) where adds_to is not null;
create index if not exists lead_searches_created_by on public.lead_searches (created_by) where created_by is not null;
create index if not exists mailbox_senders_set_by on public.mailbox_senders (set_by) where set_by is not null;
create index if not exists memberships_tenant on public.memberships (tenant_id);
create index if not exists notifications_recipient_user on public.notifications (recipient_user_id) where recipient_user_id is not null;
create index if not exists partner_earnings_tenant on public.partner_earnings (tenant_id);
create index if not exists partner_invitations_invited_by on public.partner_invitations (invited_by) where invited_by is not null;
create index if not exists partner_payouts_sent_by on public.partner_payouts (sent_by) where sent_by is not null;
create index if not exists partner_tenants_handover_accepted_by on public.partner_tenants (handover_accepted_by) where handover_accepted_by is not null;
create index if not exists partner_tenants_invited_by on public.partner_tenants (invited_by) where invited_by is not null;
create index if not exists partner_tenants_standing_by on public.partner_tenants (standing_by) where standing_by is not null;
create index if not exists partners_second_factor_reset_by on public.partners (second_factor_reset_by) where second_factor_reset_by is not null;
create index if not exists partners_status_by on public.partners (status_by) where status_by is not null;
create index if not exists person_notes_author_user on public.person_notes (author_user_id) where author_user_id is not null;
create index if not exists person_notes_deal on public.person_notes (tenant_id, deal_id) where deal_id is not null;
create index if not exists person_notes_done_by on public.person_notes (done_by) where done_by is not null;
create index if not exists person_notes_for_user on public.person_notes (for_user_id) where for_user_id is not null;
create index if not exists person_notes_kept_by on public.person_notes (kept_by) where kept_by is not null;
create index if not exists platform_claims_user on public.platform_claims (user_id);
create index if not exists privacy_requests_created_by on public.privacy_requests (created_by) where created_by is not null;
create index if not exists privacy_requests_tenant on public.privacy_requests (tenant_id);
create index if not exists rehearsals_created_by on public.rehearsals (created_by) where created_by is not null;
create index if not exists reply_turns_tenant on public.reply_turns (tenant_id);
create index if not exists segment_members_added_by on public.segment_members (added_by) where added_by is not null;
create index if not exists segments_created_by on public.segments (created_by) where created_by is not null;
create index if not exists sequence_batches_created_by on public.sequence_batches (created_by) where created_by is not null;
create index if not exists sequence_batches_offered_from on public.sequence_batches (tenant_id, offered_from) where offered_from is not null;
create index if not exists sequence_batches_template on public.sequence_batches (tenant_id, template_id) where template_id is not null;
create index if not exists sequence_enrollments_left_by on public.sequence_enrollments (left_by) where left_by is not null;
create index if not exists sequence_replies_answered_message on public.sequence_replies (tenant_id, answered_message_id) where answered_message_id is not null;
create index if not exists sequence_replies_said_by on public.sequence_replies (said_by) where said_by is not null;
create index if not exists sequence_replies_send on public.sequence_replies (tenant_id, send_id) where send_id is not null;
create index if not exists sequence_replies_undone_by on public.sequence_replies (undone_by) where undone_by is not null;
create index if not exists sequence_sends_said_by on public.sequence_sends (said_by) where said_by is not null;
create index if not exists sequence_steps_created_by on public.sequence_steps (created_by) where created_by is not null;
create index if not exists sequence_steps_next_template on public.sequence_steps (tenant_id, next_template_id) where next_template_id is not null;
create index if not exists sequence_steps_template on public.sequence_steps (tenant_id, template_id) where template_id is not null;
create index if not exists sequences_created_by on public.sequences (created_by) where created_by is not null;
create index if not exists support_reports_user on public.support_reports (user_id);
create index if not exists templates_created_by on public.templates (created_by) where created_by is not null;
create index if not exists tenant_config_updated_by on public.tenant_config (updated_by) where updated_by is not null;
create index if not exists tenant_config_versions_changed_by on public.tenant_config_versions (changed_by) where changed_by is not null;
create index if not exists waitlist_invited_by on public.waitlist (invited_by) where invited_by is not null;
