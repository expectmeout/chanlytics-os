-- 00721 · The edge's changes write their own events (lanes 9 and 2 of the code refinement plan, finished together,
-- 26 Nov 2026: layer 10's invariant 2, a change and its event in one transaction, written by its door).
--
-- Each kind the edge and the jobs wrote from TypeScript after a door's or a repository's write is written by the SQL
-- door that makes the change, in its transaction, with the same kind, category, subject and data:
--
--   mailbox_connection_move   New: a connected mailbox's every move (the connect that stood, a pause and its end, a
--                             hold and its resume, a sign-out, a removal), each with its kind, where the edge
--                             patched the row and wrote the event after it.
--   billing_apply             Re-made with p_told: the billing row's change and its kind (billing.updated, .paused,
--                             .resumed, .paid, .payment_failed), where the edge wrote the event after the write. A
--                             reading another one beat writes neither.
--   lines_tell_their_moves    New trigger: a line's move to answering or failed, and its forwarding to verified, write
--                             line.answering, line.failed and line.forwarding_verified in the write's transaction,
--                             whichever write moved it (the saga, the sweep, the forwarding check).
--   line_release_row          New: a released line's row deleted with line.released.
--   line_texting_keep         New: the carriers' answer on texting kept, with the verdict's kind (line.texting_on,
--                             .texting_approved, .texting_rejected) where the edge's rule found news.
--   business_record_keep      New: the business on record saved whole with business.recorded.
--   voice_channel_add         New: the voice line's routing row made with voice.provisioned.
--   appointment_notices_tell_bookings
--                             New trigger: a booking email's notice kept as booked, changed or cancelled writes
--                             appointment.booked, .moved, .cancelled in the read's transaction, once an outcome.
--   sequence_batches_tell_a_stop
--                             New trigger: a run that moves to failed writes broadcast.stopped, with how many it reached.
--   conversation_owner_echo_keep
--                             New: the owner's own reply's pause (the owner_echo move) with conversation.owner_replied.
--   workspace_activation_note New: a workspace's first of a milestone, workspace.activated, once, asked and written in
--                             one transaction.
--   contact_email_suppress    New: a bounce's or a complaint's stop on the address an email went to, with
--                             contact.email_suppressed, once.
--   message_settle            New: the send door's settle of a queued message (sent, canceled, failed) with its kind
--                             (message.sent, .send_blocked, .send_failed, and .send_raced_cancel where a cancel won
--                             the row first), where core's deliver() wrote the event after the update.
--   message_outbound_record   New: a message sent with no row yet, recorded with its thread stamped and message.sent
--                             (or .send_failed), where packages/db wrote them one after another.
--
-- Nothing a customer sees changes: the same kinds, with the same words, in the same places.
--
-- Deploy order: either. An old edge keeps patching its rows and writing its events as before: nothing here changes
-- what it calls. The new edge calls the new doors, which a database from before this does not have: it deploys after
-- this is applied, as the house applies a migration before its merge.
set local lock_timeout = '3s';

/* -- mailbox_connection_move: each move of a mailbox writes its own kind -- */

-- A connected mailbox's every move, each with its event in the same transaction, where the edge patched the row and
-- wrote the event after it: the connect that stood (its records kept), a pause and its end, a hold and its resume, a
-- sign-out its provider said, a removal. Each move takes only the states it may leave, and a move that found the
-- mailbox elsewhere writes nothing and answers false. The service role's: the edge's doors and the mailbox clock call it.
create or replace function public.mailbox_connection_move(
  p_tenant_id uuid,
  p_id uuid,
  p_move text,
  p_by text default null,
  p_why text default null,
  p_detail jsonb default '{}'::jsonb,
  p_at timestamptz default now()
) returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_was public.mailbox_connections;
  v_row public.mailbox_connections;
  v_detail jsonb := coalesce(p_detail, '{}'::jsonb);
