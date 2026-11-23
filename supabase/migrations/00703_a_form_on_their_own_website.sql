-- 00703 · A form on the business's own website, in a frame (the Forms plan, step F4 and its 3.11; Ruben's call 15 of
-- 22 November 2026: the hosted form inside their page, on an address of its own that names the sites it may be framed
-- on; a few lines to paste, and no key in the page).
--
-- A website is one more place a form is shared, so it is one more link (00680): its code is the framed address
-- (/f/<code>), its opens and requests are counted as every link's are, and a confirmed visit it brought is the form's
-- by the same rule. What makes it the website's is the list of sites the form may show on, held on the link itself:
--
--   links.sites             The sites, each a host as an owner types it without its www. ("luma-salon.com"), ten at
--                           most; null for every other place. The framed address names them, and only them, as the
--                           frame's ancestors, so a copy of the lines on anyone else's page shows nothing: the list is
--                           held by the visitor's own browser. A member who may act adds and removes them under the
--                           table's row rules, as they make, rename and stop a link. One website link a form.
--   form_entries.held_why   Widened with `elsewhere`: an entry that did not come from the form's own page (sent
--                           straight to its address by a script or another site) is held for a look, as a doubtful
--                           entry is: never the bell, never counted, never lost. The page holds no secret, so nothing
--                           it carries is proof, and nothing trusts it as proof.
--
-- No door is new or re-made: form_request_take keeps whatever reason it is given, and link_open answers the framed
-- address as it answers /l/. Deploy order: either. The code before it never names the column or the reason; the code
-- after it reads `sites` as null on every link until a member adds one. Re-runnable.

set local lock_timeout = '3s';

/* ---------------------------------------------------------------------- 1. the sites a form may show on -- */

alter table public.links add column if not exists sites text[];

-- Each a host, lower case, without a scheme, a path or a port; none missing; ten at most.
alter table public.links drop constraint if exists links_sites_check;
alter table public.links add constraint links_sites_check
  check (sites is null or (
    cardinality(sites) <= 10
    and array_position(sites, null) is null
    and (cardinality(sites) = 0
         or array_to_string(sites, ' ') ~
            '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+( [a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+)*$')
  ));

-- A form has one website: its lines are the same wherever they are pasted, and its sites one list.
create unique index if not exists links_one_website_a_form
  on public.links (tenant_id, subject_type, subject_id) where sites is not null;

grant insert (sites) on public.links to authenticated;
grant update (sites) on public.links to authenticated;

comment on column public.links.sites is
  'The sites a form may show on, framed in their own page (00703; the Forms plan, F4): each a host without its www. ("luma-salon.com"), ten at most. Null for every place that is not the website; one website link a form. The framed address (/f/<code>) names these, and only these, as its frame-ancestors, so a browser shows the form on no other site. A member who may act adds and removes them.';

/* ------------------------------------------------------------------ 2. an entry sent from somewhere else -- */

alter table public.form_entries drop constraint if exists form_entries_held_why_check;
alter table public.form_entries add constraint form_entries_held_why_check
  check (held_why is null or held_why in ('hidden_field', 'too_fast', 'too_many', 'member', 'elsewhere'));

comment on column public.form_entries.held_why is
  'Why the entry is held for a look, with state held: a field people cannot see was filled (hidden_field), filled in faster than a person can (too_fast), too many from one sender or to one form (too_many), a member said it is not a real request (member), or it was sent straight to the form''s address and not from its own page (elsewhere, 00703).';
