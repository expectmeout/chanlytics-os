-- 00029 Receptionist mode per person.
--
-- policies reserved subject_type = 'contact' for exactly this (R4, Session A):
-- a guardrail is a policy scoped to a subject. The workspace-level reply row
-- has always been update-only for owners. A PERSON-scoped reply row is added
-- and removed as the owner sets "Answer / Ask me first / Never" for one
-- customer, so owners may now insert and delete those rows — and only those:
-- class 'reply', subject_type 'contact', a subject. The workspace row's
-- update-only rule is untouched, and the money lock still binds every insert.
--
-- The edge reads the person's row once per inbound message (never cached:
-- "Never" for a difficult customer must apply to their NEXT message), so the
-- lookup gets its own partial index on the unique key's leading columns.

create policy policies_owner_insert_person on public.policies for insert
  with check (
    subject_type = 'contact'
    and subject_id is not null
    and class = 'reply'
    and tenant_id in (select m.tenant_id from public.memberships m
                       where m.user_id = (select auth.uid()) and m.role = 'owner')
  );

create policy policies_owner_delete_person on public.policies for delete
  using (
    subject_type = 'contact'
    and tenant_id in (select m.tenant_id from public.memberships m
                       where m.user_id = (select auth.uid()) and m.role = 'owner')
  );

create index if not exists policies_person_reply_idx
  on public.policies (tenant_id, subject_id)
  where subject_type = 'contact' and class = 'reply';