begin
  if p_move is null
     or p_move not in ('stood', 'paused', 'unpaused', 'resumed', 'held', 'signed_out', 'removed') then
    raise exception 'mailbox_connection_move: % is no move a mailbox makes', p_move using errcode = '22023';
  end if;
  if jsonb_typeof(v_detail) <> 'object' then
    raise exception 'mailbox_connection_move: the detail is an object' using errcode = '22023';
  end if;
  select * into v_was from public.mailbox_connections m
   where m.tenant_id = p_tenant_id and m.id = p_id
   for update;
  if not found then
    return false;
  end if;

  if p_move = 'stood' then
    -- The connect stood: its token is kept, and what it read of its domain, and a new one's history, go on its row.
    update public.mailbox_connections m
       set dns = coalesce(v_detail -> 'dns', m.dns),
           dns_checked_at = case when v_detail ? 'dns' then p_at else m.dns_checked_at end,
           history = coalesce(v_detail ->> 'history', m.history)
     where m.id = p_id
    returning * into v_row;
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, 'mailbox_connection.connected', 'setup', 'mailbox_connection', p_id,
            jsonb_build_object('address', v_row.address, 'provider', v_row.provider,
                               'again', coalesce((v_detail ->> 'again')::boolean, false), 'by', p_by));
  elsif p_move = 'paused' then
    update public.mailbox_connections m set state = 'paused'
     where m.id = p_id and m.state = 'connected'
    returning * into v_row;
    if found then
      insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
      values (p_tenant_id, 'mailbox_connection.paused', 'setup', 'mailbox_connection', p_id,
              jsonb_build_object('address', v_row.address, 'by', p_by));
    end if;
  elsif p_move = 'unpaused' then
    update public.mailbox_connections m set state = 'connected'
     where m.id = p_id and m.state = 'paused'
    returning * into v_row;
    if found then
      insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
      values (p_tenant_id, 'mailbox_connection.unpaused', 'setup', 'mailbox_connection', p_id,
              jsonb_build_object('address', v_row.address, 'by', p_by));
    end if;
  elsif p_move = 'resumed' then
    -- A hold lifted by its owner: its counts start again from now.
    update public.mailbox_connections m
       set state = 'connected', held_why = null, held_at = null, counted_since = p_at
     where m.id = p_id and m.state = 'held'
    returning * into v_row;
    if found then
      insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
      values (p_tenant_id, 'mailbox_connection.resumed', 'setup', 'mailbox_connection', p_id,
              jsonb_build_object('address', v_row.address, 'why', v_was.held_why, 'by', p_by));
    end if;
  elsif p_move = 'held' then
    -- Its own mail earned a hold (contracts mailboxHoldOf): why, and the counts that said so.
    update public.mailbox_connections m
       set state = 'held', held_why = p_why, held_at = p_at, judged_at = p_at
     where m.id = p_id and m.state in ('connected', 'paused')
    returning * into v_row;
    if found then
      insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
      values (p_tenant_id, 'mailbox_connection.held', 'setup', 'mailbox_connection', p_id,
              v_detail || jsonb_build_object('address', v_row.address, 'why', p_why));
    end if;
  elsif p_move = 'signed_out' then
    update public.mailbox_connections m
       set state = 'reconnect', held_why = null, held_at = null,
           last_error = 'Signed out by its provider: connect it again.', last_error_at = p_at
     where m.id = p_id and m.state in ('connected', 'paused', 'held')
    returning * into v_row;
    if found then
      insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
      values (p_tenant_id, 'mailbox_connection.signed_out', 'setup', 'mailbox_connection', p_id,
              jsonb_build_object('address', v_row.address, 'provider', v_row.provider));
    end if;
  else
    -- Removed: its token is already given back and dropped; the row stays, said removed.
    update public.mailbox_connections m
       set state = 'removed', removed_at = p_at, held_why = null, held_at = null, watch_id = null,
           sync_lease_until = null
     where m.id = p_id
    returning * into v_row;
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, 'mailbox_connection.removed', 'setup', 'mailbox_connection', p_id,
            jsonb_build_object('address', v_row.address, 'by', p_by));
  end if;
  return v_row.id is not null;
end $$;

