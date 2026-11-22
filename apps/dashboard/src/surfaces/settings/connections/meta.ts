/**
 * Connect Meta: the browser's half of the Meta link (Instagram API with Unified Login). Connect leaves for the app's own
 * route, which signs the way out and sends the browser to Meta's dialog, where the owner signs in with Instagram or
 * Facebook; Meta sends it back to the callback, which hands the code to the edge and returns here with one word in the
 * address (`?meta=`), taken off it once and said until Ok (model/came-back.ts). Nothing here holds a credential. Disconnect turns the account's row off through
 * its route; the refresh map re-reads the channels, where the row now shows.
 */
import { unwrap } from "@/client/api";
import { api } from "@/bridge/api";
import { metaDoorRead } from "../frame/pane-reads";
import { keepsUntilSeen, takeFromAddress } from "./model/came-back";

/** Whether this workspace may connect Meta, and this member may: asked once as Connections opens, and kept in the tab. */
const metaDoorOf = async () => unwrap(await metaDoorRead.read());
export type MetaDoor = Awaited<ReturnType<typeof metaDoorOf>>;

export const metaConnect = {
  config: metaDoorOf,
  /** The door as this tab last read it, or null: what the row draws in its first frame. */
  held: (): MetaDoor | null => metaDoorRead.held(),
  /** What Meta's dialog sent the browser back with, kept until its row's Ok (model/came-back.ts). */
  returned: keepsUntilSeen(() => takeFromAddress("meta")),
  /** To Meta's dialog, by the app's own route (which signs the way out). */
  start: () => window.location.assign(api().url("GET channels/meta/connect", { params: undefined })),
  /** The account turned off and its subscription removed: nothing it is sent routes until it is connected again. */
  disconnect: async (channelId: string): Promise<{ ok: boolean; message: string }> => {
    const r = await api()("POST channels/meta/disconnect", { body: { channel_id: channelId } });
    return { ok: r.ok, message: r.ok ? "" : r.message };
  },
};
