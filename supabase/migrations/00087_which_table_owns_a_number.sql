-- 00087 · Which table owns a number, and what notices when they disagree.
--
-- Two tables model a phone number and nothing said which one wins. Asked
-- directly -- "lines or tenant_channels?" -- nobody could answer from the
-- schema, and the answer matters: one of them is what a customer dials and the
-- other is what decides whose workspace an arriving message belongs to.
--
-- The answer, written where it cannot be lost:
--
--   lines           the ASSET. One row per number this platform bought or
--                   forwards, and the whole story of getting it working: the
--                   subaccount, the trunk, the receptionist, the messaging
--                   service, the carrier registration, the porting, the
--                   forwarding. Its states are a saga's states.
--
--   tenant_channels the ROUTING. One row per thing an inbound webhook has to
--                   resolve to a workspace. `config.line_id` points back at the
--                   line that created it, and `config.provisioned_by = 'lines'`
--                   says the saga made it.
--
-- Neither wins, because they answer different questions. What matters is the
-- direction: lines is the source, tenant_channels is derived from it, and the
-- join is config.line_id.
--
-- THE ASYMMETRY THAT CONFUSES EVERYONE. A channel row can exist with NO line:
--
--   * a voice number bought inside Retell rather than by us -- the live salon's
--     +1 308 336 8109 is one, which is why it has no `lines` row and why we
--     cannot register it for texting or capture an OTP on it;
--   * a WhatsApp number, which comes through Meta's Embedded Signup and never
--     touches Twilio at all.
--
-- So "no line" is a perfectly good state for a channel, and a report that
-- treats it as drift would cry wolf on the only two workspaces we have. The
-- reverse is NOT fine: a line that answers with nothing routing to it is a
-- number that rings into a workspace nobody can identify.
--
-- One more shape worth knowing before reading number_drift(): the VOICE channel
-- row is keyed on the RECEPTIONIST (external_id = the agent id), not on the
-- number. A workspace that buys a second number rides it on the same agent and
-- keeps the first row -- so that row's number_e164 and config.line_id name
-- whichever line got there first, by design. The SMS row is keyed on the number
-- itself, because a text arrives addressed to one.

comment on table public.lines is
  'The number as an ASSET: one row per number Chanlytics bought or forwards, and the state of getting it working -- subaccount, trunk, receptionist, messaging service, carrier registration, porting, forwarding. Routing lives in tenant_channels, which this table is the source for (tenant_channels.config.line_id points back here). A number provisioned elsewhere -- inside Retell, or a WhatsApp number through Meta -- has a channel row and no row here.';

comment on table public.tenant_channels is
  'The ROUTING table: one row per thing an inbound webhook must resolve to a workspace. A voice row is keyed on the receptionist (external_id = agent id) so several numbers may share one; an sms or whatsapp row is keyed on the number, because a message arrives addressed to one. config.line_id names the lines row that created it, when a line did -- numbers provisioned inside Retell or through Meta legitimately have none. See public.number_drift() for what disagreement between the two looks like.';

comment on column public.tenant_channels.config is
  'Provider facts for this route. Set by the provisioning saga: line_id (the lines row behind it, when there is one), provider, messaging_service_sid, provisioned_at, provisioned_by.';

-- The disagreements that are actually wrong, and only those.
--
-- Each case is written so that a legitimate state cannot produce a row:
-- a channel with no line is silent, a second number sharing a receptionist is
-- silent, and a line still being set up is silent -- only a line that has
-- finished and is answering, or texting, is expected to be routable.
create or replace function public.number_drift()
returns table (
  kind      text,
  tenant_id uuid,
  detail    text
)
language sql
security definer
set search_path = public
as $$
  -- 1. A routing row pointing at a line that is gone. Always wrong: the row
  --    was made BY that line, so its disappearance means a delete went one way.
  select 'orphan_route'::text,
         c.tenant_id,
         'the ' || c.kind || ' route for ' || coalesce(c.number_e164, '(no number)') ||
         ' names a line that no longer exists'
    from public.tenant_channels c
   where c.config->>'line_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     -- Shaped like an id before it is cast to one: a config holding something
     -- else would otherwise make this whole function raise, and a diagnostic
     -- that dies on the data it is diagnosing is worse than no diagnostic.
     and not exists (select 1 from public.lines l where l.id = (c.config->>'line_id')::uuid)

  union all

  -- 2. A routing row publishing a number NO line of that workspace has. Not
  --    "differs from its own line": a second number riding one receptionist
  --    leaves the first row's number in place by design, and that is fine
  --    because the number is still one of the workspace's own.
  select 'route_number_unknown'::text,
         c.tenant_id,
         'the ' || c.kind || ' route publishes ' || c.number_e164 ||
         ', which is not a number this workspace has a line for'
    from public.tenant_channels c
   where c.config ? 'line_id'
     and c.number_e164 is not null
     and not exists (
       select 1 from public.lines l
        where l.tenant_id = c.tenant_id and l.e164 = c.number_e164
     )

  union all

  -- 3. A line that ANSWERS with no voice route in its workspace. Per workspace,
  --    not per line, because one route serves every number on a receptionist.
  --    A line still provisioning is not expected to be routable yet.
  select 'answering_unrouted'::text,
         l.tenant_id,
         l.e164 || ' answers calls, but nothing routes voice to this workspace'
    from public.lines l
   where l.voice_state = 'answering'
     and not exists (
       select 1 from public.tenant_channels c
        where c.tenant_id = l.tenant_id and c.kind = 'voice'
          and coalesce(c.status, 'active') = 'active'
     )

  union all

  -- 4. A line whose texting is ON with no route for its own number. Per line
  --    here, because an sms route IS the number.
  select 'texting_unrouted'::text,
         l.tenant_id,
         l.e164 || ' is switched on for texting, but nothing routes texts to it'
    from public.lines l
   where l.sms_state = 'active'
     and not exists (
       select 1 from public.tenant_channels c
        where c.tenant_id = l.tenant_id and c.kind = 'sms'
          and c.number_e164 = l.e164
          and coalesce(c.status, 'active') = 'active'
     )
   order by 1, 2;
$$;

revoke execute on function public.number_drift() from public, anon, authenticated;

comment on function public.number_drift() is
  'Where lines and tenant_channels disagree in a way that is actually wrong: a route naming a deleted line, a route publishing a number the workspace has no line for, a line answering with nothing routing to it, a line texting with nothing routing to it. A channel row with no line at all is NOT drift -- Retell-bought voice numbers and Meta WhatsApp numbers legitimately have none. Read by /api/diag.';
