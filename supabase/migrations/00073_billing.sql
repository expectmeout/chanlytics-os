-- 00073: billing.
--
-- One row per workspace says how it pays. Every workspace on record today
-- runs on a direct arrangement (mode 'direct') and never gates; a workspace
-- that signs up from now on is mode 'stripe', and Stripe's own subscription
-- status is copied onto the row by the webhook, verbatim, so the pane and
-- the Setup row say what Stripe says. The one switch the runtime reads is
-- tenants.status (active · paused, from 00001); billing drives it for
-- stripe-mode workspaces only. Webhook deliveries are kept by event id so a
-- replay changes nothing.

create table public.billing_accounts (
  tenant_id               uuid primary key references public.tenants (id) on delete cascade,
  mode                    text not null default 'stripe' check (mode in ('stripe', 'direct')),
  stripe_customer_id      text,
  stripe_subscription_id  text,
  -- Stripe's word, or 'none' before a subscription exists.
  status                  text not null default 'none'
                          check (status in ('none','incomplete','incomplete_expired','trialing','active','past_due','canceled','unpaid','paused')),
  price_id                text,
  current_period_end      timestamptz,
  trial_end               timestamptz,
  cancel_at               timestamptz,
  cancel_at_period_end    boolean not null default false,
  card_brand              text,
  card_last4              text,
  last_payment_failed_at  timestamptz,
  last_paid_at            timestamptz,
  facts                   jsonb not null default '{}'::jsonb,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create unique index billing_accounts_customer_idx on public.billing_accounts (stripe_customer_id) where stripe_customer_id is not null;
create trigger billing_accounts_moddatetime before update on public.billing_accounts
  for each row execute function extensions.moddatetime('updated_at');

alter table public.billing_accounts enable row level security;
-- Members read their workspace's row (the pane, the Setup row); the edge writes with the service role.
create policy billing_accounts_member_select on public.billing_accounts for select
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
grant select on public.billing_accounts to authenticated;

-- A delivery is handled once. The id is Stripe's; a second delivery of the
-- same event hits the primary key and is answered 200 without a write.
create table public.billing_events (
  id           text primary key,
  type         text not null,
  tenant_id    uuid references public.tenants (id) on delete set null,
  received_at  timestamptz not null default now()
);
alter table public.billing_events enable row level security;
-- No member policy: the ledger is the edge's alone.

-- Every workspace on record keeps its direct arrangement.
insert into public.billing_accounts (tenant_id, mode, status)
select t.id, 'direct', 'active' from public.tenants t
on conflict (tenant_id) do nothing;

-- A new workspace gets its row from the provisioner, mode 'stripe', no
-- subscription yet. The body is 00072's with one more insert.
create or replace function public.provision_tenant(p_tenant_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
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

  insert into public.tenant_config (tenant_id) values (p_tenant_id)
  on conflict (tenant_id) do nothing;

  -- How the workspace pays: by card through Stripe, nothing subscribed yet.
  insert into public.billing_accounts (tenant_id, mode, status) values (p_tenant_id, 'stripe', 'none')
  on conflict (tenant_id) do nothing;
end $$;

-- The bell learns the kind; a reply held because the workspace is paused has its own reason.
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('handoff','deadman','call','number','sweep','job_failed','playbook','calendar_people','alert','review','billing'));

alter table public.escalations drop constraint if exists escalations_reason_check;
alter table public.escalations add constraint escalations_reason_check
  check (reason in ('human_token','non_text','refusal','rate_cap','policy_block',
                    'send_failed','deadman','brain_error','manual','opt_out',
                    'state_unavailable','stale','person_hold','budget','policy_ask',
                    'callback','paused'));

-- The pane repaints as the webhook writes.
alter publication supabase_realtime add table public.billing_accounts;
