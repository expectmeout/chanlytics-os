/**
 * Connect Meta: the browser's half of the Meta link (Instagram API with Unified Login). Connect leaves for the app's own
 * route, which signs the way out and sends the browser to Meta's dialog, where the owner signs in with Instagram or
 * Facebook; Meta sends it back to the callback, which hands the code to the edge and returns here with one word in the
 * address (`?meta=`), read once and cleared. Nothing here holds a credential. Disconnect turns the account's row off through
 * its route; the refresh map re-reads the channels, where the row now shows.
 */
import { unwrap } from "@/client/api";
import { api } from "@/bridge/api";
import { metaDoorRead } from "../frame/pane-reads";
import { CONNECT_WORDS, outcomeOf } from "./instagram";

/** Whether this workspace may connect Meta, and this member may: asked once as Connections opens, and kept in the tab. */
const doorOf = async () => unwrap(await metaDoorRead.read());
export type MetaDoor = Awaited<ReturnType<typeof doorOf>>;

/** The words the row says for what came back from Meta, by the outcome or its reason. */
const OUTCOME_WORDS: Readonly<Record<string, string>> = {
  ...CONNECT_WORDS,
  connected: "Meta is connected — the receptionist answers the account's DMs through it now.",
  declined: "Meta did not connect: the sign-in was declined.",
  state_expired: "The way back from Meta took too long. Start the connection again.",
  state_signature: "The way back from Meta could not be verified. Start the connection again.",
  state_missing: "The way back from Meta was incomplete. Start the connection again.",
  state_malformed: "The way back from Meta was incomplete. Start the connection again.",
  not_owner: "Only an owner or a manager can connect Meta.",
  no_code: "Meta sent nothing back. Start the connection again.",
  exchange_failed: "Meta did not accept the sign-in. Start the connection again.",
  instagram_messages_not_granted:
    "Meta connected without the account's messages. Start again and allow Chanlytics to manage them.",
  instagram_account_unreadable:
    "Meta did not say which Instagram account was shared. Start again and choose your professional account.",
  instagram_accounts_several:
    "That sign-in shared several Instagram accounts. Start again and choose only this workspace's account.",
  subscribe_failed: "Chanlytics could not subscribe to the account's messages. Try again in a moment.",
  meta_off: "Connecting Meta is not offered in this workspace yet.",
  not_available: "Connecting Meta is not available here yet.",
};

const outcome = (): string | null => outcomeOf("meta", OUTCOME_WORDS, "Meta");

export const metaConnect = {
  config: doorOf,
  /** The door as this tab last read it, or null: what the row draws in its first frame. */
  held: (): MetaDoor | null => metaDoorRead.held(),
  outcome,
  /** To Meta's dialog, by the app's own route (which signs the way out). */
  start: () => window.location.assign(api().url("GET channels/meta/connect", { params: undefined })),
  /** The account turned off and its subscription removed: nothing it is sent routes until it is connected again. */
  disconnect: async (channelId: string): Promise<{ ok: boolean; message: string }> => {
    const r = await api()("POST channels/meta/disconnect", { body: { channel_id: channelId } });
    return { ok: r.ok, message: r.ok ? "" : r.message };
  },
};
