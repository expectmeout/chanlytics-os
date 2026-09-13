-- The floor is uniform.
--
-- Four tables are the service role's alone -- RLS on, zero policies, so a
-- session is denied every row -- but never revoked Supabase's default
-- SELECT/INSERT/UPDATE/DELETE from anon and authenticated, while their three
-- siblings did (rate_hits 00059, waitlist 00088, operator_pages 00105). And
-- nine policies were written without a TO clause, so they apply to PUBLIC,
-- which includes anon, while every other live policy -- fifty-six of them;
-- sixty-three of the seventy-two ever written -- says `to authenticated`.
--
-- Consistency, not exposure. Each of the nine predicates keys on auth.uid(),
-- which is null for anon, so PUBLIC read zero rows; and RLS with no policy
-- denies every row whatever the grant says. Nothing here closes a leak. But a
-- floor can be audited at a glance only when it reads the same everywhere: a
-- revoke beside every deny-all table, `to authenticated` on every policy, and
-- a tenancy suite that proves the privilege (a member is refused with 42501,
-- not answered with an empty list), so the next table that turns on RLS and
-- forgets the revoke is named by the suite instead of read as safe. After
-- this, `select count(*) from pg_policies where schemaname = 'public' and
-- roles = '{public}'` is zero.
--
-- What does NOT change: nothing changes for any caller that exists; the
-- predicates are untouched. `alter policy ... to authenticated` changes only
-- the roles a policy applies to and leaves its USING and WITH CHECK
-- byte-for-byte as written, which is why it is used here over
-- drop-and-recreate (its first use in this repository). service_role keeps
-- its own grants and bypasses RLS; the edge, the heartbeat and the sweeps
-- write these four tables under it today. Every function whose body names
-- them is SECURITY DEFINER (claim_job, fail_job, erase_contact, the trigger_*
-- sweeps, sweep_health, claim_due_jobs, jobs_backlog, is_platform_admin,
-- platform_admin_add, sweep_mark_alerted, request_sweep, note_sweep_backlog)
-- except two trigger functions, jobs_guard (00098) and sweep_status_registered
-- (00107), which fire only on writes these roles could never make. So no
-- SECURITY INVOKER read turns from "zero rows" into a raise.

revoke all on public.billing_events  from public, anon, authenticated;
revoke all on public.jobs            from public, anon, authenticated;
revoke all on public.platform_admins from public, anon, authenticated;
revoke all on public.sweep_status    from public, anon, authenticated;

alter policy invitations_member_read        on public.invitations      to authenticated;
alter policy policies_member_read           on public.policies         to authenticated;
alter policy policies_owner_update          on public.policies         to authenticated;
alter policy policies_owner_insert_person   on public.policies         to authenticated;
alter policy policies_owner_delete_person   on public.policies         to authenticated;
alter policy policies_acting_member_update  on public.policies         to authenticated;
alter policy tenant_config_member_read      on public.tenant_config    to authenticated;
alter policy tenant_config_owner_update     on public.tenant_config    to authenticated;
alter policy billing_accounts_member_select on public.billing_accounts to authenticated;
