/**
 * The relay's key door (the footage sources plan, "Taking a file in"): the relay, which holds no Google grant, shows a
 * clip's ticket here for each request the video platform makes, and gets an hour's Drive key for that one file.
 *
 * The door names the request and calls answerKeyDoor in lib/files/takes/key-door.ts: the app's key on the knock, the
 * ticket's signature and time, and the item it names being taken right now, in that order.
 *
 * It hands answerKeyDoor the request alone. The platform calls a door with an argument of its own after the request,
 * and answerKeyDoor's second parameter is the sync a test hands in: passed on, the platform's argument stood in the
 * sync's place, and on 20 November 2026 every real clip's key was refused ("sync.open is not a function").
 */
import { door } from "../../lib/shared/log.js";
import { answerKeyDoor } from "../../lib/files/takes/key-door.js";

export const POST = door(async function POST(request: Request): Promise<Response> {
  return answerKeyDoor(request);
});
