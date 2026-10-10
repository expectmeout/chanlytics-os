-- 00392 · A review Google no longer shows, and a closed invitation, go.
--
-- Decision 0036's open questions, answered on 10 October 2026 (Ruben: "go with the best recommendations"):
--
--   purge_google_reviews(p_keep)   the mirror follows Google. A profile's complete read already drops the reviews it no
--                                  longer lists (apps/edge/lib/google/profile-sync.ts); this is the backstop for what a
--                                  read never reaches: a review past the newest the sync reads, the public listing's
--                                  five, a connection whose token fails. A review not seen for 90 days goes (contracts
--                                  RETENTION_DAYS.google_reviews), and a connection it touched no longer says its
--                                  reviews are complete. Nightly, judged by its run.
--   purge_invitations(p_keep)      a team invitation accepted or taken back goes 30 days later
--                                  (RETENTION_DAYS.invitations_closed), and the address it was sent to leaves the
--                                  decisions that recorded it. An open or expired one stays: the Team card shows it, to
--                                  send again. Nightly, judged by its run.
--   handover_accept                the address a workspace was handed to is cleared once its new owner accepts; the
--                                  check allows an accepted handover no address. Declined and expired ones keep theirs,
--                                  which the partner's "send again" starts from. The guard now tells the one who
--                                  accepted "already has its owner" and anyone else "nothing waits for you", as before.
--
-- A lead batch's judgment needs no SQL: purge_leads already removes it at 180 days (00140), which
-- RETENTION_DAYS.lead_judgments now states.
--
-- Re-runnable. Either deploy order: nothing reads what goes, and a cleared address is read as none.

set local lock_timeout = '3s';

/* ---------------------------------------------------------------------- reviews Google no longer shows */

create or replace function public.purge_google_reviews(p_keep interval default interval '90 days')
returns integer
language plpgsql
security definer
set search_path = public
set lock_timeout = '3s'
as $$
declare
  v_total   integer := 0;
  v_n       integer;
  v_tenants uuid[] := '{}';
  v_some    uuid[];
begin
  loop
    with gone as (
      delete from public.google_reviews r
       where r.id in (select g.id from public.google_reviews g where g.last_seen_at < now() - p_keep limit 1000)
      returning r.tenant_id
    )
    select array_agg(distinct tenant_id), count(*) into v_some, v_n from gone;
    v_total := v_total + v_n;
    v_tenants := v_tenants || coalesce(v_some, '{}');
    exit when v_n < 1000;
  end loop;
  -- A connection that lost a review here no longer holds every review Google lists: the lens says so.
  update public.google_connections c
     set reviews_complete = false
   where c.tenant_id = any (v_tenants) and c.reviews_complete;
  return v_total;
end $$;

revoke all on function public.purge_google_reviews(interval) from public, anon, authenticated;
grant execute on function public.purge_google_reviews(interval) to service_role;
comment on function public.purge_google_reviews(interval) is
  'Nightly. Deletes a mirrored Google review not seen for 90 days (contracts RETENTION_DAYS.google_reviews; decision 0036), a thousand at a time, and marks the connections it touched incomplete; a complete read drops one Google no longer lists the same day. Answers how many.';

select cron.unschedule('purge-google-reviews') where exists (select 1 from cron.job where jobname = 'purge-google-reviews');
select cron.schedule('purge-google-reviews', '44 4 * * *', $$select public.purge_google_reviews()$$);

insert into public.sweep_status (sweep, jobname, max_silence, judged_by, requested_at) values
  ('purge_google_reviews', 'purge-google-reviews', interval '26 hours', 'run', null)
on conflict (sweep) do update
   set jobname = excluded.jobname, max_silence = excluded.max_silence, judged_by = excluded.judged_by;

/* ----------------------------------------------------------------------------- closed invitations */

create or replace function public.purge_invitations(p_keep interval default interval '30 days')
returns integer
language plpgsql
security definer
set search_path = public
set lock_timeout = '3s'
as $$
declare
  v_total integer := 0;
  v_n     integer;
begin
  loop
    -- Accepted or taken back, the later of the two when a race wrote both; never an open or an expired one.
    with gone as (
      delete from public.invitations i
       where i.id in (select c.id from public.invitations c
                       where greatest(c.accepted_at, c.revoked_at) < now() - p_keep limit 1000)
      returning i.id, i.tenant_id
    ), said as (
      -- By the workspace and the invitation, as decisions_tenant_subject leads.
      update public.decisions d
         set payload = d.payload - 'email'
        from gone g
       where d.tenant_id = g.tenant_id and d.subject_type = 'invitation' and d.subject_id = g.id and d.payload ? 'email'
      returning d.id
    )
    select (select count(*) from gone) into v_n;
    v_total := v_total + v_n;
    exit when v_n < 1000;
  end loop;
  return v_total;
