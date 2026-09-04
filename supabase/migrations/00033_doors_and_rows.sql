-- 00033 Two doors that disagreed with the code above them.
--
-- (1) policies. The route (PUT /api/v1/policies) admits operators, the
--     published permissions say an operator "tunes autonomy", the Team legend
--     says it, and the Autonomy pane lets them click — but the UPDATE policy
--     from 00012 was owner-only and 00014 never widened it. RLS is silent on
--     a forbidden UPDATE (0 rows, no error), so an operator flipping the reply
--     mode was told "Policy row not found". Operators may now tune the
--     WORKSPACE rows. Person-scoped rows (subject_type = 'contact', 00029)
--     stay owner-only, matching the owner-only route that writes them.
--
-- (2) idempotency_keys. FOR ALL to any member, viewers included, and the
--     key is derived from the thread and the words — predictable. A planted
--     row could answer a colleague's real send with a stored receipt. Acting
--     members only; the reply route additionally scopes the key to the caller
--     and compares the request hash.

create policy policies_acting_member_update on public.policies
  for update
  using (public.is_acting_member(tenant_id) and subject_type is null)
  with check (public.is_acting_member(tenant_id) and subject_type is null);

drop policy if exists idempotency_member_all on public.idempotency_keys;
create policy idempotency_acting_member_all on public.idempotency_keys
  for all to authenticated
  using (public.is_acting_member(tenant_id))
  with check (public.is_acting_member(tenant_id));
