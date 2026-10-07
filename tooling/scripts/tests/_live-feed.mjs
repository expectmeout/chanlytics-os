/**
 * What the live feed hands the runner for a notice (decision 0019): packages/db's subscribeWorkspaceChanges, run over
 * a client that delivers the notice the database would send (00265). Each change comes back as the runner hands it
 * to a surface's rule (surface-realtime.ts wantsRefresh): `{ table, event, row }`.
 *
 * The client's own behaviour, the shared channel and the join, is shell/surfaces/realtime-scope.test.mjs's.
 */
import { subscribeWorkspaceChanges, watchedEvents } from "@chanlytics/db";

/** Every event a table can be told for. */
export const EVERY_EVENT = ["INSERT", "UPDATE", "DELETE"];

/** The events the database tells a workspace for on `table`, or undefined when the live feed does not watch it. */
export const toldFor = (table) => watchedEvents().find((w) => w.table === table)?.events;

/** The changes one notice reaches the runner as, for a tab showing `tenantId`. */
export async function changesOf({ event, payload }, tenantId = "ws-1") {
  let hear = null;
  const channel = {
    on(_type, _filter, callback) {
      hear = callback;
      return channel;
    },
    subscribe: () => channel,
  };
  const client = {
    auth: { getSession: async () => ({ data: { session: { access_token: "jwt" } } }) },
    realtime: { setAuth() {} },
    channel: () => channel,
    removeChannel: async () => "ok",
  };
  const changes = [];
  const off = subscribeWorkspaceChanges(client, (row, table, heard) => changes.push({ table, event: heard, row }), {
    tenantId,
    onStatus: () => {},
  });
  await new Promise((r) => setTimeout(r, 0));
  hear({ type: "broadcast", event, payload });
  off();
  return changes;
}
