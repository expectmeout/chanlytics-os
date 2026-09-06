-- 00049 · Templates hidden from the composers.
--
-- A number's WhatsApp account holds templates the workspace never sends by
-- hand: Meta's own sample (hello_world), the receptionist's operational
-- templates, a shared account's other businesses'. They belong on file —
-- syncs keep them, the wire may still send them by name — but not in the
-- composers, where they read as clutter. The workspace hides and shows them;
-- Meta's sample is hidden on first sight by the sync.

alter table public.templates add column if not exists hidden_at timestamptz;
comment on column public.templates.hidden_at is
  'Hidden from the composers by the workspace (or on first sight, for Meta''s sample). The row stays, syncs keep it, the wire may still send it by name.';

update public.templates set hidden_at = now() where name = 'hello_world' and hidden_at is null;

-- The door: owner or operator (is_acting_member), never a viewer; the caller
-- is auth.uid(), read here (00021's rule); a stranger reads not found
-- (00027's rule). Hiding twice keeps the first time.
create or replace function public.set_template_hidden(p_template_id uuid, p_hidden boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user   uuid := auth.uid();
  v_tenant uuid;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_hidden is null then
    raise exception 'Say whether the template is hidden.' using errcode = '22023';
  end if;
  select t.tenant_id into v_tenant from templates t where t.id = p_template_id;
  if v_tenant is null or not public.is_acting_member(v_tenant) then
    raise exception 'Template not found.' using errcode = 'P0002';
  end if;
  update templates
     set hidden_at = case when p_hidden then coalesce(hidden_at, now()) else null end
   where id = p_template_id;
  return jsonb_build_object('template_id', p_template_id, 'hidden', p_hidden);
end $$;

revoke execute on function public.set_template_hidden(uuid, boolean) from public, anon;
grant execute on function public.set_template_hidden(uuid, boolean) to authenticated;
comment on function public.set_template_hidden(uuid, boolean) is
  'Owner or operator hides a template from the composers, or shows it again. The row stays; only what the composers offer changes.';
