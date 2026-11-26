/** Ask's speech door: where it is, how long it waits, and what a person is told when it could not be reached. */
import { MIN_MS } from "@chanlytics/contracts";

export const DOOR = "/api/admin/voice/speech";

/** The edge's call to the vendor, bounded under the route's own minute: the whole clip streams inside half of it. */
export const SPEECH_TIMEOUT_MS = MIN_MS / 2;

/** What a person is told when the voice could not be asked or did not answer: said once, here, for the door and its route. */
export const SPEECH_UNREACHED = "AI's voice could not be reached just now. Try again in a moment.";
