-- 00045 Templates as Meta holds them.
--
-- The templates table knew a name, a language and three statuses, and its
-- one row was written by hand. A broadcast needs more truth than that: the
-- category (a marketing template needs the customer's yes; a utility one
-- does not), the two statuses WhatsApp can put a template into after
-- approval (paused, disabled), why one was rejected, the components as Meta
-- returns them, the quality score, and when the row last matched Meta. The
-- rows are written by the sync (edge, service role) and by the template
-- status webhook; the session client keeps reading them and never writes.
--
-- packages/contracts/src/enums.ts TEMPLATE_STATUSES carries the same list,
-- and tooling/scripts/tests/enums-vs-checks.test.mjs fails if the two drift.

alter table public.templates
  add column category        text check (category in ('marketing', 'utility', 'authentication')),
  add column meta_id         text,
  add column components      jsonb,
  add column quality         text,
  add column rejected_reason text,
  add column synced_at       timestamptz;

alter table public.templates drop constraint if exists templates_meta_status_check;
alter table public.templates add constraint templates_meta_status_check
  check (meta_status in ('approved', 'pending', 'rejected', 'paused', 'disabled'));

comment on column public.templates.category is
  'Meta''s category: marketing (needs the customer''s recorded yes), utility, authentication. Null until synced.';
comment on column public.templates.synced_at is
  'When the row last matched what Meta returned. Null means written by hand or by a webhook only.';