revoke all on function public.mailbox_connection_move(uuid, uuid, text, text, text, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.mailbox_connection_move(uuid, uuid, text, text, text, jsonb, timestamptz) to service_role;

comment on function public.mailbox_connection_move(uuid, uuid, text, text, text, jsonb, timestamptz) is
  'A connected mailbox''s every move, with its event in the same transaction (lanes 9 and 2, 00721): stood (the connect held: dns, history; mailbox_connection.connected), paused, unpaused, resumed (a hold lifted; counts from now), held (why and its counts), signed_out (to reconnect), removed. Each takes only the states it may leave; a move that found the mailbox elsewhere writes nothing and answers false. The service role''s.';
/* -- billing_apply: a billing row's change writes billing's event -- */

-- Re-made with p_told, the ledger's word of the change, written in its transaction where the edge wrote it after:
-- billing.updated, .paused, .resumed (Stripe's subscription read), .paid, .payment_failed (a payment's stamp). A
-- reading another one beat writes no row and no event. An old edge passes no p_told and writes its event as before.
drop function if exists public.billing_apply(uuid, jsonb, jsonb, text);

create or replace function public.billing_apply(
  p_tenant_id uuid,
  p_row jsonb,
  p_expect jsonb default null,
  p_tenant_status text default null,
  p_told jsonb default null
) returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  -- What a reading (contracts planBilling) or a stamp writes, and nothing else: never the workspace, its mode or its clock.
  v_columns text[] := array['stripe_customer_id', 'stripe_subscription_id', 'status', 'price_id',
                            'current_period_end', 'trial_end', 'cancel_at', 'cancel_at_period_end',
                            'card_brand', 'card_last4', 'last_payment_failed_at', 'last_paid_at'];
  v_stray text;
  v_row   public.billing_accounts;
  v_next  public.billing_accounts;
begin
  if p_tenant_id is null or jsonb_typeof(p_row) is distinct from 'object' then
    raise exception 'billing_apply: a row is written for a workspace' using errcode = '22004';
  end if;
  select k into v_stray from jsonb_object_keys(p_row) k where k <> all (v_columns) limit 1;
  if v_stray is not null then
    raise exception 'billing_apply: % is not a column a reading writes', v_stray using errcode = '22023';
  end if;
  -- What the ledger is told of the change, written with it: {kind, data}, the kind one of billing's own.
  if p_told is not null
     and (jsonb_typeof(p_told) <> 'object'
          or coalesce(p_told->>'kind', '') not in ('updated', 'paused', 'resumed', 'paid', 'payment_failed')
          or jsonb_typeof(coalesce(p_told->'data', '{}'::jsonb)) <> 'object') then
    raise exception 'billing_apply: what it is told is {kind, data}, a kind of billing''s own' using errcode = '22023';
  end if;
  if p_expect is not null
     and (jsonb_typeof(p_expect) <> 'object'
          or not ((p_expect ? 'status' and p_expect ? 'updated_at' and not p_expect ? 'stripe_customer_id'
                   and p_expect->>'status' is not null and p_expect->>'updated_at' is not null)
                  or (p_expect ? 'stripe_customer_id' and not p_expect ? 'status' and not p_expect ? 'updated_at'
                      and p_expect->>'stripe_customer_id' is not null))) then
    raise exception 'billing_apply: a reading is planned against a status and an updated_at, or a customer'
      using errcode = '22023';
  end if;
  -- The row, locked: a reading or a stamp that arrives meanwhile waits, then reads what this one wrote.
  select b.* into v_row from public.billing_accounts b where b.tenant_id = p_tenant_id for update;
  if not found then
    return false;
  end if;
  -- Still what the caller planned against, or another reading won and nothing moves.
  if p_expect ? 'status'
     and (v_row.status is distinct from p_expect->>'status'
          or v_row.updated_at is distinct from (p_expect->>'updated_at')::timestamptz) then
    return false;
  end if;
  if p_expect ? 'stripe_customer_id' and v_row.stripe_customer_id is distinct from p_expect->>'stripe_customer_id' then
    return false;
  end if;
  -- The given columns laid over the row the lock found; updated_at moves with the write (billing_accounts_moddatetime),
  -- so the next reading plans against this one.
  v_next := jsonb_populate_record(v_row, p_row);
  update public.billing_accounts b
     set stripe_customer_id     = v_next.stripe_customer_id,
         stripe_subscription_id = v_next.stripe_subscription_id,
         status                 = v_next.status,
         price_id               = v_next.price_id,
         current_period_end     = v_next.current_period_end,
         trial_end              = v_next.trial_end,
         cancel_at              = v_next.cancel_at,
         cancel_at_period_end   = v_next.cancel_at_period_end,
         card_brand             = v_next.card_brand,
         card_last4             = v_next.card_last4,
         last_payment_failed_at = v_next.last_payment_failed_at,
         last_paid_at           = v_next.last_paid_at
   where b.tenant_id = p_tenant_id;
  if p_tenant_status is not null then
    update public.tenants set status = p_tenant_status where id = p_tenant_id;
  end if;
  -- The change's event, in its transaction (00721): Stripe's word of the subscription, a payment, or the customer gone.
  -- A reading another one beat writes none, as it writes no row.
  if p_told is not null then
    if p_told->>'kind' = 'paused' then
      insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
      values (p_tenant_id, 'billing.paused', 'billing', 'subscription', null, coalesce(p_told->'data', '{}'::jsonb));
    elsif p_told->>'kind' = 'resumed' then
      insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
      values (p_tenant_id, 'billing.resumed', 'billing', 'subscription', null, coalesce(p_told->'data', '{}'::jsonb));
    elsif p_told->>'kind' = 'paid' then
      insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
      values (p_tenant_id, 'billing.paid', 'billing', 'subscription', null, coalesce(p_told->'data', '{}'::jsonb));
    elsif p_told->>'kind' = 'payment_failed' then
      insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
      values (p_tenant_id, 'billing.payment_failed', 'billing', 'subscription', null,
              coalesce(p_told->'data', '{}'::jsonb));
    else
      insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
      values (p_tenant_id, 'billing.updated', 'billing', 'subscription', null, coalesce(p_told->'data', '{}'::jsonb));
    end if;
  end if;
  return true;
end $$;

revoke all on function public.billing_apply(uuid, jsonb, jsonb, text, jsonb) from public, anon, authenticated;
grant execute on function public.billing_apply(uuid, jsonb, jsonb, text, jsonb) to service_role;

comment on function public.billing_apply(uuid, jsonb, jsonb, text, jsonb) is
  'The edge''s one writer of a workspace''s billing row (00382): the columns a reading or a stamp writes (p_row), written only if the row is still what the caller planned against (p_expect {status, updated_at} for a reading, {stripe_customer_id} for a deleted customer; null when nothing races the write), the row locked first and the columns laid over it as the lock found it, the workspace''s switch (p_tenant_status, null when it does not move), and the change''s event where the caller tells one (p_told {kind, data}, 00721: billing.updated, .paused, .resumed, .paid, .payment_failed), in one transaction. True when written; false when another reading won or there is no row, and then nothing moved and no event is written. The rules are contracts'' planBilling''s; the bell is the edge''s. Service role only.';
/* -- lines: a line's moves write their own kinds -- */

-- A line that started answering, one whose setting up stopped, and a forwarded number whose test call came through:
-- each is a state its row takes, so the row's own move writes the event, in the transaction of whichever write moved
-- it (the saga's save, the sweep's hand-off to a person, the forwarding check), where the edge wrote it after. What the
-- edge wrote beside the row (who started the run) is not the row's; the line's step, error, provider, number and agent
-- are.
create or replace function public.lines_tell_their_moves() returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.voice_state is distinct from old.voice_state and new.voice_state = 'answering' then
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (new.tenant_id, 'line.answering', 'setup', 'line', new.id,
            jsonb_build_object('e164', new.e164, 'provider', new.provider, 'agent_id', new.retell_agent_id));
  end if;
  if new.voice_state is distinct from old.voice_state and new.voice_state = 'failed' then
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (new.tenant_id, 'line.failed', 'setup', 'line', new.id,
            jsonb_build_object('step', new.step, 'error', left(new.last_error, 300), 'provider', new.provider));
  end if;
  if new.forwarding_state is distinct from old.forwarding_state and new.forwarding_state = 'verified' then
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (new.tenant_id, 'line.forwarding_verified', 'setup', 'line', new.id,
            jsonb_build_object('from', new.facts ->> 'verified_from', 'call_id', new.facts ->> 'verified_call_id',
                               'proof', coalesce(new.facts ->> 'verified_proof', new.facts ->> 'verified_by')));
  end if;
  return null;
end $$;

revoke all on function public.lines_tell_their_moves() from public, anon, authenticated;

comment on function public.lines_tell_their_moves() is
  'A line''s moves on its own row, each with its event in the write''s transaction (00721): voice_state to answering (line.answering: number, provider, agent) or failed (line.failed: step, error, provider), forwarding_state to verified (line.forwarding_verified: the call that proved it, and how). The trigger lines_tell_their_moves.';

drop trigger if exists lines_tell_their_moves on public.lines;
create trigger lines_tell_their_moves after update of voice_state, forwarding_state on public.lines
  for each row execute function public.lines_tell_their_moves();

/* -- line_release_row: a released line's row goes with its event -- */

create or replace function public.line_release_row(p_tenant_id uuid, p_line_id uuid, p_data jsonb default '{}'::jsonb)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_line public.lines;
begin
  if jsonb_typeof(coalesce(p_data, '{}'::jsonb)) <> 'object' then
    raise exception 'line_release_row: what it released is an object' using errcode = '22023';
  end if;
  delete from public.lines l where l.tenant_id = p_tenant_id and l.id = p_line_id returning * into v_line;
  if not found then
    return false;
  end if;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'line.released', 'setup', 'line', p_line_id,
          jsonb_build_object('e164', v_line.e164) || coalesce(p_data, '{}'::jsonb));
  return true;
