/**
 * A form on a business's own website (00488): a sign-up for its offers, or a request. The site's server posts each one
 * with its workspace and that workspace's key.
 *
 * The door names the request (log.ts `door`) and calls receiveWebsiteForm in lib/website/form-door.ts, which holds
 * everything the request does: the shape, the key, the person, the note on their page and the owner's notice.
 */
import { door } from "../lib/log.js";
import { receiveWebsiteForm } from "../lib/website/form-door.js";

export const POST = door(receiveWebsiteForm);
