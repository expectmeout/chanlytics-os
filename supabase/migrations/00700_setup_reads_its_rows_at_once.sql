-- 00700 · Setup reads its rows at once (the plan "Pages that open at once", piece 2; Ruben, 23 November 2026: "Yes,
-- Setup's card").
--
-- Setup's card on Today, and the Setup page, say where a workspace stands from 22 sources, and each was a call of its
-- own: 24 of the 143 database calls Today's opening made on 23 November 2026. The opening's time on the server went on
-- its calls, not on the database's answers (each answered in 0.02 to 0.04 s), so the count of calls is what was cut.
-- setup_rows answers every one of those reads in one call, each as the rows its own read answered, and the dashboard
-- puts the card together from them as it did (apps/dashboard/src/server/setup). The workspace's name and clock are not
-- among them: every route has them from the membership's read already, and the pages hear them as the frame's.
--
--   setup_rows   The caller's own read: an invoker's function, so each row it answers is read under the same policies
--                as the read it stands for. A member's session reads what a member's reads did; the back office's
--                service role reads what its own did. It writes nothing. `p_roster` says whether the team is read as
--                its roster (team_roster, which only a member of the workspace may call): the member's view is; the
--                back office's, which has no session, reads the count of members instead.
--
-- What each key holds, and the read it stands for (packages/db repositories, unless named):
--   config          the settings row as a member reads it: the table where the session may read it (an owner, or the
--                   service role), else tenant_config_read, which masks the calendar's address (feed_hidden)
--   mailbox         its hosted mailbox, whole (findMailboxOfTenant)
--   channels        tenant_channels as Setup reads them (listSetupChannels)
--   last_whatsapp   the newest WhatsApp message in (findLastWhatsAppIn)
--   last_call       the newest call in that connected (findLastConnectedCallIn)
--   templates       the WhatsApp templates' verdicts (listTemplateVerdicts)
--   roster          the team, with each member's address and name (team_roster), where p_roster
--   members         how many members, partners aside (countTeamMembers), where not p_roster
--   invitations     the open invitations, oldest first (listOpenInvitations)
--   people          four counts of the people not erased, in one pass: who said yes to messages (countSaidYes), who
--                   said yes to offers and may be sent them (countOffersYes), those of them with a number to send to
--                   (countOffersReach), and everyone not merged into another (getPeopleCount)
--   asks            the newest thirty asks for help with setup (listSetupAsks)
--   lines           the workspace's lines as the Connections page lists them (listLinesForPage)
--   listing         its Google listing's card (findListingCard), and listing_facts its name, address and facts
--                   (findGoogleListingFacts)
--   google          its Google connection's card (findConnectionCard)
--   billing         its plan as the billing page reads it (findPlanForPage)
--   activations     its capabilities, on and off (listCapabilityRows)
--   day_before      whether a step that runs the day before a visit is running (listRunningStepsOn visit_tomorrow)
--   rehearsals      its newest five hundred rehearsals, counted: how many were reviewed, how many fixes they kept and
--                   when the newest was (findRehearsalTally)
--   imports         its imports' ledger (listImports)
--   business_reads  what its Business Profile and website said (listBusinessReads)
--   choices         what its first run chose (setupChoicesOf)
--
-- Locks: none; one function made. Re-runnable. Deploy order: this file first, then the code that calls it.

set local lock_timeout = '3s';

create or replace function public.setup_rows(p_tenant_id uuid, p_roster boolean)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'config', coalesce(
      (select jsonb_build_object(
                'tenant_id', c.tenant_id, 'config', c.config, 'version', c.version, 'updated_at', c.updated_at,
                'updated_by', c.updated_by, 'feed_hidden', false)
         from public.tenant_config c
        where c.tenant_id = p_tenant_id),
      (select to_jsonb(r) from public.tenant_config_read(p_tenant_id) r)),
    'mailbox', (select to_jsonb(m) from public.mailboxes m where m.tenant_id = p_tenant_id),
    'channels',
      (select coalesce(jsonb_agg(jsonb_build_object(
                'kind', c.kind, 'status', c.status, 'number_e164', c.number_e164, 'config', c.config,
                'created_at', c.created_at)), '[]'::jsonb)
         from public.tenant_channels c
        where c.tenant_id = p_tenant_id),
    'last_whatsapp',
      (select jsonb_build_object('channel_ts', m.channel_ts, 'created_at', m.created_at)
         from public.messages m
        where m.tenant_id = p_tenant_id and m.direction = 'inbound' and m.channel = 'whatsapp'
        order by m.channel_ts desc nulls last
        limit 1),
    'last_call',
      (select jsonb_build_object('started_at', k.started_at)
         from public.calls k
        where k.tenant_id = p_tenant_id and k.direction = 'inbound' and k.status <> 'not_connected'
        order by k.started_at desc nulls last
        limit 1),
    'templates',
      (select coalesce(jsonb_agg(jsonb_build_object(
                'name', p.name, 'meta_status', p.meta_status, 'hidden_at', p.hidden_at)), '[]'::jsonb)
         from public.templates p
        where p.tenant_id = p_tenant_id and p.channel = 'whatsapp'),
    -- The roster in the order team_roster answers it (by when each joined); asked only where p_roster says so, since
    -- it refuses anyone who is not a member, and the service role is not one.
    'roster', case when p_roster then
      (select coalesce(jsonb_agg(jsonb_build_object(
                'membership_id', r.membership_id, 'member_user_id', r.member_user_id, 'email', r.email,
                'role', r.role, 'joined_at', r.joined_at, 'display_name', r.display_name) order by r.n), '[]'::jsonb)
         from public.team_roster(p_tenant_id)
              with ordinality as r(membership_id, member_user_id, email, role, joined_at, display_name, n))
    end,
    'members', case when not p_roster then
      (select count(*) from public.memberships m where m.tenant_id = p_tenant_id and m.role <> 'partner')
    end,
    'invitations',
      (select coalesce(jsonb_agg(jsonb_build_object(
                'id', i.id, 'email', i.email, 'role', i.role, 'created_at', i.created_at,
                'expires_at', i.expires_at) order by i.created_at), '[]'::jsonb)
         from public.invitations i
        where i.tenant_id = p_tenant_id and i.accepted_at is null and i.revoked_at is null),
    'people',
      (select jsonb_build_object(
                'said_yes', count(*) filter (where c.consent = 'opted_in'),
                'offers_yes', count(*) filter (where c.marketing_consent = 'opted_in' and c.dnc = false),
                'offers_reach', count(*) filter (
                  where c.marketing_consent = 'opted_in' and c.dnc = false and c.phone_e164 is not null),
                'all', count(*) filter (where c.merged_into_contact_id is null))
         from public.contacts c
        where c.tenant_id = p_tenant_id and c.erased_at is null),
    'asks',
      (select coalesce(jsonb_agg(jsonb_build_object('created_at', e.created_at, 'data', e.data)
                                 order by e.created_at desc), '[]'::jsonb)
         from (select x.created_at, x.data
                 from public.events x
                where x.tenant_id = p_tenant_id and x.kind = 'setup.requested'
                order by x.created_at desc
                limit 30) e),
    'lines',
      (select coalesce(jsonb_agg(jsonb_build_object(
                'id', l.id, 'e164', l.e164, 'kind', l.kind, 'provider', l.provider, 'area_code', l.area_code,
                'voice_state', l.voice_state, 'sms_state', l.sms_state, 'reg_step', l.reg_step,
                'reg_mock', l.reg_mock, 'reg_sole_prop', l.reg_sole_prop, 'whatsapp_state', l.whatsapp_state,
                'port_state', l.port_state, 'forwarding_state', l.forwarding_state, 'step', l.step,
                'last_error', l.last_error, 'state_since', l.state_since, 'created_at', l.created_at,
                'facts', l.facts) order by l.created_at), '[]'::jsonb)
         from public.lines l
        where l.tenant_id = p_tenant_id),
    'listing',
      (select jsonb_build_object(
                'place_id', g.place_id, 'name', g.name, 'address', g.address, 'maps_uri', g.maps_uri,
                'business_status', g.business_status, 'rating', g.rating, 'review_count', g.review_count,
                'linked_at', g.linked_at, 'checked_at', g.checked_at, 'check_error', g.check_error)
         from public.google_listings g
        where g.tenant_id = p_tenant_id),
    'listing_facts',
      (select jsonb_build_object('name', g.name, 'address', g.address, 'facts', g.facts)
         from public.google_listings g
        where g.tenant_id = p_tenant_id),
    'google',
      (select jsonb_build_object(
                'google_email', g.google_email, 'account_title', g.account_title, 'location_name', g.location_name,
                'location_title', g.location_title, 'connected_at', g.connected_at,
                'last_synced_at', g.last_synced_at, 'sync_error', g.sync_error)
         from public.google_connections g
        where g.tenant_id = p_tenant_id),
    'billing',
      (select jsonb_build_object(
                'mode', b.mode, 'status', b.status, 'price_id', b.price_id,
                'current_period_end', b.current_period_end, 'trial_end', b.trial_end, 'cancel_at', b.cancel_at,
                'cancel_at_period_end', b.cancel_at_period_end, 'card_brand', b.card_brand,
                'card_last4', b.card_last4, 'last_payment_failed_at', b.last_payment_failed_at,
                'last_paid_at', b.last_paid_at, 'updated_at', b.updated_at)
         from public.billing_accounts b
        where b.tenant_id = p_tenant_id),
    'activations',
      (select coalesce(jsonb_agg(jsonb_build_object(
                'capability', a.capability, 'activated_at', a.activated_at, 'activated_by', a.activated_by,
                'deactivated_at', a.deactivated_at)), '[]'::jsonb)
         from public.capability_activations a
        where a.tenant_id = p_tenant_id),
    'day_before', exists (
      select 1 from public.sequence_steps s
       where s.tenant_id = p_tenant_id and s.state = 'running' and s.trigger = 'visit_tomorrow'),
    'rehearsals',
      (select jsonb_build_object(
                'reviewed', count(*) filter (where h.reviewed_at is not null),
                'kept', coalesce(sum(jsonb_array_length(h.fixes)) filter (where jsonb_typeof(h.fixes) = 'array'), 0),
                'last_at', max(h.created_at))
         from (select x.created_at, x.reviewed_at, x.fixes
                 from public.rehearsals x
                where x.tenant_id = p_tenant_id
                order by x.created_at desc
                limit 500) h),
    'imports',
      (select coalesce(jsonb_agg(jsonb_build_object(
                'source', m.source, 'connection_id', m.connection_id, 'state', m.state, 'counts', m.counts,
                'parts_done', m.parts_done, 'parts_total', m.parts_total, 'oldest', m.oldest,
                'started_at', m.started_at, 'finished_at', m.finished_at, 'last_error', m.last_error,
                'via', m.via)), '[]'::jsonb)
         from public.imports m
        where m.tenant_id = p_tenant_id),
    'business_reads',
      (select coalesce(jsonb_agg(jsonb_build_object(
                'source', r.source, 'facts', r.facts, 'read_from', r.read_from, 'read_at', r.read_at,
                'error', r.error)), '[]'::jsonb)
         from public.business_reads r
        where r.tenant_id = p_tenant_id),
    'choices',
      (select jsonb_build_object('phone', s.phone, 'whatsapp', s.whatsapp, 'marks', s.marks, 'version', s.version)
         from public.setup_choices s
        where s.tenant_id = p_tenant_id)
  )
$$;

revoke all on function public.setup_rows(uuid, boolean) from public, anon;
grant execute on function public.setup_rows(uuid, boolean) to authenticated, service_role;
comment on function public.setup_rows(uuid, boolean) is
  'Every row Setup reads of a workspace, in one call (00700): read as the caller, under the same policies as each read it stands for. p_roster reads the team as its roster (a member''s view), else counts its members (the back office).';
