/**
 * The relay, as Cloudflare runs it: a Worker whose every request is one clip asked for (./relay.ts says what it
 * answers) or one ask of the shelf where a made video keeps its own copy (./shelf.ts). A path under `/shelf/` is the
 * shelf's, and every other is the clip's road, untouched. `apps/relay/README.md` says how it is deployed and what it is
 * set up with.
 */
import { answerRelay, type RelayEnv } from "./relay";
import { answerShelf, type ShelfEnv } from "./shelf";

export default {
  fetch: (request: Request, env: RelayEnv & ShelfEnv): Promise<Response> =>
    new URL(request.url).pathname.startsWith("/shelf/") ? answerShelf(request, env) : answerRelay(request, env),
};
