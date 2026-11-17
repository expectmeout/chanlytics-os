-- 00640 · The never-again list is asked once a read.
--
-- A reach-out's drawer and Campaigns' People cell ask reach_out_why_not of everyone on a list, and it asked the never-again list
-- of each lead in turn. At a workspace's ceiling (decision 0103, 50,000 leads) that was most of why both ran past a member's 8 s
-- and were cut off. Lists are small today, so no customer feels it yet.
--
-- Each lead cost one lead_address_suppressed, 437 µs on production (read-only, 9 Nov 2026), because a SQL function calling a SQL
-- function plans the inner one again on every call, and four digests (address, domain, place, number), 37 µs each, because each
-- reads the keying mark and, since production is keyed, its pepper out of Vault. About 29 s at the ceiling on production.
--
-- Asking lead_addresses_suppressed once with every address would not have been enough: it still made each digest one at a time,
-- 83 µs an address. So the digests themselves are now asked in one read. The mark and the pepper are read once, and the formula
-- runs inside the query, 3.8 µs a digest on production. Each formula stays written once: erasure_digests_legacy and erasure_keys
-- hold them, and erasure_digest, erasure_digest_legacy and erasure_key each ask those for one value.
--
-- lead_values_suppressed says which of these values the list holds, of one kind. lead_addresses_suppressed asks it for addresses
-- and for their domains, and reach_out_why_not asks lead_addresses_suppressed once and lead_values_suppressed once each for places
-- and numbers. reach_out_why_not stays the one rule, its reasons in the same order. A reason is still only reached by a lead that
-- gets that far: the list is not asked at all if nobody does.
--
-- Two things here look odd and matter:
--
--   lead_values_suppressed puts its digests in a variable before its query. Given to unnest directly, the planner runs them to
--   estimate unnest's rows, so each digest would be made twice.
--
--   plan_cache_mode = force_generic_plan keeps one plan for these functions. A list of one looks cheaper planned for its own
--   values, so without it each is planned again on every call, and one lead took twice as long as it did before. With it, one lead
--   costs what it did: reach_out_why_not 767 µs before and 782 µs after, lead_address_suppressed 396 µs and 248 µs (keyed, on
--   Postgres 17.5 run in Node). The plan needs no values: a lookup by lead_suppressions' own key for each digest, at any size.
--
-- One digest asked alone costs a little more, about 12 µs, for going through the read for many.
--
-- Every reason answers the same, row against row, in 94,488 answers across every way a lead can stand, keyed and not.
--
-- What this does not reach: Campaigns' People cell reads each reach-out in turn, so past about ten reach-outs at the ceiling it
-- still runs past 8 s. That time is each reach-out's own read of the workspace's leads and messages, not this.
--
-- Re-runnable. Takes no table lock. The comments and grants on what already exists stand.

set local lock_timeout = '3s';

create or replace function public.erasure_digests_legacy(p_tenant_id uuid, p_values text[])
returns text[]
language sql
immutable
set search_path = public
as $$
  select array(
    select encode(sha256(convert_to(p_tenant_id::text || ':' || u.value, 'UTF8')), 'hex')
      from unnest(p_values) with ordinality as u(value, n)
     order by u.n)
$$;

comment on function public.erasure_digests_legacy(uuid, text[]) is
  'The legacy digest of many values, one for each, in their order: sha256 of "<tenant_id>:<value>". The one place the formula is written (00640); erasure_digest_legacy asks it for one. Service role only.';

revoke all on function public.erasure_digests_legacy(uuid, text[]) from public, anon, authenticated;
grant execute on function public.erasure_digests_legacy(uuid, text[]) to service_role;

create or replace function public.erasure_digest_legacy(p_tenant_id uuid, p_value text)
returns text
language sql
immutable
set search_path = public
as $$
  select (public.erasure_digests_legacy(p_tenant_id, array[p_value]))[1]
$$;

create or replace function public.erasure_keys(p_digests text[])
returns text[]
language plpgsql
stable
security definer
set search_path = public
set plan_cache_mode = force_generic_plan
as $$
declare
  v_pepper text;
begin
  if exists (select 1 from unnest(p_digests) d where d not like 'h1:%') then
    select decrypted_secret into v_pepper from vault.decrypted_secrets where name = 'erasure_pepper';
    if v_pepper is null then
      raise exception 'erasure_key: no pepper in Vault' using errcode = 'P0001';
    end if;
  end if;
  return array(
    select case when u.digest is null or u.digest like 'h1:%' then u.digest
                else 'h1:' || encode(extensions.hmac(u.digest, v_pepper, 'sha256'), 'hex') end
      from unnest(p_digests) with ordinality as u(digest, n)
     order by u.n);
end $$;

comment on function public.erasure_keys(text[]) is
  'Many digests keyed with Vault''s pepper, read once, one for each, in their order; a null or one already keyed stays as it is, and the pepper is not read for those alone. The one place the formula is written (00640); erasure_key asks it for one. Service role only.';

revoke all on function public.erasure_keys(text[]) from public, anon, authenticated;
grant execute on function public.erasure_keys(text[]) to service_role;

