-- 00444 · A sequence's people are found by an index (00441's enrolment trigger, made linear).
--
-- sequence_sends_move_enrollment found each person's latest place in a sequence with
--   where e.sequence_id = … and case when lead_id is null then e.lead_id is null and e.contact_id = … else e.lead_id = … end
-- The CASE hides contact_id and lead_id from the planner, so only sequence_id could use an index and every person a
-- statement wrote scanned every place in their sequence: quadratic in the sequence's size, on every batch of sends and
-- on every send's move. On the replayed stack, playbook-totals.db.test.mjs's seed went from 1.7 s before 00441 to 30 s
-- after it, then past the statement timeout (main's Database job, 15 Oct 2026).
--
-- Each lookup is now two branches, a customer's by contact and a lead's by lead, of which only one runs, each on 00441's
-- own index for it (sequence_enrollments_customer_latest, _lead_latest), which holds its order (entered_at desc, id
-- desc): the latest place is one index step. The "nothing else pending" check reads a customer's sends by their person
-- (sequence_sends_person). What the function does is unchanged.
--
-- A batch's moves are one loop over its people, each place updated by its key. As two UPDATE … FROM statements, the
-- planner was free to drive the join from sequence_enrollments, and a plan made while the table looked empty (cached for
-- the connection, or statistics not yet gathered) did: every place in the table re-ran the whole batch's lookup. On CI,
-- one batch of 1,000 against 1,093 places made 1.09 million index probes (auto_explain, 15 Oct 2026). The loop's lookup
-- is driven by the batch, whatever the statistics say.
--
-- And it runs with jit off. Its statements run once for each batch of sends, and their cost estimates, once a sequence's
-- tables are large and analyzed, cross jit_above_cost: Postgres compiled them with LLVM at every batch, which cost more
-- than the statements themselves. On CI's image (postgres 17.6, jit on), playbook-totals' first test took 12-17 s with jit
-- and 3-4 s with the function's jit off, and the full suite's seed write passed 30 s on CPU alone, waiting on nothing.
-- Production already runs with jit off (read 15 Oct 2026), so there this is the replayed stack made to behave as it does.

create or replace function public.sequence_sends_move_enrollment() returns trigger
language plpgsql security definer
set search_path = public
set jit = off
as $$
declare
  v_place int;
  v_e public.sequence_enrollments%rowtype;
  v_next_days int;
  v_has_next boolean;
  v_seen record;
begin
  -- Sends made, once a statement (sequence_sends_enrol, below): set-based, so a batch of thousands is one pass.
  if TG_LEVEL = 'STATEMENT' then
    -- Each person the batch wrote who already has a place, driven by the batch: their place is updated by its key.
    for v_seen in
      with asked as (
        select distinct on (n.sequence_id, n.lead_id, n.contact_id) n.sequence_id, n.contact_id, n.lead_id, st.place
          from new_sends n join public.sequence_steps st on st.id = n.step_id
         order by n.sequence_id, n.lead_id, n.contact_id, st.place desc
      )
      select a.lead_id, a.place, e.id as e_id, e.state as e_state, e.place as e_place
        from asked a
        join lateral (
          (select e.id, e.state, e.place from public.sequence_enrollments e
            where a.lead_id is null and e.sequence_id = a.sequence_id and e.lead_id is null and e.contact_id = a.contact_id
            order by e.entered_at desc, e.id desc
            limit 1)
          union all
          (select e.id, e.state, e.place from public.sequence_enrollments e
            where a.lead_id is not null and e.sequence_id = a.sequence_id and e.lead_id = a.lead_id
            order by e.entered_at desc, e.id desc
            limit 1)) e on true
    loop
      if v_seen.e_state = 'in' and v_seen.lead_id is null and v_seen.place = 1 and v_seen.e_place > 1 then
        -- 1. Someone still in the sequence whose first step comes again leaves first: one place is in at a time.
        update public.sequence_enrollments
           set state = 'left', why = 'started_again', ended_at = now(), next_at = null
         where id = v_seen.e_id;
      elsif not (v_seen.lead_id is null and v_seen.place = 1 and (v_seen.e_state <> 'in' or v_seen.e_place > 1)) then
        -- 2. A place that stands is in again, at the later step.
        update public.sequence_enrollments
           set state = 'in', why = null, ended_at = null, next_at = null, left_by = null,
               place = greatest(case when state = 'in' then place else 0 end, v_seen.place)
         where id = v_seen.e_id;
      end if;
    end loop;

    -- 3. Everyone else takes a new place: none before, or a customer's first step again.
    with asked as (
      select distinct on (n.sequence_id, n.lead_id, n.contact_id)
             n.tenant_id, n.sequence_id, n.contact_id, n.lead_id, st.place
        from new_sends n join public.sequence_steps st on st.id = n.step_id
       order by n.sequence_id, n.lead_id, n.contact_id, st.place desc
    )
    insert into public.sequence_enrollments (tenant_id, sequence_id, contact_id, lead_id, place)
    select a.tenant_id, a.sequence_id, a.contact_id, a.lead_id, a.place
      from asked a
      left join lateral (
        (select e.state, e.place from public.sequence_enrollments e
          where a.lead_id is null and e.sequence_id = a.sequence_id and e.lead_id is null and e.contact_id = a.contact_id
          order by e.entered_at desc, e.id desc
          limit 1)
        union all
        (select e.state, e.place from public.sequence_enrollments e
          where a.lead_id is not null and e.sequence_id = a.sequence_id and e.lead_id = a.lead_id
          order by e.entered_at desc, e.id desc
          limit 1)) e on true
     where e.state is null
        or (a.lead_id is null and a.place = 1 and e.state <> 'in');
    return null;
  end if;

  select st.place into v_place from public.sequence_steps st where st.id = NEW.step_id;
  if v_place is null then
    return null;
  end if;
  if NEW.lead_id is null then
    select e.* into v_e from public.sequence_enrollments e
     where e.sequence_id = NEW.sequence_id and e.lead_id is null and e.contact_id = NEW.contact_id
     order by e.entered_at desc, e.id desc
     limit 1
     for update;
  else
    select e.* into v_e from public.sequence_enrollments e
     where e.sequence_id = NEW.sequence_id and e.lead_id = NEW.lead_id
     order by e.entered_at desc, e.id desc
     limit 1
     for update;
  end if;

  if v_e.id is null or NEW.state is not distinct from OLD.state then
    return null;
  end if;
  if NEW.state in ('sent', 'handed') then
    select true, n.after_days into v_has_next, v_next_days
      from public.sequence_steps n
     where n.sequence_id = NEW.sequence_id and n.place = v_place + 1;
    if coalesce(v_has_next, false) then
      update public.sequence_enrollments
         set state = 'in', why = null, ended_at = null, place = greatest(place, v_place),
             sent_at = coalesce(NEW.sent_at, now()),
             next_at = coalesce(NEW.sent_at, now()) + make_interval(days => coalesce(v_next_days, 0))
       where id = v_e.id;
    else
      update public.sequence_enrollments
         set state = 'done', why = null, ended_at = coalesce(ended_at, now()), place = greatest(place, v_place),
             sent_at = coalesce(NEW.sent_at, now()), next_at = null
       where id = v_e.id;
    end if;
  elsif NEW.state in ('skipped', 'failed')
        and not (NEW.lead_id is null and NEW.state = 'failed' and NEW.reason = 'outcome_unknown') then
    if v_e.state = 'in' and v_e.place <= v_place
       and not exists (select 1 from public.sequence_sends o
                        where NEW.lead_id is null and o.tenant_id = NEW.tenant_id and o.contact_id = NEW.contact_id
                          and o.sequence_id = NEW.sequence_id and o.lead_id is null and o.id <> NEW.id
                          and o.state in ('planned', 'held', 'claimed', 'queued', 'drafted')
                       union all
                       select 1 from public.sequence_sends o
                        where NEW.lead_id is not null and o.sequence_id = NEW.sequence_id and o.lead_id = NEW.lead_id
                          and o.id <> NEW.id
                          and o.state in ('planned', 'held', 'claimed', 'queued', 'drafted')) then
      update public.sequence_enrollments
         set state = 'left', why = left(coalesce(NEW.reason, NEW.state), 60), ended_at = now(), next_at = null
       where id = v_e.id;
    end if;
  end if;
  return null;
end $$;
