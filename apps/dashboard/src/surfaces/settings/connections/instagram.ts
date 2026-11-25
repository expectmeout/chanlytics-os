/**
 * Connect your Instagram account: the browser's half (decision 0001, step 8). Connect leaves for the app's own route,
 * which signs the way out and sends the browser to Instagram's consent screen; Instagram sends it back to the callback,
 * which hands the code to the edge and returns here with one word in the address (`?instagram=`), taken off it once and
 * said until Ok (model/came-back.ts; its sentences are model/login-words.ts).
 * Nothing here holds a credential. Disconnect turns the account's row off through its route; the refresh map re-reads
 * the channels, where the row now shows.
 */
import { unwrap } from "@/client/api";
import { api } from "@/bridge/api";
import { instagramDoorRead } from "../frame/pane-reads";
import { keepsUntilSeen, takeFromAddress } from "./model/came-back";

/**
 * Whether this deployment can connect an account, and this member may: asked once as Connections opens, and kept in the tab,
 * so the row draws the last answer while it asks again (settings/frame/pane-reads.ts).
 */
const readInstagramDoor = async () => unwrap(await instagramDoorRead.read());
export type InstagramDoor = Awaited<ReturnType<typeof readInstagramDoor>>;

export const igConnect = {
  config: readInstagramDoor,
  /** The door as this tab last read it, or null: what the row draws in its first frame. */
  held: (): InstagramDoor | null => instagramDoorRead.held(),
  /** What Instagram's screen sent the browser back with, kept until its row's Ok (model/came-back.ts). */
  returned: keepsUntilSeen(() => takeFromAddress("instagram")),
  /** To Instagram's consent screen, by the app's own route (which signs the way out). */
  start: () => window.location.assign(api().url("GET channels/instagram/connect", { params: undefined })),
  /** The account turned off: nothing it is sent routes until it is connected again. */
  disconnect: async (channelId: string): Promise<{ ok: boolean; message: string }> => {
    const r = await api()("POST channels/instagram/disconnect", { body: { channel_id: channelId } });
    return { ok: r.ok, message: r.ok ? "" : r.message };
  },
};
