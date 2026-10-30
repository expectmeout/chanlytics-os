-- 00493 · A memory line may be learned (decision 0078).
--
-- An owner's way of writing a cold email is kept as lines of Ask's memory (0070), read by every Ask turn and by the
-- drafter, listed and forgotten in Settings › Memory. A line Ask learned from an email the owner pasted says so:
--   ask_memory_lines.source   'ask' (a member told Ask in a thread), 'pane' (a member wrote it on Settings › Memory),
--                             or 'learned' (Ask read it from how the owner writes, at their paste).
--   ask_memory_write          as 00470 wrote it, but its keep takes 'learned' too.
--
-- Deploy order: this first, then either app. A dashboard from before this keeps only 'ask' and 'pane'. Re-runnable.

set local lock_timeout = '3s';
do $$
begin
  raise notice 'lock_timeout for this migration: %', current_setting('lock_timeout');
  if current_setting('lock_timeout') <> '3s' then
    raise warning 'this file was applied outside a transaction, so SET LOCAL did nothing: run it inside begin/commit, or set lock_timeout yourself before it';
  end if;
end $$;

/* ------------------------------------------------------------------------------------------------- 1. the source -- */
alter table public.ask_memory_lines drop constraint if exists ask_memory_lines_source_check;
alter table public.ask_memory_lines add constraint ask_memory_lines_source_check
  check (source in ('ask', 'pane', 'learned'));
comment on column public.ask_memory_lines.source is
  'Where the line came from: ask (a member told Ask in a thread and Ask kept it), pane (a member wrote it on Settings › Memory), learned (Ask read it from how the owner writes, at their paste; decision 0078).';

/* --------------------------------------------------------------------------------------------------- 2. the door -- */
create or replace function public.ask_memory_write(
  p_tenant_id uuid,
  p_act text,
  p_id uuid default null,
  p_text text default null,
  p_source text default 'ask',
  p_thread_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor  uuid := auth.uid();
  v_text   text := btrim(regexp_replace(coalesce(p_text, ''), '\s+', ' ', 'g'));
  v_thread uuid;
  v_row    public.ask_memory_lines%rowtype;
begin
  -- The caller is auth.uid(), read here, never a parameter (00021's rule): the line is theirs.
  if v_actor is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_act in ('keep', 'change') then
    if char_length(v_text) < 3 then
      return jsonb_build_object('error', 'empty');
    end if;
    if char_length(v_text) > 300 then
      return jsonb_build_object('error', 'too_long');
    end if;
  end if;

  if p_act = 'keep' then
    if not coalesce(public.caller_has_permission(p_tenant_id, 'approve'), false) then
      raise exception 'ask_memory_write: approve required' using errcode = '42501';
    end if;
    if p_source is null or p_source not in ('ask', 'pane', 'learned') then
      raise exception 'ask_memory_write: source is ask, pane or learned' using errcode = '22023';
    end if;
    -- Serialized per workspace, so two turns at once can neither keep one line twice nor both take the last place.
    perform pg_advisory_xact_lock(hashtextextended('ask_memory:' || p_tenant_id::text, 0));
    -- The same line again is the one already kept, said as kept: nothing is kept twice.
    select * into v_row from public.ask_memory_lines
     where tenant_id = p_tenant_id and forgotten_at is null and lower(text) = lower(v_text)
     limit 1;
    if found then
      return jsonb_build_object('memory', jsonb_build_object('id', v_row.id, 'text', v_row.text), 'again', true);
    end if;
    if (select count(*) from public.ask_memory_lines where tenant_id = p_tenant_id and forgotten_at is null) >= 40 then
      return jsonb_build_object('error', 'full');
    end if;
    -- A thread named is the caller's own in this workspace, or none.
    select t.id into v_thread from public.ask_threads t
     where t.id = p_thread_id and t.tenant_id = p_tenant_id and t.user_id = v_actor;
    insert into public.ask_memory_lines (tenant_id, text, source, thread_id, kept_by)
    values (p_tenant_id, v_text, p_source, v_thread, v_actor)
    returning * into v_row;
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, 'ask.memory_kept', 'settings', 'workspace', p_tenant_id,
            jsonb_build_object('memory_id', v_row.id, 'source', p_source, 'by', v_actor, 'chars', char_length(v_text)));
    return jsonb_build_object('memory', jsonb_build_object('id', v_row.id, 'text', v_row.text), 'again', false);
  end if;

  -- A change and a forget name a line of this workspace. One the caller may not touch is one they cannot find: a
  -- stranger learns nothing.
  select * into v_row from public.ask_memory_lines where id = p_id and tenant_id = p_tenant_id for update;

  if p_act = 'change' then
    if not found or v_row.forgotten_at is not null
       or not coalesce(public.caller_has_permission(p_tenant_id, 'settings'), false) then
      raise exception 'Line not found.' using errcode = 'P0002';
    end if;
    if v_row.text = v_text then
      return jsonb_build_object('memory', jsonb_build_object('id', v_row.id, 'text', v_row.text), 'again', true);
    end if;
    update public.ask_memory_lines set text = v_text where id = v_row.id;
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, 'ask.memory_changed', 'settings', 'workspace', p_tenant_id,
            jsonb_build_object('memory_id', v_row.id, 'by', v_actor, 'chars', char_length(v_text)));
    return jsonb_build_object('memory', jsonb_build_object('id', v_row.id, 'text', v_text), 'again', false);
  elsif p_act = 'forget' then
    -- The settings permission forgets any line; the member who kept one forgets their own while they act here (the
    -- card's Undo). A line whose keeper has gone is the settings permission's alone.
    if not found
       or not (coalesce(public.caller_has_permission(p_tenant_id, 'settings'), false)
               or (v_row.kept_by is not null and v_row.kept_by = v_actor
                   and coalesce(public.is_acting_member(p_tenant_id), false))) then
      raise exception 'Line not found.' using errcode = 'P0002';
    end if;
    if v_row.forgotten_at is not null then
      return jsonb_build_object('memory', jsonb_build_object('id', v_row.id, 'text', v_row.text), 'again', true);
    end if;
    update public.ask_memory_lines set forgotten_at = now(), forgotten_by = v_actor where id = v_row.id;
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, 'ask.memory_forgotten', 'settings', 'workspace', p_tenant_id,
            jsonb_build_object('memory_id', v_row.id, 'by', v_actor));
    return jsonb_build_object('memory', jsonb_build_object('id', v_row.id, 'text', v_row.text), 'again', false);
  end if;
  raise exception 'act is keep, change or forget' using errcode = '22023';
end $$;
revoke execute on function public.ask_memory_write(uuid, text, uuid, text, text, uuid) from public, anon;
grant execute on function public.ask_memory_write(uuid, text, uuid, text, text, uuid) to authenticated;
comment on function public.ask_memory_write(uuid, text, uuid, text, text, uuid) is
  'The one writer of Ask''s memory (decision 0070), by act, as the caller: keep (the approve permission: Ask, as the person it answers, as the turn is saved, source ask; the member on Settings › Memory, pane; or a line Ask read from how the owner writes, at their paste, learned (decision 0078); 3 to 300 characters; at most 40 live lines, every one read into each turn, error full; the same line again answers the one kept, again true; ask.memory_kept), change (the settings permission, a line of this workspace; ask.memory_changed), forget (the settings permission, or the member who kept the line while they act here, the card''s Undo; kept as forgotten, never deleted; ask.memory_forgotten). Each event names the line, never its words. Answers {memory: {id, text}, again} or {error}: empty, too_long, full; a line the caller may not touch is not found.';
