-- 00050 · A template's title: the words the workspace calls it by.
--
-- Meta's name is the wire's — lowercase, underscores, fixed once submitted.
-- The title is the workspace's: shown in the composers, on cards, in
-- Settings, and in a broadcast's or playbook's default name. Empty means
-- "call it by its name". Owner or operator, through the definer door.

alter table public.templates add column if not exists title text;
alter table public.templates drop constraint if exists templates_title_check;
alter table public.templates add constraint templates_title_check
  check (title is null or char_length(title) between 1 and 60);
comment on column public.templates.title is
  'What the workspace calls the template; null means its Meta name, made words. Never sent anywhere.';

create or replace function public.set_template_title(p_template_id uuid, p_title text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user   uuid := auth.uid();
  v_tenant uuid;
  v_title  text := nullif(btrim(regexp_replace(coalesce(p_title, ''), '\s+', ' ', 'g')), '');
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if v_title is not null and char_length(v_title) > 60 then
    raise exception 'A title is at most 60 characters.' using errcode = '22023';
  end if;
  select t.tenant_id into v_tenant from templates t where t.id = p_template_id;
  if v_tenant is null or not public.is_acting_member(v_tenant) then
    raise exception 'Template not found.' using errcode = 'P0002';
  end if;
  update templates set title = v_title where id = p_template_id;
  return jsonb_build_object('template_id', p_template_id, 'title', v_title);
end $$;

revoke execute on function public.set_template_title(uuid, text) from public, anon;
grant execute on function public.set_template_title(uuid, text) to authenticated;
comment on function public.set_template_title(uuid, text) is
  'Owner or operator names a template in the workspace''s own words; empty clears it. Meta''s name is untouched.';
