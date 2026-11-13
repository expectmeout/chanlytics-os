-- 00624 · A policy changes in one write: its dials merged where they are kept, its mode only when one is given, and the
--         change's row on the ledger with it.
--
-- How it runs (Settings › Autonomy, and Ask's card) saves one class's row of `policies`: its mode, and the dials its
-- `limits` holds (the reply row's delay, confidence, day's budget, cap, pause and time to answer). The save was three
-- steps in the app (packages/db setPolicyMode under the dashboard's changePolicy): read the row, merge the dial into the
-- limits it read, write the mode and the limits back; and then a fourth, the change's row in `events`, written as the
-- service role, best effort.
--
--   two saves at once   each merged over the limits it had read, and the second wrote the first's dial away.
--   a dial and a mode   a dial alone still wrote the mode it had read, so a mode a teammate changed in between (the
--                       replies turned off) was put back.
--   the ledger          a change whose `policy.changed` row failed to write stood with no record: `policies` keeps no
--                       history of its own, as `tenant_config` does (tenant_config_versions).
--
--   policy_change   A member's change to their workspace's own row for a class, as one statement: the mode when one is
--                   given (none: the row keeps its own), the dials merged into the limits where they are kept, and the
--                   `policy.changed` row the app wrote (the class, the mode, the dials' names and never their values,
--                   who, and the card when one was tapped), in the same transaction. Under the rule the table's update
--                   policy states for such a row (policies_member_update: is_acting_member, which an owner's seat
--                   passes). The money lock is its trigger's, as before. Answers the row, or none where the workspace
--                   has no row for the class.
--
-- Deploy order: this file first. The dashboard that calls the door is the same pull request's, which merges once this
-- is on production; a dashboard from before it writes the table as it did.
-- Re-runnable.
set local lock_timeout = '3s';

create or replace function public.policy_change(
  p_tenant_id uuid,
  p_class text,
  p_mode text default null,
  p_limits jsonb default null,
  p_via text default null
)
returns setof public.policies
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user  uuid := auth.uid();
  v_dials jsonb := coalesce(p_limits, '{}'::jsonb);
  v_row   public.policies;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  -- Who may, as the table's update policy says it of a workspace's own row (policies_member_update): a member who acts
  -- for the workspace, a partner's seat only on a session that showed its second factor.
  if p_tenant_id is null or not public.is_acting_member(p_tenant_id) then
    raise exception 'Only a member who acts for the workspace can change how it runs.' using errcode = '42501';
  end if;
  if jsonb_typeof(v_dials) <> 'object' then
    raise exception 'The dials are names and their values.' using errcode = '22023';
  end if;
  -- One statement: a second change of the same row waits for this one and then merges over what it wrote, and a mode
  -- not given is never written.
  update public.policies p
     set mode = coalesce(p_mode, p.mode),
         limits = p.limits || v_dials
   where p.tenant_id = p_tenant_id and p.class = p_class and p.subject_type is null
  returning p.* into v_row;
  if v_row.id is null then
    return;
  end if;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (
    p_tenant_id, 'policy.changed', 'system', 'workspace', p_tenant_id,
    jsonb_build_object(
      'class', v_row.class,
      'mode', v_row.mode,
      'fields', (select coalesce(jsonb_agg(k order by k collate "C"), '[]'::jsonb) from jsonb_object_keys(v_dials) as k),
      'by', v_user
    ) || case when p_via is null then '{}'::jsonb else jsonb_build_object('via', p_via) end
  );
  return next v_row;
end $$;
revoke all on function public.policy_change(uuid, text, text, jsonb, text) from public, anon;
grant execute on function public.policy_change(uuid, text, text, jsonb, text) to authenticated, service_role;
comment on function public.policy_change(uuid, text, text, jsonb, text) is
  'A member''s change to their workspace''s own policy row for a class, as one write (00624): the mode when one is given, the dials merged into the limits on file, and the policy.changed row on the ledger with it. Under the table''s update rule for such a row (is_acting_member); the money lock is the trigger''s. Answers the row, or none where there is no row for the class.';
