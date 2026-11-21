-- 00669 · A draft ad's words are asked for once, and what the ad writer made is kept into the draft as it now stands
-- (the Ads plan's 4.6, 6.2 and G18; follows 00659).
--
-- Two races New ad's screen could not mend, since the kept draft held no mark of a writer at work and a keep could not
-- say which draft it was made from:
--   - a reload, or a second device, while the ad writer was out read a draft with no words yet and asked the writer
--     again: two model calls for one draft;
--   - the words route read the kept draft before the model's ten to twenty seconds and kept its answer over whatever
--     was kept meanwhile: another device's or member's change in those seconds was undone, and a draft turned on in
--     them came back.
--
--   ad_drafts.writing_*       The writer out for the draft's words, while one is: which ask (writing_ask), the words it
--                             writes as the dashboard names them (writing_for: the service, the picture, with the price
--                             or without), and until when another ask for the same words waits for it (writing_until).
--                             Past that, the next ask writes its own.
--   ad_draft_writing          A member's door: an ask marks itself the draft's writer, unless another is out for the same
--                             words in its time; then it answers that one, which the ask waits for.
--   ad_draft_written          A member's door: the writer is back, and its mark goes where it is still its own.
--   ad_draft_keep             Re-made with p_read_at, the kept draft's updated_at as the writer read it ('-infinity'
--                             where none was kept). Where the draft kept now is another, or is gone, nothing is written
--                             and the answer says newer: the dashboard puts what its writer made into the draft as it
--                             now stands (server/ads/kept-over.ts) and keeps that. Without it, as before.
--   ad_drafts_set_updated_at  Re-made to move updated_at only when the draft or its account changes: a writer's mark is
--                             no change of the draft, so Turn on (00666's p_draft_at) and a keep read it as the one they
--                             read.
--
-- Locks. Adding the three columns takes ad_drafts' lock for a moment, and so does re-making its trigger. This file
-- waits three seconds for each and no more. Run again on a quiet moment if it times out: nothing was applied.
--
-- Deploy order: this file first, then the code. Code ahead of it marks no writer and keeps as before (a column or a
-- door not there yet is read as none), and the code before it calls ad_draft_keep with three arguments, which the
-- re-made door takes. Re-runnable.

set local lock_timeout = '3s';

/* -------------------------------------------------------------------------------------- 1. the writer's mark -- */

alter table public.ad_drafts
  add column if not exists writing_ask uuid,
  add column if not exists writing_for text,
  add column if not exists writing_until timestamptz;

comment on column public.ad_drafts.writing_ask is
  'The ask out for the draft''s words, while one is (00669): written by ad_draft_writing, let go by ad_draft_written. Null where no writer is out.';
comment on column public.ad_drafts.writing_for is
  'The words that ask writes, as the dashboard names them (00669; server/ads/writer.ts): the service, the picture, and whether they say the price. Another ask for the same words waits for it.';
comment on column public.ad_drafts.writing_until is
  'Until when another ask for the same words waits for the one out (00669): within the words route''s own minute. Past it, the next ask writes its own.';

-- A mark is not a change of the draft: updated_at moves only with what was chosen, or its account.
drop trigger if exists ad_drafts_set_updated_at on public.ad_drafts;
create trigger ad_drafts_set_updated_at
  before update on public.ad_drafts
  for each row
  when (old.draft is distinct from new.draft or old.account_id is distinct from new.account_id)
  execute function extensions.moddatetime('updated_at');

create or replace function public.ad_draft_writing(p_tenant_id uuid, p_ask uuid, p_for text, p_until timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id    uuid;
  v_ask   uuid;
  v_for   text;
  v_until timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  -- Whoever may keep the draft may ask for its words (0050, call 2).
  if p_tenant_id is null or not public.is_acting_member(p_tenant_id) then
    raise exception 'Not yours to change.' using errcode = '42501';
  end if;
  -- A mark outlives its request by little: its time is within the route's own minute, with room.
  if p_ask is null or nullif(btrim(p_for), '') is null or char_length(p_for) > 1000 or p_until is null
     or p_until <= now() or p_until > now() + interval '2 minutes' then
    raise exception 'A writer is marked by its ask, the words it writes, and a time within two minutes.'
      using errcode = '22023';
  end if;
  select d.id, d.writing_ask, d.writing_for, d.writing_until into v_id, v_ask, v_for, v_until
    from public.ad_drafts d
   where d.tenant_id = p_tenant_id
     for update;
  if v_id is null then
    -- No draft kept: nothing to mark, and nothing to wait for.
    return jsonb_build_object('held', false, 'ask', null, 'until', null);
  end if;
  if v_ask is not null and v_ask <> p_ask and v_for = p_for and v_until > now() then
    -- Another ask is out for the same words, in its time: this one waits for it.
    return jsonb_build_object('held', false, 'ask', v_ask, 'until', v_until);
  end if;
  update public.ad_drafts d
     set writing_ask = p_ask, writing_for = p_for, writing_until = p_until
   where d.id = v_id;
  return jsonb_build_object('held', true, 'ask', p_ask, 'until', p_until);
end $$;

revoke all on function public.ad_draft_writing(uuid, uuid, text, timestamptz) from public, anon;
grant execute on function public.ad_draft_writing(uuid, uuid, text, timestamptz) to authenticated, service_role;
comment on function public.ad_draft_writing(uuid, uuid, text, timestamptz) is
  'A member''s door (00669; the Ads plan''s G18): an ask for the kept draft''s words marks itself its writer, until p_until (within two minutes), for the words p_for names. Where another ask is out for the same words in its time, nothing is marked and the answer names that one, which the ask waits for; an ask for other words takes the mark over. An acting member alone (is_acting_member). Answers {held, ask, until}; held false with no ask where no draft is kept. Moves nothing of the draft.';

create or replace function public.ad_draft_written(p_tenant_id uuid, p_ask uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gone integer;
begin
  if auth.uid() is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not public.is_acting_member(p_tenant_id) then
    raise exception 'Not yours to change.' using errcode = '42501';
  end if;
  update public.ad_drafts d
     set writing_ask = null, writing_for = null, writing_until = null
   where d.tenant_id = p_tenant_id and d.writing_ask = p_ask;
  get diagnostics v_gone = row_count;
  return v_gone > 0;
end $$;

revoke all on function public.ad_draft_written(uuid, uuid) from public, anon;
grant execute on function public.ad_draft_written(uuid, uuid) to authenticated, service_role;
comment on function public.ad_draft_written(uuid, uuid) is
  'A member''s door (00669): the ad writer an ask marked with ad_draft_writing is back, and the mark goes, where it is still that ask''s (an ask for other words may have taken it over). An acting member alone. True where a mark went.';

/* ------------------------------------------------------------------------- 2. a keep names the draft it read -- */

-- Re-made with one argument more, defaulted, so the code before this file still calls it with three.
drop function if exists public.ad_draft_keep(uuid, uuid, jsonb);
create or replace function public.ad_draft_keep(p_tenant_id uuid, p_account_id uuid, p_draft jsonb,
                                                p_read_at timestamptz default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor   uuid := auth.uid();
  v_id      uuid;
  v_at      timestamptz;
  v_words   integer;
  v_name    text;
  v_service text;
  v_rung    integer := 0;
begin
  if v_actor is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  -- Operators and partners may draft (0050, call 2): an acting member, a partner only once their session showed its
  -- second factor. A viewer reads.
  if p_tenant_id is null or not public.is_acting_member(p_tenant_id) then
    raise exception 'Not yours to change.' using errcode = '42501';
  end if;
  if p_draft is null or jsonb_typeof(p_draft) <> 'object' or octet_length(p_draft::text) > 20000 then
    raise exception 'A draft is an object of at most 20,000 bytes.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.ad_accounts a where a.id = p_account_id and a.tenant_id = p_tenant_id) then
    return jsonb_build_object('kept', false, 'draft_id', null, 'rung', 0);
  end if;
  -- A keep that names the draft it read writes nothing over another kept since, nor brings back one gone since
  -- (turned on): it says newer, and the dashboard puts what its writer made into the draft as it now stands.
  if p_read_at is not null then
    select d.id, d.updated_at into v_id, v_at
      from public.ad_drafts d
     where d.tenant_id = p_tenant_id
       for update;
    if (v_id is null and p_read_at <> '-infinity'::timestamptz) or (v_id is not null and v_at is distinct from p_read_at)
    then
      return jsonb_build_object('kept', false, 'draft_id', v_id, 'rung', 0, 'newer', true);
    end if;
  end if;
  insert into public.ad_drafts as d (tenant_id, account_id, draft, kept_by)
  values (p_tenant_id, p_account_id, p_draft, v_actor)
  on conflict (tenant_id) do update
     set account_id = excluded.account_id, draft = excluded.draft, kept_by = excluded.kept_by
  returning d.id into v_id;
  if public.has_permission(v_actor, p_tenant_id, 'ads') then
    -- The owner has it now: what told them it waited is closed.
    update public.notifications n
       set closed_at = now()
     where n.tenant_id = p_tenant_id and n.kind = 'ad_draft' and n.closed_at is null;
    return jsonb_build_object('kept', true, 'draft_id', v_id, 'rung', 0);
  end if;
  v_words := case when jsonb_typeof(p_draft -> 'versions') = 'array' then jsonb_array_length(p_draft -> 'versions')
                  else 0 end;
  -- Left with its words, it waits for whoever may turn it on: one row each, never a second while one is open.
  if v_words > 0 then
    begin
      select nullif(btrim(p.display_name), '') into v_name from public.profiles p where p.user_id = v_actor;
      -- The service as the writer named it in a few words, where it did: a service's own name can run to a sentence.
      v_service := coalesce(nullif(btrim(p_draft ->> 'label'), ''), nullif(btrim(p_draft ->> 'service'), ''));
      if char_length(v_service) > 120 then
        v_service := left(v_service, 119) || '…';
      end if;
      insert into public.notifications (tenant_id, kind, title, body, route, subject_type, subject_id,
                                        recipient_user_id)
      select p_tenant_id, 'ad_draft', coalesce(v_name, 'Someone on your team') || ' left you a draft ad',
             coalesce('For ' || v_service || '. ', '') || 'It runs only once you turn it on.',
             'campaigns/ads:new', 'ad_draft', v_id::text, m.user_id
        from public.memberships m
       where m.tenant_id = p_tenant_id
         and m.user_id <> v_actor
         and public.has_permission(m.user_id, p_tenant_id, 'ads')
         and not exists (
               select 1 from public.notifications n
                where n.tenant_id = p_tenant_id and n.kind = 'ad_draft' and n.recipient_user_id = m.user_id
                  and n.closed_at is null);
      get diagnostics v_rung = row_count;
    exception when others then
      -- The bell's line never costs the draft its keeping.
      raise warning 'ad_draft_keep: %', sqlerrm;
    end;
  end if;
  return jsonb_build_object('kept', true, 'draft_id', v_id, 'rung', v_rung);
end $$;

revoke all on function public.ad_draft_keep(uuid, uuid, jsonb, timestamptz) from public, anon;
grant execute on function public.ad_draft_keep(uuid, uuid, jsonb, timestamptz) to authenticated, service_role;
comment on function public.ad_draft_keep(uuid, uuid, jsonb, timestamptz) is
  'A member''s door (00659, 00669; decision 0050, call 2): the workspace''s draft of a new ad kept for an ad account of its own, in place of the one before. An acting member alone (is_acting_member: an owner, an operator, a partner whose session showed its second factor). Kept with its words by a member who may not run ads, it rings each owner''s bell (kind ad_draft, opening New ad), once while their row is open; kept by an owner, those rows close. With p_read_at, the kept draft''s updated_at as it was read (''-infinity'' where none was kept): where the draft kept now is another, or is gone, nothing is written and the answer says newer. Answers {kept, draft_id, rung}, with newer true where it was refused so; kept false, and nothing written, for an account not of this workspace.';
