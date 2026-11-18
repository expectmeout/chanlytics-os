/**
 * The relay as the proof deploys it (`wrangler deploy --env proof`): the same handler as production's, with two things of
 * the proof's own. Its key door is another Worker of the same account, so the knock goes by a binding (a Worker may not
 * fetch another by its workers.dev address). And its fetch can break one download off when that door says so (./breaks.ts).
 * Production deploys ../src/index.ts, which holds neither.
 */
import { answerRelay, type RelayEnv, type RelayFetch } from "../src/relay";
import { fetchWithBreaks } from "./breaks";

interface ProofEnv extends RelayEnv {
  /** The proof's key door, bound by name in wrangler.toml. */
  KEY_DOOR: { fetch(input: string, init?: RequestInit): Promise<Response> };
}

export default {
  fetch(request: Request, env: ProofEnv): Promise<Response> {
    const web: RelayFetch = (input, init) =>
      input === env.KEY_DOOR_URL ? env.KEY_DOOR.fetch(input, init) : fetch(input, init);
    return answerRelay(request, env, { fetch: fetchWithBreaks(web, env.KEY_DOOR_URL), nowMs: () => Date.now() });
  },
};
