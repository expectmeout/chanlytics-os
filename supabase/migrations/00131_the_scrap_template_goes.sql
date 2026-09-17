-- The scrap template goes.
--
-- 00004 wrote one template row straight into one workspace's database:
--
--   insert into templates (tenant_id, channel, name, language, meta_status, ...)
--   select id, 'whatsapp', 'booking_link_v1', 'en_US', 'approved', ...
--     from tenants where slug = 'melanys-beauty-salon'
--
-- It was made to see how the system worked, and it was never anything else.
-- But `meta_status = 'approved'` with no `meta_id` asserts an approval Meta
-- never gave, so the row is a claim about somebody else's system that is not
-- true: every send of it was rejected at the wire, and the phone agent -- which
-- named it by literal -- told the caller "that number may not have WhatsApp",
-- which is the wrong cause. For every OTHER workspace the same literal named a
-- row that does not exist at all.
--
-- So it is deleted rather than hidden. A template row's whole job is to say
-- what this workspace may send; one that says something untrue is worse than
-- none, because none is an answer the product now knows how to give out loud.
--
-- What replaces it is not another row: it is the `booking_link` starter in
-- contracts/template-library.ts, which a workspace submits to Meta like any
-- other and which arrives with the status Meta actually gave it. The phone
-- agent asks `bookingTemplate` for the workspace's own -- approved, fillable,
-- carrying the link -- and says so plainly when there is none.
--
-- History is untouched: `messages.template_name` is text, not a reference, so
-- every message ever sent under this name keeps saying so.

delete from public.templates
 where channel = 'whatsapp'
   and name = 'booking_link_v1'
   -- Only the hand-written row. If a workspace has since put a template of this
   -- name through Meta, that one is real and is theirs to keep.
   and meta_id is null;
