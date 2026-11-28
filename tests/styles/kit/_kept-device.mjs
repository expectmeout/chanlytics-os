/**
 * A device that kept the rooms of the figures its strips last said (apps/dashboard/src/surfaces/kit/kept-room.ts), and
 * the Inbox's strip of views drawn on it: shared by the test of the kept room and by the gallery's own drawing of a
 * count on its way (kit-components.test.mjs, `stabs-coming`).
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 */
import { ViewTabs } from "../../../apps/dashboard/src/surfaces/kit/view-tabs/view-tabs.tsx";

/** Where the kit keeps the rooms. */
export const ROOMS_SLOT = "chanlytics.kept-rooms.v1";

/**
 * A device that kept these rooms (none for null), for as long as `draw` takes: the browser's local storage as the kit
 * reads it, holding `rooms` under the kit's slot. Answers what `draw` drew, and what the device holds once `draw` has left
 * what its parts said. The world's own storage is put back after.
 */
export function onADeviceThatKept(rooms, draw) {
  const had = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const kept = new Map(rooms === null ? [] : [[ROOMS_SLOT, JSON.stringify(rooms)]]);
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (name) => (kept.has(name) ? kept.get(name) : null),
      setItem: (name, value) => void kept.set(name, String(value)),
      removeItem: (name) => void kept.delete(name),
    },
  });
  try {
    const drew = draw();
    return { drew, left: JSON.parse(kept.get(ROOMS_SLOT) ?? "{}") };
  } finally {
    if (had) Object.defineProperty(globalThis, "localStorage", had);
    else delete globalThis.localStorage;
  }
}

/**
 * The Inbox's strip as the frame hands it, made by the test's own `h`: its first tab's figure as given, a number or on
 * its way (`coming`); `named`, whether the strip has a name to remember its figures under.
 */
export const inboxStrip = (h, first, named = true) =>
  h(ViewTabs, {
    name: "inbox",
    label: "Section views",
    picked: "needs you",
    onPick() {},
    kept: named ? "kit/inbox" : undefined,
    tabs: [
      { id: "needs you", label: "Needs you", href: "#kit", tone: "warn", ...first },
      { id: "conversations", label: "Conversations", href: "#kit" },
      { id: "live", label: "Live", href: "#kit", live: true },
    ],
  });