create or replace function public.erasure_key(p_digest text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return (public.erasure_keys(array[p_digest]))[1];
end $$;

create or replace function public.erasure_digests(p_tenant_id uuid, p_values text[])
returns text[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_legacy text[] := public.erasure_digests_legacy(p_tenant_id, p_values);
begin
  if (select k.keyed_at from public.erasure_keying k where k.id) is null then
    return v_legacy;
  end if;
  return public.erasure_keys(v_legacy);
end $$;

create or replace function public.erasure_digest(p_tenant_id uuid, p_value text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_value is null then
    return null;
  end if;
  return (public.erasure_digests(p_tenant_id, array[p_value]))[1];
end $$;

create or replace function public.lead_values_suppressed(p_tenant_id uuid, p_kind text, p_values text[])
returns setof text
language plpgsql
stable
security definer
set search_path = public
set plan_cache_mode = force_generic_plan
as $$
declare
  v_digests text[] := public.erasure_digests(p_tenant_id, p_values);
begin
  return query
    select u.value
      from unnest(p_values, v_digests) as u(value, digest)
     where exists (select 1 from public.lead_suppressions s
                    where s.tenant_id = p_tenant_id and s.kind = p_kind and s.hash = u.digest);
end $$;

comment on function public.lead_values_suppressed(uuid, text, text[]) is
  'Which of these values a row of this kind on the workspace''s never-again list holds, each digest made in one read (00640). lead_addresses_suppressed and reach_out_why_not ask it. Service role only.';

revoke all on function public.lead_values_suppressed(uuid, text, text[]) from public, anon, authenticated;
grant execute on function public.lead_values_suppressed(uuid, text, text[]) to service_role;

create or replace function public.lead_addresses_suppressed(p_tenant_id uuid, p_addresses text[])
returns setof text
language plpgsql
stable
security definer
set search_path = public
set plan_cache_mode = force_generic_plan
as $$
begin
  return query
    with asked as (
      select distinct lower(btrim(a)) as address
        from unnest(coalesce(p_addresses, '{}'::text[])) as a
       where nullif(btrim(a), '') is not null
    ),
    parts as (
      select q.address,
             case when position('@' in q.address) > 0 then nullif(split_part(q.address, '@', -1), '') end as domain
        from asked q
    )
    select p.address from parts p
     where p.address in (select s from public.lead_values_suppressed(p_tenant_id, 'email',
                           array(select x.address from parts x)) s)
        or p.domain in (select s from public.lead_values_suppressed(p_tenant_id, 'domain',
                          array(select distinct x.domain from parts x where x.domain is not null)) s);
end $$;

create or replace function public.reach_out_why_not(p_tenant_id uuid, p_lead_ids uuid[], p_include_unconfirmed boolean default false)
returns table (lead_id uuid, why text)
language sql
stable
security definer
set search_path = public
as $$
  with asked as (
    select x.id as asked_id, l.id, l.tenant_id, l.erased_at, l.blanked_at, l.stage, l.closed_reason, l.place_id, l.phone_e164, l.email_state,
           lower(nullif(btrim(l.email), '')) as address
      from unnest(coalesce(p_lead_ids, '{}'::uuid[])) as x(id)
      left join public.leads l on l.id = x.id and l.tenant_id = p_tenant_id
  )
  select l.asked_id,
    case
      when l.id is null or l.erased_at is not null or l.blanked_at is not null then 'gone'
      when l.stage <> 'ready' or l.closed_reason is not null then 'closed'
      -- Never a customer's: nobody in People shares the address (as theirs, or one they wrote from) or the number.
      when exists (select 1 from public.contacts c
                    where c.tenant_id = l.tenant_id and c.erased_at is null
                      and ((l.address is not null and c.email = l.address)
                           or (l.phone_e164 is not null and c.phone_e164 = l.phone_e164)))
        or (l.address is not null and exists (
              select 1 from public.contact_identities i
                join public.contacts c on c.id = i.contact_id and c.erased_at is null
               where i.tenant_id = l.tenant_id and i.channel = 'email' and i.external_id = l.address))
        then 'customer'
      -- Never the never-again list: the address (an opt-out, a customer, an erasure, a no, its business's domain), and
      -- the place or the number (a customer's or an erased person's). Each asked once, of everyone asked about (00640).
      when l.address in (select s from public.lead_addresses_suppressed(p_tenant_id,
                           array(select a.address from asked a where a.address is not null)) s)
        or l.place_id in (select s from public.lead_values_suppressed(p_tenant_id, 'place',
                            array(select a.place_id from asked a where a.place_id is not null)) s)
        or l.phone_e164 in (select s from public.lead_values_suppressed(p_tenant_id, 'phone',
                              array(select a.phone_e164 from asked a where a.phone_e164 is not null)) s)
        then 'suppressed'
      -- Never twice by the workspace: a send of any reach-out, bar one in a run its owner skipped or one taken back.
      when exists (select 1 from public.sequence_sends ro
                    where ro.lead_id is not null and ( ro.tenant_id = l.tenant_id and ro.lead_id = l.id and ro.sequence_id is not null
                      and not (ro.state = 'skipped' and ro.reason in ('run_canceled', 'owner_took_back', 'moved'))))
        then 'written'
      -- One business written to once: the finder saw it share a number, an own-domain address or a site with another.
      when exists (select 1 from public.lead_search_members m
                    where m.tenant_id = l.tenant_id and m.lead_id = l.id and m.blanked_at is null
                      and coalesce(jsonb_array_length(m.judgment->'shares'), 0) <> 0)
        then 'shared'
      when l.address is null then 'no_email'
      when l.email_state = 'ok' then null
      when l.email_state = 'checking' then 'checking'
      when l.email_state = 'catch_all' then case when coalesce(p_include_unconfirmed, false) then null else 'unconfirmed' end
      when l.email_state = 'invalid' then 'invalid'
      else 'unchecked'
    end
    from asked l
$$;