end $$;

revoke all on function public.line_release_row(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.line_release_row(uuid, uuid, jsonb) to service_role;

comment on function public.line_release_row(uuid, uuid, jsonb) is
  'A released line''s row deleted, with line.released in the same transaction (00721): its number, and what the edge released at the carrier and in routing (p_data: provider, what was let go, by, ended_at). False, with nothing written, where the row is gone already. The service role''s: the release door and the sweep.';

/* -- line_texting_keep: the carriers' answer kept, with its verdict's kind -- */

create or replace function public.line_texting_keep(
  p_tenant_id uuid,
  p_line_id uuid,
  p_row jsonb,
  p_told jsonb default null
) returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_row jsonb := coalesce(p_row, '{}'::jsonb);
  v_stray text;
begin
  if jsonb_typeof(v_row) <> 'object' then
    raise exception 'line_texting_keep: a row is an object' using errcode = '22023';
  end if;
  select k into v_stray from jsonb_object_keys(v_row) k
   where k not in ('sms_state', 'reg_mock', 'last_error', 'state_since') limit 1;
  if v_stray is not null then
    raise exception 'line_texting_keep: % is not a column the carriers'' answer writes', v_stray using errcode = '22023';
  end if;
  if p_told is not null
     and (jsonb_typeof(p_told) <> 'object'
          or coalesce(p_told ->> 'kind', '') not in ('texting_on', 'texting_approved', 'texting_rejected')
          or jsonb_typeof(coalesce(p_told -> 'data', '{}'::jsonb)) <> 'object') then
    raise exception 'line_texting_keep: what it is told is {kind, data}, a verdict''s kind' using errcode = '22023';
  end if;
  -- Asked, news or not: to the back of the sweep's queue (lines_set_updated_at stamps updated_at).
  update public.lines l
     set sms_state = case when v_row ? 'sms_state' then v_row ->> 'sms_state' else l.sms_state end,
         reg_mock = case when v_row ? 'reg_mock' then (v_row ->> 'reg_mock')::boolean else l.reg_mock end,
         last_error = case when v_row ? 'last_error' then v_row ->> 'last_error' else l.last_error end,
         state_since = case when v_row ? 'state_since' then (v_row ->> 'state_since')::timestamptz else l.state_since end,
         updated_at = now()
   where l.tenant_id = p_tenant_id and l.id = p_line_id;
  if not found then
    return false;
  end if;
  if p_told ->> 'kind' = 'texting_on' then
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, 'line.texting_on', 'setup', 'line', p_line_id, coalesce(p_told -> 'data', '{}'::jsonb));
  elsif p_told ->> 'kind' = 'texting_approved' then
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, 'line.texting_approved', 'setup', 'line', p_line_id, coalesce(p_told -> 'data', '{}'::jsonb));
  elsif p_told ->> 'kind' = 'texting_rejected' then
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, 'line.texting_rejected', 'setup', 'line', p_line_id, coalesce(p_told -> 'data', '{}'::jsonb));
  end if;
  return true;
