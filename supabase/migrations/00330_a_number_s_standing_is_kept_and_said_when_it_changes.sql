-- 00330 · What Meta holds about a number is kept, and said when it changes.
--
-- Connect WhatsApp says what Meta will ask, and the number says what Meta holds (docs/superpowers/specs/2026-10-06-whatsapp-connect-says-what-meta-asks-design.md,
-- part 3). A connected WhatsApp number's standing with Meta -- whether it may send at all (health_status.can_send_message:
-- AVAILABLE, LIMITED, BLOCKED), what stands in the way, how its display name's review fares, whether the business is verified
-- and the tier of people it may start a conversation with in a day -- was nowhere in Chanlytics: an owner who connected a number
-- and never added the payment method Meta asks for found that the messages the business starts (reminders, campaigns) were not
-- delivered while its replies were, and nothing said so. Now the edge asks
-- Meta (apps/edge/lib/whatsapp/meta-graph.ts, numberStanding) at connection, on the six-hourly channel-quality clock, and when an
-- owner opens Connections on a standing that is missing or not AVAILABLE, and keeps each answer through channel_keep_standing:
-- the whole standing and the moment it was read are merged into the channel's config as standing and standing_read_at, BESIDE
-- quality_rating, quality_read and what the webhook keeps and never over them, and a channel.standing event { from, to } is
-- written when the word of can_send differs from the last one read (the first read has no from). The merge and the event are
-- one transaction, so neither is ever kept without the other. The Connections row says what the standing says; the edge tells the
-- owner once when a number turns BLOCKED (waba-events.ts's alert path).
--
-- Why a door and not a trigger: it is a door the edge calls with what Meta answered, as channel_keep_quality (00315) is; if
-- it fails the read is counted unreadable and the next read tries again. Nothing is backfilled: a number reads absent until
-- its first read. Either deploy order works: an edge that calls this before the migration is applied counts the read as
-- unreadable (the door is not there), and the page reads a config with no standing as nothing read yet.
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

create or replace function public.channel_keep_standing(p_tenant_id uuid, p_channel_id uuid, p_standing jsonb)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prev text;
  v_next text;
begin
  -- Meta's words are capital letters and underscores (AVAILABLE, LIMITED, BLOCKED); what is kept is a document with that
  -- word in it, and never one too large to be a few sentences of Meta's.
  v_next := p_standing ->> 'can_send';
  if jsonb_typeof(p_standing) is distinct from 'object'
     or v_next is null
     or v_next !~ '^[A-Z_]{2,24}$'
     or pg_column_size(p_standing) > 16384 then
    raise exception 'channel_keep_standing: not a standing' using errcode = '22023';
  end if;
  select c.config -> 'standing' ->> 'can_send' into v_prev
    from public.tenant_channels c
   where c.id = p_channel_id and c.tenant_id = p_tenant_id and c.kind = 'whatsapp'
     for update;
  if not found then
    return 'gone';
  end if;
  update public.tenant_channels
     set config = config || jsonb_build_object('standing', p_standing, 'standing_read_at', now())
   where id = p_channel_id and tenant_id = p_tenant_id;
  if v_prev is not distinct from v_next then
    return 'same';
  end if;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'channel.standing', 'system', 'channel', p_channel_id,
          jsonb_strip_nulls(jsonb_build_object('from', v_prev, 'to', v_next)));
  return case when v_prev is null then 'first' else 'changed' end;
end $$;
revoke all on function public.channel_keep_standing(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.channel_keep_standing(uuid, uuid, jsonb) to service_role;
comment on function public.channel_keep_standing(uuid, uuid, jsonb) is
  'Keeps what Meta holds about a workspace''s WhatsApp number (whether it may send, what stands in the way, its display name''s review, the business''s verification and tier): merges the whole standing and standing_read_at into the channel''s config beside quality_rating and quality_read, never over them, and writes channel.standing { from, to } when the word of can_send changed (no from on the first read), in one transaction. Answers first, changed, same, or gone (not this workspace''s WhatsApp channel); refuses (22023) a standing that is not an object with a can_send of two to 24 capital letters and underscores, or is over 16 KB. The edge''s door (readAndKeepStanding in apps/edge/lib/whatsapp/number-standing.ts): at connection, on the channel-quality clock, and when an owner asks.';
