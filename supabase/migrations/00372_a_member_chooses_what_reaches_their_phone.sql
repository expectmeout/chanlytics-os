-- 00372 · A member chooses what reaches their phone (decision 0040).
--
-- The push_send job told every phone of every member of a workspace each kept notification of a kind phones are told
-- (contracts PUSH_KINDS), whatever the member's role, and nothing anywhere let one of them say no. Each member chooses
-- now, for themselves, in Settings › Notifications: the kinds their phones are not told in this workspace live on their
-- own membership row, as the views their pages remember do (00113), written through one door that judges the caller's
-- own membership and read through the row the member may already read (memberships_self_select). A member who leaves
-- takes the choice with the row.
--
-- The kinds are strings, read leniently (contracts pushOffOf): a kind a newer build writes is ignored by an older one,
-- and the job that reads them asks contracts which are real. A job older than this column never reads it; a job newer
-- than it reads an empty list until this is applied (packages/jobs pushSend), so either order of deploy works.
--
-- And a note left for a member reaches their phone, as the bell's two lead kinds do (00242): note_for_you is a kind
-- phones are told, and the function that keeps its row queued no push_send, so no phone ever heard of one.
--
-- Re-runnable: the column is `if not exists`, the functions `create or replace`. memberships is read under every row
-- policy, so the column waits three seconds for its lock at most, and the push fails and is tried again rather than
-- queueing every read behind it.

set local lock_timeout = '3s';

alter table public.memberships add column if not exists push_off text[] default '{}'::text[];

comment on column public.memberships.push_off is
  'The notification kinds this member''s phones are not told in this workspace (decision 0040): ["call", ...]; null or empty is none. Written through member_push_off_set; read by the push_send job.';

create or replace function public.member_push_off_set(p_tenant_id uuid, p_kinds text[])
returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_off  text[];
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_kinds is null or cardinality(p_kinds) > 40
     or exists (select 1 from unnest(p_kinds) k where k is null or k !~ '^[a-z][a-z_]{0,39}$') then
    raise exception 'The kinds are a short list of short lowercase names.' using errcode = '22023';
  end if;
  update public.memberships
     set push_off = (select coalesce(array_agg(distinct k order by k), '{}'::text[]) from unnest(p_kinds) k)
   where tenant_id = p_tenant_id and user_id = v_user
     -- A partner's seat counts for this session only with its second factor (00261, 00280).
     and (role <> 'partner' or public.session_shows_second_factor())
  returning push_off into v_off;
  if not found then
    raise exception 'Not a member of this workspace.' using errcode = '42501';
  end if;
  return v_off;
end $$;

comment on function public.member_push_off_set(uuid, text[]) is
  'Remembers which notification kinds the caller''s phones are not told in one workspace: their own membership row, judged by auth.uid(). Answers the list as kept, each kind once.';

revoke execute on function public.member_push_off_set(uuid, text[]) from public, anon;
grant execute on function public.member_push_off_set(uuid, text[]) to authenticated;

-- As 00158 left it, with the push the bell's row now carries.
create or replace function public.note_for_you_notify(p_tenant_id uuid, p_contact_id uuid, p_note_id uuid, p_by uuid, p_for uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_by     text;
  v_person text;
  v_id     uuid;
begin
  if p_for is null or p_for = p_by then
    return;
  end if;
  select coalesce(nullif(btrim(p.display_name), ''), split_part(u.email, '@', 1), 'A teammate')
    into v_by
    from auth.users u left join profiles p on p.user_id = u.id
   where u.id = p_by;
  select coalesce(nullif(btrim(c.display_name), ''), nullif(btrim(c.wa_profile_name), ''), c.phone_e164, 'someone')
    into v_person
    from contacts c where c.id = p_contact_id;
  insert into notifications (tenant_id, kind, title, body, route, subject_type, subject_id, recipient_user_id)
  values (
    p_tenant_id, 'note_for_you',
    left(format('%s left you a note on %s', coalesce(v_by, 'A teammate'), coalesce(v_person, 'someone')), 200),
    'It is on their page.',
    'clients/' || p_contact_id::text,
    'contact', p_contact_id::text, p_for
  )
  returning id into v_id;
  -- The phone hears what the bell hears (00162's push_send, payload { notification_id }); the job tells the member it
  -- is for alone (recipient_user_id), unless they turned notes off for their phones.
  insert into public.jobs (tenant_id, kind, due_at, payload)
  values (p_tenant_id, 'push_send', now(), jsonb_build_object('notification_id', v_id));
end $$;

comment on function public.note_for_you_notify(uuid, uuid, uuid, uuid, uuid) is
  'Tell the member a note is for that it is there (0007): a note_for_you notification addressed to them, naming the writer and the person, never the words, and a push_send job so their phone hears it (00372). Nothing when the note is for its own writer. Called only by the note doors.';