end $$;

revoke all on function public.line_texting_keep(uuid, uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.line_texting_keep(uuid, uuid, jsonb, jsonb) to service_role;

comment on function public.line_texting_keep(uuid, uuid, jsonb, jsonb) is
  'The carriers'' answer on a line''s texting kept (00721): sms_state, reg_mock, last_error and state_since where given, the row asked again either way, and the verdict''s event where the edge''s rule found news (p_told {kind, data}: line.texting_on, .texting_approved, .texting_rejected), in one transaction. False where the line is gone. The service role''s: the registration sweep.';

/* -- business_record_keep: the business on record, saved with its event -- */

create or replace function public.business_record_keep(p_tenant_id uuid, p_row jsonb, p_data jsonb default '{}'::jsonb)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_row public.business_records;
begin
  if p_tenant_id is null or jsonb_typeof(p_row) is distinct from 'object' then
    raise exception 'business_record_keep: a record is written for a workspace' using errcode = '22004';
  end if;
  if jsonb_typeof(coalesce(p_data, '{}'::jsonb)) <> 'object' then
    raise exception 'business_record_keep: what is said of it is an object' using errcode = '22023';
  end if;
  v_row := jsonb_populate_record(null::public.business_records, p_row || jsonb_build_object('tenant_id', p_tenant_id));
  insert into public.business_records as b (
    tenant_id, legal_name, trade_name, ein, street, street_secondary, city, region, postal_code, country, website_url,
    industry, contact_first_name, contact_last_name, contact_email, contact_phone, contact_title, contact_job_position,
    business_type, company_type, about)
  values (
    p_tenant_id, v_row.legal_name, v_row.trade_name, v_row.ein, v_row.street, v_row.street_secondary, v_row.city,
    v_row.region, v_row.postal_code, coalesce(v_row.country, 'US'), v_row.website_url,
    coalesce(v_row.industry, 'PROFESSIONAL_SERVICES'), v_row.contact_first_name, v_row.contact_last_name,
    v_row.contact_email, v_row.contact_phone, coalesce(v_row.contact_title, 'Owner'),
    coalesce(v_row.contact_job_position, 'Director'), coalesce(v_row.business_type, 'Limited Liability Corporation'),
    coalesce(v_row.company_type, 'private'), coalesce(v_row.about, ''))
  on conflict (tenant_id) do update set
    legal_name = excluded.legal_name, trade_name = excluded.trade_name, ein = excluded.ein, street = excluded.street,
    street_secondary = excluded.street_secondary, city = excluded.city, region = excluded.region,
    postal_code = excluded.postal_code, country = excluded.country, website_url = excluded.website_url,
    industry = excluded.industry, contact_first_name = excluded.contact_first_name,
    contact_last_name = excluded.contact_last_name, contact_email = excluded.contact_email,
    contact_phone = excluded.contact_phone, contact_title = excluded.contact_title,
    contact_job_position = excluded.contact_job_position, business_type = excluded.business_type,
    company_type = excluded.company_type, about = excluded.about;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'business.recorded', 'setup', 'tenant', p_tenant_id, coalesce(p_data, '{}'::jsonb));
  return true;
end $$;

