-- 00047 Templates made here.
--
-- Until now every template was written in WhatsApp Manager and read by the
-- sync. Now a business can write one in Chanlytics — drafted with the
-- assistant, submitted to Meta for review, tracked to approval by the
-- webhook — so the table says where each came from and who made it. A
-- template made here can also be deleted here; one made in WhatsApp Manager
-- can be deleted here too, since Meta's delete is the same call.

alter table public.templates
  add column source     text not null default 'meta' check (source in ('meta', 'chanlytics')),
  add column created_by uuid references auth.users (id) on delete set null;

comment on column public.templates.source is
  'meta: written in WhatsApp Manager and read by the sync. chanlytics: written here and submitted to Meta.';
