-- 00315 · A number's quality is read on a clock, and said when it changes.
--
-- The Reports lenses spec, K9 (the number's half). A connected WhatsApp number's quality rating (GREEN, YELLOW, RED) was
-- read once, when the number was connected, and kept as tenant_channels.config.quality_rating, which numberHealth
-- (packages/contracts/src/broadcasts/broadcast-number.ts) gates broadcasts on. Meta's webhook says when a number is
-- flagged or its tier moves (kept as channel.phone_number_quality_update events) and never the rating itself, so how a
-- number's rating went over the weeks could not be read, and the connect-time word never moved. Now a six-hourly edge
-- sweep asks Meta (apps/edge/api/cron/channel-quality.ts) and keeps each answer through channel_keep_quality: the word
-- and the moment it was read are merged into the channel's config as quality_read and quality_read_at, BESIDE
-- quality_rating and never over it (what a broadcast is gated on does not change here: that is Ruben's to decide), and a
-- channel.quality_rating event { from, to } is written when the word differs from the last one read (the first read has
-- no from). The merge and the event are one transaction, so neither is ever kept without the other.
--
-- Why a sweep of its own: no sweep visits a WhatsApp channel (the playbooks sweep reads the config but only runs for a
-- workspace with a playbook, and the health sweep is a watcher whose answer must not depend on a write). The clock asks
-- the edge only when an active WhatsApp channel exists, and otherwise records that it looked, as the notes sweep does.
--
-- channel_keep_quality is a door the sweep calls, not a trigger on a live write: if it fails the sweep logs it and the
-- next tick tries again. Nothing is backfilled: a number reads absent until its first read. The order matters, unlike
-- the batch's other migrations: the edge with the channel-quality route first, then this file, because a clock that is
-- live with no route behind it asks a door that is not there, and sweep_health pages about two minutes after the first
-- tick. (Nothing else reads the keys or the kind, so nothing else depends on the order.)
--
-- The lock. tenant_channels is read and updated one row at a time; nothing here alters it. The guard of 00259 is set all
-- the same, and every statement re-runs.
set local lock_timeout = '3s';
do $$
begin
  raise notice 'lock_timeout for this migration: %', current_setting('lock_timeout');
  if current_setting('lock_timeout') <> '3s' then
    raise warning 'this file was applied outside a transaction, so SET LOCAL did nothing: run it inside begin/commit, or set lock_timeout yourself before it';
  end if;
end $$;

create or replace function public.channel_keep_quality(p_tenant_id uuid, p_channel_id uuid, p_rating text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prev text;
begin
  -- Meta's words are capital letters (GREEN, YELLOW, RED, NA, UNKNOWN); what is kept is a word, never a sentence.
  if p_rating is null or p_rating !~ '^[A-Z]{2,12}$' then
    raise exception 'channel_keep_quality: not a rating word' using errcode = '22023';
  end if;
  select c.config ->> 'quality_read' into v_prev
    from public.tenant_channels c
   where c.id = p_channel_id and c.tenant_id = p_tenant_id and c.kind = 'whatsapp'
     for update;
  if not found then
    return 'gone';
  end if;
  update public.tenant_channels
     set config = config || jsonb_build_object('quality_read', p_rating, 'quality_read_at', now())
   where id = p_channel_id and tenant_id = p_tenant_id;
  if v_prev is not distinct from p_rating then
    return 'same';
  end if;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'channel.quality_rating', 'system', 'channel', p_channel_id,
          jsonb_strip_nulls(jsonb_build_object('from', v_prev, 'to', p_rating)));
  return case when v_prev is null then 'first' else 'changed' end;
end $$;
revoke all on function public.channel_keep_quality(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.channel_keep_quality(uuid, uuid, text) to service_role;
comment on function public.channel_keep_quality(uuid, uuid, text) is
  'Keeps the rating Meta holds for a workspace''s WhatsApp number (K9): merges quality_read and quality_read_at into the channel''s config beside quality_rating, never over it, and writes channel.quality_rating { from, to } when the word changed (no from on the first read), in one transaction. Answers first, changed, same, or gone (not this workspace''s WhatsApp channel); refuses (22023) a word that is not 2 to 12 capital letters. The channel-quality sweep''s door (readNumberQualities in apps/edge/lib/whatsapp/number-quality.ts).';

create or replace function public.trigger_channel_quality_sweep()
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if exists (select 1 from public.tenant_channels c where c.kind = 'whatsapp' and c.status = 'active') then
    return public.request_sweep('channel_quality', '/api/cron/channel-quality');
  end if;
  insert into public.sweep_status (sweep, requested_at) values ('channel_quality', now())
  on conflict (sweep) do update set requested_at = excluded.requested_at;
  return null;
end $$;
revoke execute on function public.trigger_channel_quality_sweep() from public, anon, authenticated;
comment on function public.trigger_channel_quality_sweep() is
  'The channel-quality sweep''s clock (K9). Calls the edge (/api/cron/channel-quality) only when an active WhatsApp channel exists; otherwise records that it looked.';

insert into public.sweep_status (sweep, jobname, max_silence, judged_by, requested_at) values
  -- every six hours, recording itself each time: nineteen hours is three missed ticks and an hour.
  ('channel_quality', 'channel-quality-sweep', interval '19 hours', 'request', now())
on conflict (sweep) do update
   set jobname = excluded.jobname, max_silence = excluded.max_silence, judged_by = excluded.judged_by;

select cron.unschedule('channel-quality-sweep') where exists (select 1 from cron.job where jobname = 'channel-quality-sweep');
select cron.schedule('channel-quality-sweep', '41 */6 * * *', $$select public.trigger_channel_quality_sweep()$$);
