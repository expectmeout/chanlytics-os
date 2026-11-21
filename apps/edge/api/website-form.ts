/**
 * A form on a business's own website (00488, 00674): a sign-up for its offers, or a request. The site's server posts
 * each one with its workspace and one of that workspace's keys.
 *
 * The door names the request (log.ts `door`) and calls receiveWebsiteForm in lib/website/form-door.ts, which holds what
 * the request does: the shape, the key, and the one write that keeps the entry with its person and its event. What the
 * entry owes after (the note on their page, the owner's notice, a sign-up's ask) is lib/website/form-effects.ts.
 */
import { door } from "../lib/shared/log.js";
import { receiveWebsiteForm } from "../lib/website/form-door.js";

export const POST = door(receiveWebsiteForm);
