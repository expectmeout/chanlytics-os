-- 00124 · a deletion request blocks first, and the erased are not brought back.
--
-- The erasure route (contacts/[id], DELETE) queued the Blob job, removed the
-- Storage objects, and only then tombstoned the rows -- so a Storage refusal
-- left the person live and answered, with their stored transcript already
-- queued for deletion, until the owner tried again. And the tombstone kept
-- nothing by which the person could be recognised: the calendar import read
-- "not erased" on its match and then inserted them again by their number,
-- with their name from the event; a late call event did the same.
--
-- Two columns. erasing_since is the request: written by the route before
-- anything is destroyed, so the wire refuses the person from that moment
-- (deliver.ts reads it beside erased_at) whatever happens to the later legs.
-- erased_phone_hash is a keyed digest of the number, written at the same
-- moment while the number still exists: sha256 of "<tenant id>:<E.164>",
-- hex. Passive re-entry -- the calendar import, a call event for a call that
-- began before the request -- consults it and leaves the person erased. A
-- new message or a new call from the number is the person coming back, and
-- makes a new person as before. The digest is not the number: it is tenant-
-- keyed, and it exists so the promise "you will not be brought back by your
-- own appointment" can be kept. Not readable by a session: no column grant.
alter table public.contacts
  add column if not exists erasing_since timestamptz,
  add column if not exists erased_phone_hash text;

comment on column public.contacts.erasing_since is
  'A deletion request, written before anything is destroyed: from this moment the wire refuses the person. erased_at is the completion.';
comment on column public.contacts.erased_phone_hash is
  'sha256 hex of "<tenant_id>:<E.164>", written when the erasure begins and the number still exists, so the calendar import and a late call event do not bring the person back.';

create index if not exists contacts_erased_phone_hash_idx
  on public.contacts (tenant_id, erased_phone_hash)
  where erased_phone_hash is not null;
