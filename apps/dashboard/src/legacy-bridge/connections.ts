/**
 * Connections on the classic page: the one row model (contracts/connections.ts)
 * published for Settings › Integrations, which draws every connection from
 * the surfaces already on the window — channels, Setup's facts, Google —
 * so it never fetches anything of its own and cannot disagree with Setup.
 */
import { connectionRows, CONNECTION_GROUP_WORDS } from "@chanlytics/contracts";

export interface ConnectionsApi {
  rows: typeof connectionRows;
  groupWords: typeof CONNECTION_GROUP_WORDS;
}

declare global {
  interface Window {
    __connections?: ConnectionsApi;
  }
}

export function installConnections(win: Window = window): void {
  win.__connections = { rows: connectionRows, groupWords: CONNECTION_GROUP_WORDS };
}
