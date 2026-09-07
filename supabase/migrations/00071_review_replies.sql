-- 00071: the receptionist under a Google review.
--
-- The Autonomy matrix gains a seventh class, 'reviews': what the receptionist
-- may do under a new review on the connected Business Profile. auto answers
-- it on Google within the hour, in the business's name; ask writes a draft
-- when someone opens the reply on Reports, and a person sends it; never
-- leaves reviews to people entirely. Every workspace on record starts at
-- ask — a draft is offered, nothing is posted without a tap — and a new
-- workspace the same, through provision_tenant.

-- The CHECK learns the class. Postgres named the constraint in 00012; it is
-- found by what it says, not by a name nobody chose.
do $$
declare v_name text;
begin
  select conname into v_name
    from pg_constraint
   where conrelid = 'public.policies'::regclass
     and contype = 'c'
     and pg_get_constraintdef(oid) like 'CHECK ((class = ANY%';
  if v_name is not null then
    execute format('alter table public.policies drop constraint %I', v_name);
  end if;
end $$;

alter table public.policies
  add constraint policies_class_check
  check (class in ('reply','booking','faq','reengage','campaign','money','reviews'));

-- Every workspace on record: ask.
insert into public.policies (tenant_id, class, mode, limits)
select t.id, 'reviews', 'ask', '{}'::jsonb
  from public.tenants t
on conflict (tenant_id, class, subject_type, subject_id) do nothing;

-- New workspaces: the same row, from the provisioner. The body is 00017's
-- with one more class; the grants and the comment on the function stand.
create or replace function public.provision_tenant(p_tenant_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- The workspace-level autonomy matrix. Modes mirror the runtime's current
  -- behaviour: replies automatic, money blocked by charter, the playbook
  -- classes and review replies asking for a person.
  insert into public.policies (tenant_id, class, mode, limits)
  select p_tenant_id, c.class, c.mode,
         case when c.class = 'reply'
              then '{"max_replies_day": 20, "pause_hours": 24}'::jsonb
              else '{}'::jsonb end
  from (values
    ('faq','auto'), ('booking','auto'), ('reply','auto'),
    ('reengage','ask'), ('campaign','ask'), ('reviews','ask'), ('money','never')
  ) as c(class, mode)
  on conflict (tenant_id, class, subject_type, subject_id) do nothing;

  -- An EMPTY config row, not a populated one. A tenant with no brain section
  -- still does not speak — silence over a persona we invented for someone
  -- else. This exists so Settings can be read and written at all.
  insert into public.tenant_config (tenant_id) values (p_tenant_id)
  on conflict (tenant_id) do nothing;
end $$;