revoke all on function public.business_record_keep(uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.business_record_keep(uuid, jsonb, jsonb) to service_role;

comment on function public.business_record_keep(uuid, jsonb, jsonb) is
  'The business on record saved whole for its workspace, with business.recorded in the same transaction (00721): what the edge said of it (p_data: its legal name, the path it came by, who saved it, what changed). The service role''s: the lines door, after its checks.';

/* -- voice_channel_add: the voice line's routing row made with its event -- */

create or replace function public.voice_channel_add(
  p_tenant_id uuid,
  p_agent_id text,
  p_e164 text,
  p_config jsonb,
  p_data jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_id uuid;
begin
  if p_tenant_id is null or coalesce(p_agent_id, '') = '' or jsonb_typeof(p_config) is distinct from 'object' then
    raise exception 'voice_channel_add: a voice row is a workspace''s agent and its config' using errcode = '22004';
  end if;
  if jsonb_typeof(coalesce(p_data, '{}'::jsonb)) <> 'object' then
    raise exception 'voice_channel_add: what is said of it is an object' using errcode = '22023';
  end if;
  insert into public.tenant_channels (tenant_id, kind, external_id, number_e164, status, config)
  values (p_tenant_id, 'voice', p_agent_id, p_e164, 'active', p_config)
  returning id into v_id;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'voice.provisioned', 'setup', 'tenant_channel', v_id, coalesce(p_data, '{}'::jsonb));
  return v_id;
end $$;

revoke all on function public.voice_channel_add(uuid, text, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.voice_channel_add(uuid, text, text, jsonb, jsonb) to service_role;

comment on function public.voice_channel_add(uuid, text, text, jsonb, jsonb) is
  'The voice line''s routing row (tenant_channels, kind voice, keyed on its agent), made with voice.provisioned in the same transaction (00721): what the edge provisioned (p_data: agent, model, number, pinned, bought, its type). Answers the row''s id. The service role''s: the voice provisioning door.';
/* -- appointment_notices: a booking email read says so of its appointment -- */

-- A booking tool's email read into the calendar keeps its notice with the outcome it came to (booked, changed,
-- cancelled), and that outcome is the appointment's news: the notice's own write says it, in the read's transaction,
-- where the job wrote the event after the notice. A read again that comes to the same outcome says nothing twice.
create or replace function public.appointment_notices_tell_bookings() returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.appointment_id is null
     or (tg_op = 'UPDATE' and old.outcome is not distinct from new.outcome) then
    return null;
  end if;
  if new.outcome = 'booked' then
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (new.tenant_id, 'appointment.booked', 'appointment', 'appointment', new.appointment_id,
            jsonb_build_object('source', 'booking_email', 'tool', new.tool));
  elsif new.outcome = 'changed' then
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (new.tenant_id, 'appointment.moved', 'appointment', 'appointment', new.appointment_id,
            jsonb_build_object('source', 'booking_email', 'tool', new.tool));
  elsif new.outcome = 'cancelled' then
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (new.tenant_id, 'appointment.cancelled', 'appointment', 'appointment', new.appointment_id,
            jsonb_build_object('source', 'booking_email', 'tool', new.tool));
  end if;
  return null;
end $$;

revoke all on function public.appointment_notices_tell_bookings() from public, anon, authenticated;

comment on function public.appointment_notices_tell_bookings() is
  'A booking email''s notice kept with the outcome it came to says so of its appointment, in the read''s transaction (00721): booked (appointment.booked), changed (appointment.moved), cancelled (appointment.cancelled), with the tool that sent it. A notice read again to the same outcome says nothing twice; a hold or a dismissal is no appointment''s news. The trigger appointment_notices_tell_bookings.';

drop trigger if exists appointment_notices_tell_bookings on public.appointment_notices;
create trigger appointment_notices_tell_bookings after insert or update of outcome on public.appointment_notices
  for each row execute function public.appointment_notices_tell_bookings();
/* -- sequence_batches: a run that stopped says so -- */

-- A run marked failed (a stop the send met, one no job will carry on, one stranded before it started) is on the
-- ledger as every stopped run is, with its reason and how many it reached first, in the write's transaction: the
-- jobs and the stranded-runs sweep wrote it after. Its row moves to failed once (sequence_batches_guard), so it is
-- said once.
create or replace function public.sequence_batches_tell_a_stop() returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (new.tenant_id, 'broadcast.stopped', 'message', 'broadcast', new.id,
          jsonb_build_object('failure', new.failure,
                             'sent', (select count(*) from public.sequence_sends s
                                       where s.batch_id = new.id and s.state = 'sent')));
  return null;
end $$;

revoke all on function public.sequence_batches_tell_a_stop() from public, anon, authenticated;

comment on function public.sequence_batches_tell_a_stop() is
  'A run that moved to failed, on the ledger in the write''s transaction (00721): broadcast.stopped, with its failure and how many of its sends were sent first. The trigger sequence_batches_tell_a_stop.';

drop trigger if exists sequence_batches_tell_a_stop on public.sequence_batches;
create trigger sequence_batches_tell_a_stop after update of state on public.sequence_batches
  for each row when (new.state = 'failed' and old.state is distinct from new.state)
  execute function public.sequence_batches_tell_a_stop();

/* -- conversation_owner_echo_keep: the owner's own reply pauses AI, with its event -- */

create or replace function public.conversation_owner_echo_keep(
  p_tenant_id uuid,
  p_conversation_id uuid,
  p_patch jsonb,
  p_until timestamptz
) returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_stray text;
begin
  if jsonb_typeof(p_patch) is distinct from 'object' then
    raise exception 'conversation_owner_echo_keep: the move is an object' using errcode = '22023';
  end if;
  -- The owner_echo move's own columns (contracts conversations/moves.ts), and nothing else.
  select k into v_stray from jsonb_object_keys(p_patch) k
   where k not in ('state', 'paused_until', 'last_message_at') limit 1;
  if v_stray is not null then
    raise exception 'conversation_owner_echo_keep: % is not a column the owner''s echo moves', v_stray
      using errcode = '22023';
  end if;
  update public.conversations c
     set state = coalesce(p_patch ->> 'state', c.state),
         paused_until = case when p_patch ? 'paused_until' then (p_patch ->> 'paused_until')::timestamptz
                             else c.paused_until end,
         last_message_at = case when p_patch ? 'last_message_at' then (p_patch ->> 'last_message_at')::timestamptz
                                else c.last_message_at end
   where c.tenant_id = p_tenant_id and c.id = p_conversation_id;
  if not found then
    return false;
  end if;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'conversation.owner_replied', 'message', 'conversation', p_conversation_id,
          jsonb_build_object('until', p_until));
  return true;
end $$;

