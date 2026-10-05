-- 00291 · A lead keeps when it changed stage, and is told when it is set aside.
--
-- The Reports lenses spec, K5. A lead's stage is overwritten by every writer that moves it (the member's door, the bulk
-- door, a conversion, a person's no, its undo, the contact trigger that links a lead, the nightly purge) and nothing kept
-- when, so "time in each stage" and the leads stuck now could not be read. Now leads.stage_at is the moment the lead
-- entered the stage it is in and leads.stage_from the stage it left, both stamped by one trigger on the stage itself:
-- every writer is held and none is restated (as 00290 holds an escalation's). A new row's stage_at is its birth, by the
-- column's default; no row is backfilled, so a lead from before reads null (unknown) and a tile treats null as absent.
-- stage_from is said in one place, the stamp's own write of it (leads_stamp_stage), and everything that wants to say where
-- a lead came from reads that column and never works it out again: lead.set_aside below, and 00292's lead.stage event.
--
-- A lead that is set aside as stale (archived, closed stale: the product's word, retention.ts) wrote no event when the
-- nightly purge did it, and one set to stale by hand (lead_set_stage allows the reason) wrote only a lead.stage. Now the
-- move into it, by the sweep or by hand, writes lead.set_aside { stage, reason, from }: a kind of its own, not
-- lead.stage, because lead.stage shows in the owner's Activity log and a nightly run would put one line per lead there.
-- lead_is_set_aside is the one predicate the trigger asks of the old row and the new, so only the move into it writes:
-- blanking at 180 days leaves the stage alone and writes nothing, and a lead restored (lead_undo) and swept again is set
-- aside again, which is true, and writes a second. `from` is the stage the lead left to be set aside: the row's stage_from
-- when its stage moved, and null when it was already archived and only its reason changed (nothing moved, so there is no
-- stage it left, and the exit it made earlier is not counted a second time). The purge itself is not restated.
--
-- The stamp reads and writes only its own row, so it has nothing to trap. The event's write traps its own failure: a lead
-- set aside with no event is a warning, never a failed purge. Either deploy order works (nothing reads these yet), but
-- the apps deploy first: in the migrations-first order an older dashboard's Activity log shows lead.set_aside as a plain
-- "Lead · set aside" line for each lead the first nightly purge sweeps, because that build does not hide the new kind.
--
-- The lock. The columns are added first and take ACCESS EXCLUSIVE on leads, held to commit (a re-run takes it too, before it
-- finds them there); everything after runs under it and waits for no other table. The triggers are made with create or
-- replace trigger, which takes only SHARE ROW EXCLUSIVE. One table, one wait, bounded by 00259's 3 s guard; if it times out
-- nothing was applied and the owner re-runs it when the line is quiet. Every statement re-runs.
set local lock_timeout = '3s';
do $$
begin
  raise notice 'lock_timeout for this migration: %', current_setting('lock_timeout');
  if current_setting('lock_timeout') <> '3s' then
    raise warning 'this file was applied outside a transaction, so SET LOCAL did nothing: run it inside begin/commit, or set lock_timeout yourself before it';
  end if;
end $$;

alter table public.leads add column if not exists stage_at timestamptz;
alter table public.leads add column if not exists stage_from text;
-- A default for the rows still to be written, never for the ones there: adding the column with it would date every lead at this file.
alter table public.leads alter column stage_at set default now();

comment on column public.leads.stage_at is
  'When the lead entered the stage it is in (K5): its birth for a new row, the move for any later one, stamped by leads_stamp_stage whoever writes the stage. Null for a lead from before 00291: unknown, never now.';
comment on column public.leads.stage_from is
  'The stage the lead was in before the move that stamped stage_at (K5); null until it moves. The one place a lead''s "from" is said: lead.set_aside and 00292''s lead.stage event read it.';

create or replace function public.lead_is_set_aside(p_stage text, p_closed_reason text)
returns boolean
language sql
immutable
set search_path = public
as $$
  -- The purge's word for an untouched lead (purge_leads, 00140): archived, and closed stale.
  select coalesce(p_stage = 'archived' and p_closed_reason = 'stale', false)
$$;

revoke all on function public.lead_is_set_aside(text, text) from public, anon;
grant execute on function public.lead_is_set_aside(text, text) to authenticated, service_role;
comment on function public.lead_is_set_aside(text, text) is
  'A lead is set aside when it is archived and closed stale: the nightly purge''s word for a lead nobody worked, and what a hand that sets a lead to stale makes it too (K5). leads_note_set_aside asks it of the old row and the new.';

create or replace function public.leads_stamp_stage()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  NEW.stage_at := now();
  NEW.stage_from := OLD.stage;
  return NEW;
end $$;

revoke all on function public.leads_stamp_stage() from public, anon, authenticated;
comment on function public.leads_stamp_stage() is
  'Stamps stage_at and stage_from when a lead''s stage changes, whoever writes it (K5). Reads and writes only its own row.';

create or replace trigger leads_stamp_stage before update of stage on public.leads
  for each row when (old.stage is distinct from new.stage)
  execute function public.leads_stamp_stage();

create or replace function public.leads_note_set_aside()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (NEW.tenant_id, 'lead.set_aside', 'lead', 'lead', NEW.id,
          jsonb_build_object('stage', NEW.stage, 'reason', NEW.closed_reason,
                             'from', case when OLD.stage is distinct from NEW.stage then NEW.stage_from end));
  return null;
exception when others then
  raise warning 'leads_note_set_aside: %', sqlerrm;
  return null;
end $$;

revoke all on function public.leads_note_set_aside() from public, anon, authenticated;
comment on function public.leads_note_set_aside() is
  'Writes lead.set_aside { stage, reason, from } when a lead moves into the set-aside, by the nightly purge or by hand (K5); from is the row''s stage_from when the stage moved, and null when it did not (a lead already archived, closed stale). Never fails the update: a failure is a warning.';

create or replace trigger leads_note_set_aside after update of stage, closed_reason on public.leads
  for each row
  when (public.lead_is_set_aside(new.stage, new.closed_reason) and not public.lead_is_set_aside(old.stage, old.closed_reason))
  execute function public.leads_note_set_aside();
