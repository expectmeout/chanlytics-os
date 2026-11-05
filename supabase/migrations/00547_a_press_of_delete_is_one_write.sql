-- 00547 · A press of Delete… is one write, however many it names (decision 0036, amended 5 Nov 2026).
--
-- People's Delete… wrote each person in turn, three round trips each, about sixty a second, so a press of thousands
-- would outrun the browser's thirty seconds as the erasing itself did on 5 Nov. people_erase_begin takes everyone named
-- out of reach and puts their erasure on the ledger in one transaction, on the member's own session, the owner judged
-- here. There is no number of people it stops at: the press answers in the time one statement takes.
--
-- Their erasures come due 300 ms apart, about the rate the ledger erased fifty on production (0.33 s each). Due all at
-- once they would sit ahead of every customer's bulk work for as long as they took, since claim_due_jobs takes the
-- lowest lane first, and ahead of this workspace's own work in their lane, and Health would read them as a backlog.
-- Paced, what comes due meanwhile goes first, and only what is due is ever waiting. A press of five thousand is about
-- twenty-five minutes behind the press, with everyone out of reach from its first moment.
--
-- people_page leaves out whoever is being erased, so that time does not show: a reload, or another member's page, does
-- not bring them back. A person read by name is still their row. A person still blocked a day on is an erasure that
-- stopped (the owner's bell has rung by then), and they show again, where a second press finds no finish waiting and
-- starts one. countPeople (the dashboard's server/people/people.ts) says the same.
--
-- Forward only, re-runnable. Takes effect before the code that calls it: the route asks for this door.

create or replace function public.people_page(p_tenant_id uuid, p_contact_id uuid, p_query text, p_limit integer,
                                              p_offset integer, p_after_at timestamptz, p_after_added timestamptz,
                                              p_after_id uuid)
returns table (
  id                           uuid,
  display_name                 text,
  wa_profile_name              text,
  phone_e164                   text,
  email                        text,
  consent                      text,
  consent_source               text,
  consent_updated_at           timestamptz,
  dnc                          boolean,
  marketing_consent            text,
  marketing_consent_source     text,
  marketing_consent_updated_at timestamptz,
  in_touch_at                  timestamptz,
  added_at                     timestamptz
)
language plpgsql
stable
set search_path = public
set enable_sort = off
as $$
#variable_conflict use_column
declare
  -- The search, read once rather than for each person the walk tests: its words, and its digits.
  v_words  text := nullif(trim(p_query), '');
  v_digits text := regexp_replace(coalesce(p_query, ''), '\D', '', 'g');
begin
  -- One person, by their key: no order to keep, so nothing here sorts. The query and the cursor page a list; a named
  -- person is their row alone.
  if p_contact_id is not null then
    return query
      select c.id, c.display_name, c.wa_profile_name, c.phone_e164, c.email,
             c.consent, c.consent_source, c.consent_updated_at, c.dnc,
             c.marketing_consent, c.marketing_consent_source, c.marketing_consent_updated_at,
             pm.in_touch_at, pm.added_at
        from person_moments pm
        join contacts c on c.id = pm.contact_id
       where pm.contact_id = p_contact_id
         and pm.tenant_id = p_tenant_id
         and c.tenant_id = p_tenant_id
         and c.erased_at is null
         and c.merged_into_contact_id is null;
    return;
  end if;

  -- Everyone else: the walk down person_moments_order to the end of the page. With sorting off it is the only plan,
  -- whatever the planner thinks the workspace holds.
  return query
    select c.id, c.display_name, c.wa_profile_name, c.phone_e164, c.email,
           c.consent, c.consent_source, c.consent_updated_at, c.dnc,
           c.marketing_consent, c.marketing_consent_source, c.marketing_consent_updated_at,
           pm.in_touch_at, pm.added_at
      from person_moments pm
      -- Each person's contact row, looked up by its key as the walk reaches them. The limit keeps it a look-up: joined
      -- any other way, a plan made without the arguments can read the workspace's contacts once and hold them, and
      -- compare every one with each person the walk reaches.
      cross join lateral (
        select c.id, c.display_name, c.wa_profile_name, c.phone_e164, c.email,
               c.consent, c.consent_source, c.consent_updated_at, c.dnc,
               c.marketing_consent, c.marketing_consent_source, c.marketing_consent_updated_at
          from contacts c
         where c.id = pm.contact_id
           and c.tenant_id = p_tenant_id
           and c.erased_at is null
           and c.merged_into_contact_id is null
           -- Someone being erased has left People (00547): a press of thousands is on the ledger for minutes, and a reload
           -- must not bring them back. A day on it is an erasure that stopped, and they show again, to be pressed again.
           and (c.erasing_since is null or c.erasing_since < now() - interval '1 day')
           -- The search: a name, their name on WhatsApp, their email address, or
           -- three digits of the number, the way the page's own box matches.
           -- Nothing else is indexed here; the page still narrows by state and
           -- list over what it holds.
           and (
             v_words is null
             or c.display_name ilike '%' || v_words || '%'
             or c.wa_profile_name ilike '%' || v_words || '%'
             or c.email ilike '%' || v_words || '%'
             -- The business they work at (0052): "bloom" finds the people at Bloom & Vow.
             or exists (select 1 from leads l
                         where l.id = c.lead_id and l.tenant_id = p_tenant_id
                           and l.erased_at is null and l.blanked_at is null
                           and l.business_name ilike '%' || v_words || '%')
             or (length(v_digits) >= 3
                 and regexp_replace(coalesce(c.phone_e164, ''), '\D', '', 'g') like '%' || v_digits || '%')
           )
         limit 1
      ) c
     where pm.tenant_id = p_tenant_id
       -- After the cursor: just past the last row the caller holds. Without one, a place past every row, so the
       -- comparison is always the index's own condition, whatever the plan.
       and (pm.in_touch_at, pm.added_at, pm.contact_id)
           < (coalesce(p_after_at, 'infinity'), coalesce(p_after_added, 'infinity'),
              coalesce(p_after_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'))
     order by pm.in_touch_at desc, pm.added_at desc, pm.contact_id desc
     limit least(greatest(coalesce(p_limit, 1000), 1), 1000)
     offset greatest(coalesce(p_offset, 0), 0);
end
$$;

create or replace function public.people_erase_begin(p_tenant_id uuid, p_contact_ids uuid[], p_not_a_person boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
set statement_timeout = '25s'
as $$
declare
  v_actor uuid := auth.uid();
  v_at    timestamptz := now();
  v_go    uuid[];
  v_stays uuid[] := '{}';
  v_said  integer;
begin
  -- The caller is auth.uid(), read here, never a parameter (00021's rule). An owner's, as erase_contact is.
  if v_actor is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not exists (
    select 1 from public.memberships m
     where m.user_id = v_actor and m.tenant_id = p_tenant_id and m.role = 'owner'
  ) then
    raise exception 'Not yours to delete.' using errcode = '42501';
  end if;

  -- Who of those named may go, each once, in the order named. An erased person, a person merged away, another
  -- workspace's and a stranger are simply not in the answer.
  select coalesce(array_agg(c.id order by n.ord), '{}')
    into v_go
    from (select u.id, min(u.ord) as ord
            from unnest(p_contact_ids) with ordinality as u(id, ord)
           group by u.id) n
    join public.contacts c on c.id = n.id
   where c.tenant_id = p_tenant_id and c.erased_at is null and c.merged_into_contact_id is null;

  -- Not a person: each address said automated first, in this same write, as mailbox_sender_sort says one (00483), the
  -- address alone: a selection is many senders, and a domain is many people's. Someone with no address to say stays.
  if coalesce(p_not_a_person, false) then
    select coalesce(array_agg(g.id order by g.ord) filter (where a.ok), '{}'),
           coalesce(array_agg(g.id order by g.ord) filter (where not a.ok), '{}')
      into v_go, v_stays
      from unnest(v_go) with ordinality as g(id, ord)
      join public.contacts c on c.id = g.id
     cross join lateral (
       select coalesce(char_length(btrim(c.email)) between 3 and 254
                       and btrim(c.email) !~ '[[:space:]<>]'
                       and btrim(c.email) ~ '^[^@]+@[^@]+\.[^@]+$', false) as ok
     ) a;
    insert into public.mailbox_senders (tenant_id, sender, verdict, set_by, set_at)
    select distinct p_tenant_id, lower(btrim(c.email)), 'automated', v_actor, v_at
      from public.contacts c
     where c.id = any (v_go)
    on conflict (tenant_id, sender)
      do update set verdict = excluded.verdict, set_by = excluded.set_by, set_at = excluded.set_at;
    get diagnostics v_said = row_count;
    -- One line for the press: Activity is not a list of everyone it named, and the line never holds an address.
    if v_said > 0 then
      insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
      values (p_tenant_id, 'mailbox_connection.sender_sorted', 'setup', 'workspace', p_tenant_id,
              jsonb_build_object('kind', 'address', 'verdict', 'automated', 'by', v_actor));
    end if;
  end if;

  -- The block: from here the wire refuses them. The digests as beginErasure writes them, from the number still on the
  -- row, and only for someone not blocked already, so a press pressed again moves nothing.
  update public.contacts c
     set erasing_since = v_at,
         erased_phone_hash = coalesce(public.erasure_digest(p_tenant_id, c.phone_e164), c.erased_phone_hash),
         erased_email_hash = coalesce(public.erasure_digest(p_tenant_id, c.email), c.erased_email_hash)
   where c.id = any (v_go) and c.tenant_id = p_tenant_id and c.erased_at is null and c.erasing_since is null;

  -- Their erasures on the ledger, on the word of who pressed, paced (the header). Someone whose finish already waits
  -- keeps it (its key), so a press pressed again starts nothing beside the first; someone blocked with none gets one.
  insert into public.jobs (tenant_id, kind, due_at, payload)
  select p_tenant_id, 'erasure_finish', v_at + (g.ord - 1) * interval '300 milliseconds',
         jsonb_build_object('contact_id', g.id, 'by', v_actor)
    from unnest(v_go) with ordinality as g(id, ord)
  on conflict do nothing;

  return jsonb_build_object('going', to_jsonb(v_go), 'no_address', to_jsonb(v_stays));
end $$;
revoke all on function public.people_erase_begin(uuid, uuid[], boolean) from public, anon;
grant execute on function public.people_erase_begin(uuid, uuid[], boolean) to authenticated;
comment on function public.people_erase_begin(uuid, uuid[], boolean) is
  'People''s Delete… for a selection of any size (00547, decision 0036): everyone named goes out of reach and onto the ledger in one transaction, an owner''s, on their own session. The erasing is erasure_finish''s, paced 300 ms apart. Answers who is going and who has no address to say, each in the order named; whoever else was named is neither.';
