/**
 * The workspace's channels, read once (the wiring's second audit, lane R6: W-channel-team-plus-1, S3-1, S10-9). GET channels
 * answers each channel the workspace is reached on: its number, whether it is on, what Meta holds against a WhatsApp number,
 * and when a customer last came in on it. Every page that draws one takes it from here:
 *  - Settings › Connections' WhatsApp and phone rows;
 *  - the Library's number notice and a message's drawer;
 *  - Live's line;
 *  - both composers' Send by and opt-in.
 *
 * Settings, Live and both composers each read it for themselves, and Settings heard none of its tables. So a number Meta
 * flagged, or a line that finished setting up, stayed as first read on the very page the bell's row opens, until a reload.
 *
 * It is heard wherever the tab is: a channel connected, switched off, flagged, or written by a line's saga is a few a week,
 * and its read is one route. A page made of it follows it (`followChannels`): each time it is published, the page is made
 * again of what it now holds, so a page read before it lands, or beside it for the same notice, never keeps an older number.
 */
import { toChannelVM, type ChannelDto, type ChannelVM } from "@chanlytics/contracts";
import { read } from "@/legacy-bridge/api";
import type { SurfaceOverride } from "@/legacy-bridge/surface-data";
import { declareReads } from "@/legacy-bridge/surface-registry";
import { surfaceMoved } from "@/legacy-bridge/surface-status";
import { onSurfaceValue, setSurfaceValue, surfaceValue, type SurfaceKey, type SurfaceValues } from "../surface-values";

/** The channels as GET channels answered them: null where the read failed, so a page says so, with a way to try again. */
export interface ChannelsSurface {
  rows: ChannelDto[] | null;
}

export const channelsOverride: SurfaceOverride = {
  key: "channels",
  value: "channels",
  events: ["surface:channels"],
  // The channel rows themselves (tenant_channels): connected, switched off, flagged by Meta, or written by a line's saga as
  // it starts to answer. GET channels reads nothing else of the channel kind.
  ...declareReads("channels", {
    reads: ["channel"],
    fresh: "live",
    omit: [
      {
        tables: ["lines"],
        why: "a line's saga steps are Setup's to say (Connections' phone row takes its progress from Setup's read); the saga writes the channel row itself when the line answers",
      },
      {
        tables: ["mailboxes", "mailbox_connections", "capability_activations", "business_records"],
        why: "GET channels answers the numbers the workspace is reached on; a mailbox, a connected mailbox, an activation and the carriers' record are Setup's read",
      },
    ],
  }),
  apply: async () => {
    try {
      const r = await read("GET channels");
      setSurfaceValue("channels", { rows: r.channels ?? [] });
    } catch (e) {
      // Null, not undefined: the pages draw a card with a retry instead of "Reading…" for ever.
      setSurfaceValue("channels", { rows: null });
      throw e;
    }
  },
};

/**
 * The rows as a page shows them (contracts toChannelVM, by the clock now): undefined before the read has landed, null where
 * it failed. `heard` is when a customer last came in on each kind, where another read knows it later than this one did
 * (Setup's hears a first call and a first message: X3-3), so a row never says nothing has arrived when something has.
 */
export function channelVMs(
  value: ChannelsSurface | undefined,
  now = new Date(),
  heard: Partial<Record<string, string | null>> = {},
): ChannelVM[] | null | undefined {
  if (!value) return undefined;
  if (value.rows === null) return null;
  return value.rows.map((c) => toChannelVM({ ...c, last_inbound_at: laterOf(c.last_inbound_at, heard[c.kind]) }, now));
}

/** The later of two instants, either missing. */
function laterOf(a: string | null | undefined, b: string | null | undefined): string | null {
  if (!a) return b ?? null;
  if (!b) return a;
  return Date.parse(b) > Date.parse(a) ? b : a;
}

/** The channel rows this tab holds now: undefined before the read has landed, null where it failed. */
export function channelsHeld(): ChannelDto[] | null | undefined {
  const value = surfaceValue("channels");
  return value === undefined ? undefined : value.rows;
}

/**
 * Keep a surface made of the channels as they stand: each time the channels are published, `remake` answers the surface's
 * value as it should be now, from what it holds and the rows, and the surface is published again and drawn again when that is
 * not the value it held (`remake` answers the same object when nothing changed). No read: the channels read is the one read of
 * them. A surface not read yet holds nothing to remake; its own read takes whatever the channels hold by then.
 */
export function followChannels<K extends SurfaceKey>(
  key: K,
  remake: (held: NonNullable<SurfaceValues[K]>, rows: ChannelDto[] | null) => SurfaceValues[K],
): void {
  onSurfaceValue("channels", () => {
    const channels = surfaceValue("channels");
    const held = surfaceValue(key);
    if (channels === undefined || held === undefined || held === null) return;
    const next = remake(held, channels.rows);
    if (next === held) return;
    setSurfaceValue(key, next);
    surfaceMoved(key);
  });
}
