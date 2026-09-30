/**
 * Where the member was in the Inbox -- the bucket and the words in the search -- kept in this tab (the loading standard's
 * place, tab-memory.ts): a refresh or a trip to another page brings it back. The open thread is the address's
 * (inbox/<thread>). Where no store is published (the standalone harness), it lives for the page. Moved from
 * pages/inbox-list.jsx (decision 0015, step 3).
 */
import { tabMemory } from "./shell";

export const ixPlace = (): Record<string, unknown> => {
  const memory = tabMemory();
  return (memory && memory.place("inbox", "list")) || {};
};

export const ixKeepPlace = (patch: Record<string, unknown>): void => {
  const memory = tabMemory();
  if (memory) memory.keepPlace("inbox", "list", { ...ixPlace(), ...patch });
};