revoke all on function public.conversation_owner_echo_keep(uuid, uuid, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.conversation_owner_echo_keep(uuid, uuid, jsonb, timestamptz) to service_role;

comment on function public.conversation_owner_echo_keep(uuid, uuid, jsonb, timestamptz) is
  'The owner replied from their own phone: the thread takes the owner_echo move (p_patch, contracts conversationPatch: state, paused_until, last_message_at and nothing else) with conversation.owner_replied in the same transaction (00721). False where the thread is not the workspace''s. The service role''s: the echo intake.';

/* -- workspace_activation_note: a workspace's first of each milestone, once -- */

create or replace function public.workspace_activation_note(p_tenant_id uuid, p_milestone text, p_via text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if p_tenant_id is null or coalesce(p_milestone, '') = '' then
    raise exception 'workspace_activation_note: a milestone is a workspace''s' using errcode = '22004';
  end if;
  -- One a milestone, held under the workspace's lock on the ledger: two first searches at once write one row.
  perform pg_advisory_xact_lock(hashtextextended('workspace.activated:' || p_tenant_id::text || ':' || p_milestone, 0));
  if exists (select 1 from public.events e
              where e.tenant_id = p_tenant_id and e.kind = 'workspace.activated'
                and e.data ->> 'milestone' = p_milestone) then
    return false;
  end if;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'workspace.activated', 'setup', 'workspace', p_tenant_id,
          jsonb_build_object('milestone', p_milestone, 'via', p_via));
  return true;
end $$;

revoke all on function public.workspace_activation_note(uuid, text, text) from public, anon, authenticated;
grant execute on function public.workspace_activation_note(uuid, text, text) to service_role;

comment on function public.workspace_activation_note(uuid, text, text) is
  'A workspace''s first of a milestone (a line that answers, a first search, the funnel''s steps), on the ledger once (00721): workspace.activated with the milestone and the way it came. True when this call wrote it; false where it was there already. The service role''s.';
/* -- contact_email_suppress: a bounce or a complaint stops mail to a person, with its event -- */

-- A permanent bounce, a complaint or the provider's own stop, read from an email's receipt: mail to the person it went
-- to stops at that address (contacts.email_suppressed_at, 00126), with contact.email_suppressed in the same
-- transaction, where the edge wrote the event after. Only the address the email went to, only once.
create or replace function public.contact_email_suppress(
  p_tenant_id uuid,
  p_message_id uuid,
  p_addresses text[],
  p_reason text,
  p_at timestamptz default now()
) returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_contact uuid;
  v_stopped uuid;
begin
  if p_reason is null or p_reason not in ('hard_bounce', 'complaint', 'provider') then
    raise exception 'contact_email_suppress: % is no reason mail stops', p_reason using errcode = '22023';
  end if;
  if coalesce(array_length(p_addresses, 1), 0) = 0 then
    return null;
  end if;
  select m.contact_id into v_contact from public.messages m where m.tenant_id = p_tenant_id and m.id = p_message_id;
  if v_contact is null then
    return null;
  end if;
  update public.contacts c
     set email_suppressed_at = p_at, email_suppressed_reason = p_reason
   where c.tenant_id = p_tenant_id and c.id = v_contact and c.email = any (p_addresses)
     and c.email_suppressed_at is null
  returning c.id into v_stopped;
  if v_stopped is not null then
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, 'contact.email_suppressed', 'contact', 'contact', v_stopped,
            jsonb_build_object('reason', p_reason));
  end if;
  return v_stopped;
end $$;

revoke all on function public.contact_email_suppress(uuid, uuid, text[], text, timestamptz) from public, anon, authenticated;
grant execute on function public.contact_email_suppress(uuid, uuid, text[], text, timestamptz) to service_role;

comment on function public.contact_email_suppress(uuid, uuid, text[], text, timestamptz) is
  'Mail to the person an email went to stops at that address, for a permanent bounce, a complaint or the provider''s own stop (00126), with contact.email_suppressed in the same transaction (00721). Only while it has not stopped already: the contact''s id where this call stopped it, else null. The service role''s: the email receipts door.';
/* -- message_settle, message_outbound_record: the send door's rows and their events, together -- */

-- The one send door (core deliver.ts) settles a queued message as sent, refused or failed, and records a message it sent
-- with no row yet; each wrote its row, then its event (message.sent, .send_blocked, .send_failed, .send_raced_cancel).
-- These two write both in one transaction. The rules (whether to send, why it was refused, what the provider said) stay
-- the send door's; the doors keep the row and say what it was told.

create or replace function public.message_settle(
  p_tenant_id uuid,
  p_message_id uuid,
  p_patch jsonb,
  p_told jsonb
) returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_stray text;
  v_moved boolean;
  v_data jsonb := coalesce(p_told -> 'data', '{}'::jsonb);
