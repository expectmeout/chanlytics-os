/**
 * The relay, as Cloudflare runs it: a Worker whose every request is one clip asked for (./relay.ts says what it answers).
 * `apps/relay/README.md` says how it is deployed and what it is set up with.
 */
import { answerRelay, type RelayEnv } from "./relay";

export default {
  fetch: (request: Request, env: RelayEnv): Promise<Response> => answerRelay(request, env),
};
