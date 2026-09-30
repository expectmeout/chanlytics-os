-- 00278 · A session inserts only the columns the product writes through it.
--
-- Supabase hands authenticated INSERT on every table in public, and a row policy decides which rows a member may add,
-- never which columns. 00121 fenced UPDATE the same way, for the same reason. Twelve tables let a member's session
-- insert (an INSERT policy for authenticated), and on each the whole-table grant let that session write any column
-- the policy's predicate did not look at: a message that names a provider's id, a delivery time or a media path (the
-- edge writes those, and the send path trusts them), a broadcast that starts life "finished" with a failure text and
-- a stamp, a playbook that starts with its last run already written (a run day the sweep then skips), a decision
-- with an id and a time of its own chosen, an Ask message under any thread. No row of another workspace could be
-- reached: 00270 made each policy name only its own workspace's rows.
--
-- Each grant below is the columns the dashboard's session writes to that table today, read off the code that writes
-- it (the listed file), and every column NOT NULL without a default is among them. A column the edge, a definer
-- function or a trigger owns is not: those run as the service role or the function's owner, which none of this
-- touches, and no invoker trigger inserts into these tables. `id` and `created_at` default on all but the two
-- tables whose rows are born with an id of their own (messages, an email reply's) or a stamp the client keeps
-- (idempotency_keys, capability_activations).
--
-- REVOKE INSERT takes back every column INSERT granted on the table too, so each revoke is followed by its whole
-- list. A later table gets the default whole-table grant back: privileges.db.test.mjs (insert_fence) fails a table
-- a session can insert into that still holds one. Re-runnable: revoke and grant restate what they say.

set local lock_timeout = '3s';

-- apps/dashboard/src/server/ask/store.ts
revoke insert on public.ask_threads from authenticated, anon;
grant insert (tenant_id, user_id, title, scope) on public.ask_threads to authenticated;

revoke insert on public.ask_messages from authenticated, anon;
grant insert (thread_id, tenant_id, user_id, role, content) on public.ask_messages to authenticated;

-- apps/dashboard/src/server/ports/campaign-ports.ts: the run's row, then the people on it. The edge owns the run's
-- start and finish, its failure, the count it sent, and each recipient's state, reason, message and time.
revoke insert on public.broadcasts from authenticated, anon;
grant insert (tenant_id, name, template_id, template_name, template_language, params, audience, state,
              scheduled_for, recipient_count, created_by, playbook_id, run_for)
  on public.broadcasts to authenticated;

revoke insert on public.broadcast_recipients from authenticated, anon;
grant insert (broadcast_id, contact_id, tenant_id, facts) on public.broadcast_recipients to authenticated;

-- apps/dashboard/app/api/v1/capabilities/[kind]/route.ts
revoke insert on public.capability_activations from authenticated, anon;
grant insert (tenant_id, capability, activated_at, activated_by, deactivated_at, note)
  on public.capability_activations to authenticated;

-- apps/dashboard/src/server/verbs.ts (recordDecision)
revoke insert on public.decisions from authenticated, anon;
grant insert (tenant_id, subject_type, subject_id, verb, actor_type, actor_user_id, payload, undo_of)
  on public.decisions to authenticated;

-- packages/db/src/repositories/idempotency.ts
revoke insert on public.idempotency_keys from authenticated, anon;
grant insert (tenant_id, key, route, request_hash, response, created_at) on public.idempotency_keys to authenticated;

-- apps/dashboard/src/server/ports/core-ports.ts (a person's reply, queued). The provider's id, its timestamps, the
-- media and the error are the edge's; a reply is born queued, from a person, and the send job moves it.
revoke insert on public.messages from authenticated, anon;
grant insert (id, tenant_id, conversation_id, contact_id, channel, direction, sender, sent_by, type, body,
              template_name, template_vars, content_hash, status, meta)
  on public.messages to authenticated;

-- apps/dashboard/app/api/v1/playbooks/route.ts. The last run, and the reach-out chain's columns, are the edge's.
revoke insert on public.playbooks from authenticated, anon;
grant insert (tenant_id, name, trigger, list_id, list_key, template_id, template_name, template_language, params,
              policy_class, state, run_hour, cap_per_run, gap_days, cadence_days, created_by)
  on public.playbooks to authenticated;

-- packages/db/src/repositories/control-plane.ts and apps/dashboard/app/api/v1/policies/route.ts
revoke insert on public.policies from authenticated, anon;
grant insert (tenant_id, class, mode, subject_type, subject_id, limits) on public.policies to authenticated;

-- packages/db/src/repositories/lists.ts
revoke insert on public.segments from authenticated, anon;
grant insert (tenant_id, name, created_by, rule) on public.segments to authenticated;

revoke insert on public.segment_members from authenticated, anon;
grant insert (segment_id, contact_id, tenant_id, added_by) on public.segment_members to authenticated;