end $$;

revoke all on function public.purge_invitations(interval) from public, anon, authenticated;
grant execute on function public.purge_invitations(interval) to service_role;
comment on function public.purge_invitations(interval) is
  'Nightly. Deletes a team invitation 30 days after it was accepted or taken back (contracts RETENTION_DAYS.invitations_closed; decision 0036), and the address it was sent to from the decisions that recorded it, a thousand at a time. Open and expired invitations stay. Answers how many.';

select cron.unschedule('purge-invitations') where exists (select 1 from cron.job where jobname = 'purge-invitations');
select cron.schedule('purge-invitations', '48 4 * * *', $$select public.purge_invitations()$$);

insert into public.sweep_status (sweep, jobname, max_silence, judged_by, requested_at) values
  ('purge_invitations', 'purge-invitations', interval '26 hours', 'run', null)
on conflict (sweep) do update
   set jobname = excluded.jobname, max_silence = excluded.max_silence, judged_by = excluded.judged_by;

/* ------------------------------------------------------------- a handover's address, once accepted */

alter table public.partner_tenants drop constraint if exists partner_tenants_handover_check;
update public.partner_tenants
   set handover_email = null
 where origin = 'handover' and handover_accepted_at is not null and handover_email is not null;
alter table public.partner_tenants add constraint partner_tenants_handover_check check (
  (origin in ('link', 'invite')
    and handover_email is null and handover_sent_at is null and handover_expires_at is null
    and handover_accepted_at is null and handover_declined_at is null)
  or
  (origin = 'handover'
    and (handover_email is not null or handover_accepted_at is not null)
    and (handover_email is null or handover_email = lower(handover_email))
    and handover_sent_at is not null and handover_expires_at is not null)
);
comment on column public.partner_tenants.handover_email is
  'The address a workspace is handed to (0016), lower case; cleared once its new owner accepts (00392), kept while it waits, is declined or expires, so the partner may send it again.';

create or replace function public.handover_accept(p_tenant uuid)
returns table(id uuid, slug text, name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user  uuid := auth.uid();
  v_email text;
  v_row   public.partner_tenants;
  v_by    uuid;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  select lower(u.email) into v_email from auth.users u where u.id = v_user and u.email_confirmed_at is not null;
  select pt.* into v_row
    from public.partner_tenants pt
   where pt.tenant_id = p_tenant and pt.origin = 'handover'
   for update;
  -- Not found, and not "not yours": whether a workspace waits for an address is its addressee's to know. Once accepted
  -- the address is gone (00392), and the one who accepted is the only other who hears more.
  if v_row.tenant_id is null or v_email is null
     or (v_row.handover_email is distinct from v_email and v_row.handover_accepted_by is distinct from v_user) then
    raise exception 'There is no workspace waiting for you there.' using errcode = 'P0002';
  end if;
  select p.user_id into v_by from public.partners p where p.id = v_row.partner_id;
  if v_by = v_user then
    raise exception 'A partner cannot take over a workspace they set up.' using errcode = '42501';
  end if;
  if v_row.handover_accepted_at is not null then
    raise exception 'This workspace already has its owner.' using errcode = '55000';
  end if;
  if v_row.handover_declined_at is not null then
    raise exception 'You declined this workspace. Ask your partner to send it again.' using errcode = '55000';
  end if;
  if v_row.handover_expires_at <= now() then
    raise exception 'This invitation has expired. Ask your partner to send it again.' using errcode = '55000';
  end if;

  insert into public.memberships (tenant_id, user_id, role)
  values (p_tenant, v_user, 'owner')
  on conflict (user_id, tenant_id) do update set role = 'owner';
  update public.partner_tenants pt
     set handover_accepted_at = now(), handover_accepted_by = v_user, handover_email = null
   where pt.tenant_id = p_tenant;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant, 'partner.handover_accepted', 'workspace', 'tenant', p_tenant,
          jsonb_build_object('partner_id', v_row.partner_id, 'by', v_user));

  return query select t.id, t.slug, t.name from public.tenants t where t.id = p_tenant;
end $$;

comment on function public.handover_accept(uuid) is
  'The caller, by the confirmed address a workspace was handed to (0016), becomes its owner: the first, with billing and the team. Never the partner who set it up; never after it was declined or expired. The address is cleared as it is accepted (00392).';