begin
  if jsonb_typeof(p_patch) is distinct from 'object'
     or coalesce(p_patch ->> 'status', '') not in ('sent', 'canceled', 'failed') then
    raise exception 'message_settle: a queued message settles as sent, canceled or failed' using errcode = '22023';
  end if;
  select k into v_stray from jsonb_object_keys(p_patch) k where k not in ('status', 'external_id', 'error') limit 1;
  if v_stray is not null then
    raise exception 'message_settle: % is not a column the send door settles', v_stray using errcode = '22023';
  end if;
  if jsonb_typeof(p_told) is distinct from 'object'
     or coalesce(p_told ->> 'kind', '') not in ('sent', 'blocked', 'failed')
     or jsonb_typeof(v_data) <> 'object' then
    raise exception 'message_settle: what it is told is {kind, data}, a send''s kind' using errcode = '22023';
  end if;
  -- Only while it is still queued: no row moved means a cancel won it first (messages_guard holds the rest).
  update public.messages m
     set status = p_patch ->> 'status',
         external_id = coalesce(p_patch ->> 'external_id', m.external_id),
         error = case when p_patch ? 'error' then p_patch -> 'error' else m.error end
   where m.tenant_id = p_tenant_id and m.id = p_message_id and m.status = 'queued';
  v_moved := found;
  if p_told ->> 'kind' = 'sent' then
    -- The words left whatever the row says: a cancel that won it between the wire and here is said beside the send.
    if not v_moved then
      insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
      values (p_tenant_id, 'message.send_raced_cancel', 'message', 'message', p_message_id,
              jsonb_build_object('wamid', p_patch ->> 'external_id'));
    end if;
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, 'message.sent', 'message', 'message', p_message_id, v_data);
  elsif p_told ->> 'kind' = 'blocked' then
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, 'message.send_blocked', 'message', 'message', p_message_id, v_data);
  else
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, 'message.send_failed', 'message', 'message', p_message_id, v_data);
  end if;
  return v_moved;
end $$;

revoke all on function public.message_settle(uuid, uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.message_settle(uuid, uuid, jsonb, jsonb) to service_role;

comment on function public.message_settle(uuid, uuid, jsonb, jsonb) is
  'The send door''s settle of a queued message (core deliver.ts), with its event in the same transaction (00721): sent (message.sent, and message.send_raced_cancel where a cancel won the row first), canceled with its reason (message.send_blocked), failed with what the provider said (message.send_failed). p_patch is status, external_id and error only; p_told {kind, data} is the door''s own words. True when the row moved from queued. The service role''s: the send door.';

create or replace function public.message_outbound_record(p_row jsonb, p_told jsonb default null)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_row public.messages;
  v_id uuid;
  v_status text := coalesce(p_row ->> 'status', 'sent');
begin
  if jsonb_typeof(p_row) is distinct from 'object' or p_row ->> 'tenant_id' is null
     or p_row ->> 'conversation_id' is null then
    raise exception 'message_outbound_record: a message is a workspace''s, on a thread' using errcode = '22004';
  end if;
  if v_status not in ('sent', 'failed', 'queued') then
    raise exception 'message_outbound_record: a message recorded here was sent, failed or waits' using errcode = '22023';
  end if;
  if p_row ->> 'channel' = 'email' then
    raise exception 'message_outbound_record: an email''s row is written before it is sent, never after'
      using errcode = '22023';
  end if;
  if p_told is not null
     and (jsonb_typeof(p_told) <> 'object' or coalesce(p_told ->> 'kind', '') <> 'failed'
          or jsonb_typeof(coalesce(p_told -> 'data', '{}'::jsonb)) <> 'object') then
    raise exception 'message_outbound_record: what it is told is a failure''s {kind, data}' using errcode = '22023';
  end if;
  v_row := jsonb_populate_record(null::public.messages, p_row);
  begin
    insert into public.messages (tenant_id, conversation_id, contact_id, channel, direction, sender, type, body,
                                 external_id, status, meta)
    values (v_row.tenant_id, v_row.conversation_id, v_row.contact_id, coalesce(v_row.channel, 'whatsapp'), 'outbound',
            v_row.sender, coalesce(v_row.type, 'text'), v_row.body, v_row.external_id, v_status,
            coalesce(v_row.meta, '{}'::jsonb))
    returning id into v_id;
  exception when unique_violation then
    -- Its provider id is kept already: a retry, benign, and nothing more is written.
    return null;
  end;
  -- The thread stamped either way; the send moment is written only for a row that went out (00035's first_replies
  -- reads it): a queued draft gets its one from the settle when it leaves, and a failure is message.send_failed.
  update public.conversations c set last_message_at = now()
   where c.id = v_row.conversation_id and c.tenant_id = v_row.tenant_id;
  if v_status = 'sent' then
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (v_row.tenant_id, 'message.sent', 'message', 'message', v_id, jsonb_build_object('sender', v_row.sender));
  end if;
  if p_told is not null then
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (v_row.tenant_id, 'message.send_failed', 'message', 'message', v_id, coalesce(p_told -> 'data', '{}'::jsonb));
  end if;
  return v_id;
end $$;

revoke all on function public.message_outbound_record(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.message_outbound_record(jsonb, jsonb) to service_role;

comment on function public.message_outbound_record(jsonb, jsonb) is
  'A message the send door sent, or tried, with no row yet (never an email''s, whose row is written first), recorded with its thread stamped and its event in the same transaction (00721): message.sent for one that went out, message.send_failed where it is told a failure (p_told {kind: failed, data}). Its id; null where its provider id was kept already (a retry). The service role''s: the send door.';
