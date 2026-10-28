/**
 * Connect your Instagram account: the browser's half (decision 0001, step 8). Connect leaves for the app's own route,
 * which signs the way out and sends the browser to Instagram's consent screen; Instagram sends it back to the callback,
 * which hands the code to the edge and returns here with one word in the address (`?instagram=`), read once and cleared.
 * Nothing here holds a credential. Disconnect turns the account's row off through its route; the refresh map re-reads
 * the channels, where the row now shows.
 */
import { unwrap } from "@/client/api";
import { api } from "@/legacy-bridge/api";
import { instagramDoorRead } from "../frame/pane-reads";

/**
 * Whether this deployment can connect an account, and this member may: asked once as Connections opens, and kept in the tab,
 * so the row draws the last answer while it asks again (settings/frame/pane-reads.ts).
 */
const doorOf = async () => unwrap(await instagramDoorRead.read());
export type InstagramDoor = Awaited<ReturnType<typeof doorOf>>;

/** The words the row says for what came back from Instagram, by the outcome or its reason. */
const OUTCOME_WORDS: Readonly<Record<string, string>> = {
  connected: "Instagram is connected — the receptionist answers its DMs now.",
  declined: "Instagram did not connect: the sign-in was declined.",
  state_expired: "The way back from Instagram took too long. Start the connection again.",
  state_signature: "The way back from Instagram could not be verified. Start the connection again.",
  state_missing: "The way back from Instagram was incomplete. Start the connection again.",
  state_malformed: "The way back from Instagram was incomplete. Start the connection again.",
  someone_else: "That connection was started by a different account. Start it again from here.",
  not_owner: "Only an owner or a manager can connect Instagram.",
  no_workspace: "The workspace the connection was started for is not one of yours.",
  no_code: "Instagram sent nothing back. Start the connection again.",
  exchange_failed: "Instagram did not accept the sign-in. Start the connection again.",
  instagram_messages_not_granted:
    "Instagram connected without its messages. Start again and allow Chanlytics to manage them.",
  instagram_account_unreadable:
    "Instagram did not say which account signed in. Use your professional (business or creator) account and try again.",
  instagram_account_taken: "That Instagram account is already connected to another workspace.",
  subscribe_failed: "Chanlytics could not subscribe to the account's DMs. Try again in a moment.",
  credentials_failed: "The connection could not be saved safely, so it was not kept. Try again.",
  channel_write_failed: "The connection could not be saved. Try again.",
  not_available: "Connecting Instagram is not available here yet.",
  preview: "Connecting only works on the production dashboard.",
};

/** What the browser came back from Instagram with, in words, read once and taken off the address; null for nothing. */
function outcome(): string | null {
  try {
    const q = new URLSearchParams(window.location.search);
    const said = q.get("instagram");
    if (!said) return null;
    const why = q.get("why");
    q.delete("instagram");
    q.delete("why");
    const rest = q.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${rest ? `?${rest}` : ""}${window.location.hash}`,
    );
    if (said === "connected") return OUTCOME_WORDS.connected ?? null;
    return (why && OUTCOME_WORDS[why]) || `Instagram did not connect (${why || "unknown"}).`;
  } catch {
    return null;
  }
}

export const igConnect = {
  config: doorOf,
  /** The door as this tab last read it, or null: what the row draws in its first frame. */
  held: (): InstagramDoor | null => instagramDoorRead.held(),
  outcome,
  /** To Instagram's consent screen, by the app's own route (which signs the way out). */
  start: () => window.location.assign(api().url("GET channels/instagram/connect", { params: undefined })),
  /** The account turned off: nothing it is sent routes until it is connected again. */
  disconnect: async (channelId: string): Promise<{ ok: boolean; message: string }> => {
    const r = await api()("POST channels/instagram/disconnect", { body: { channel_id: channelId } });
    return { ok: r.ok, message: r.ok ? "" : r.message };
  },
};
