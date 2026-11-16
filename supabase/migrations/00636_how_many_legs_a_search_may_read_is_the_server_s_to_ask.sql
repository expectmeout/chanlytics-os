-- How many legs a search may read is the server's to ask (decision 0133, 00635's lead_leg_cap).
--
-- 00635 revoked lead_leg_cap from public alone, so a signed-in member kept the platform's default grant and could call
-- it over the API. It reads nothing, but no member's door needs it: lead_round_end, a definer, is its one caller. Like
-- its siblings lead_check_estimate and lead_estimate_ceiling, it is the service role's alone.
-- Deploy order: either. Re-runnable.

set local lock_timeout = '3s';

revoke all on function public.lead_leg_cap(integer) from public, anon, authenticated;
grant execute on function public.lead_leg_cap(integer) to service_role;
