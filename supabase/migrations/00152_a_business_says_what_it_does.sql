-- 00152 · A business says what it does.
--
-- The ninth refusal of the live A2P campaign (30919, 22 Sep 2026) was filed
-- against USE_CASE_DESCRIPTION: "The website lacks sufficient detail for the
-- review team to verify the operational business model. Expand the website
-- content to describe the products, services, and industry clearly." The
-- record held who a business is (legal name, address, contact) and its
-- industry as Twilio's enum, but nothing said WHAT IT DOES. The hosted pages
-- could only list services, and the campaign description only said
-- "appointments", which describes a salon and not the software company that
-- filed it.
--
-- `about` is that sentence, written by the owner. The business page, the
-- sign-up page and the campaign description all read it. It holds 500
-- characters, which keeps the description well inside Twilio's 4096. It
-- defaults to empty so every existing row stays valid. The form asks for it,
-- and the pre-flight holds a filing until it is there.
--
-- Re-runnable: the column and the constraint are both guarded.

alter table public.business_records add column if not exists about text not null default '';

alter table public.business_records drop constraint if exists business_records_about_length;
alter table public.business_records
  add constraint business_records_about_length check (char_length(about) <= 500);
