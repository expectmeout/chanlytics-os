/**
 * What Ask remembers, as cards (decision 0070): a line kept (`memory`: Ask's own card, which arrives kept with its Undo,
 * and Settings › Memory's Add), a line's words changed (`memory_change`) and a line forgotten (`memory_forget`), the two
 * the pane presses. Each through its own door (POST, PATCH and DELETE ask/memory), which checks the caller's permission
 * itself: keeping is the approve permission's, changing the settings permission's, and forgetting the settings
 * permission's or the keeper's own.
 */
import { ASK_MEMORY_WORDS } from "../ask-memory/memory";
import { asText, type ProposalSpec, type ProposalSpecAboveOperator } from "./spec";

/** The line's id a door answered with, or the card's own (`memory_id`, written when the turn kept it). */
const memoryIdOf = (data: unknown, payload: Record<string, unknown>): string => {
  const d = (data && typeof data === "object" ? data : {}) as { memory?: { id?: unknown } };
  return typeof d.memory?.id === "string" ? d.memory.id : asText(payload.memory_id);
};

/** Settings › Memory: where every card about a line opens. */
export const MEMORY_ROUTE = "admin/memory";

export const memorySpec: ProposalSpec = {
  needs: "operator",
  gate: "approve",
  commit: ({ payload: pl }) => ({
    route: "POST ask/memory",
    body: {
      text: asText(pl.text),
      ...(asText(pl.thread_id) ? { thread_id: asText(pl.thread_id) } : {}),
      // A line Ask read from what they wrote is learned, as a pasted email's lines are (decision 0078 step 2).
      ...(pl.learned === true ? { source: "learned" } : {}),
    },
  }),
  receipt: ({ payload: pl }, data) => {
    const d = (data && typeof data === "object" ? data : {}) as { memory?: { text?: unknown } };
    return ASK_MEMORY_WORDS.receipt(asText(d.memory?.text) || asText(pl.text));
  },
  made: ({ payload: pl }, data) => memoryIdOf(data, pl) || null,
  undo: {
    label: () => ASK_MEMORY_WORDS.undoLabel,
    window: "ten_minutes",
    record: ({ payload: pl }, data) => {
      const id = memoryIdOf(data, pl);
      return id ? { memory_id: id } : null;
    },
    call: (u) => ({ route: "DELETE ask/memory/[id]", params: { id: asText(u.memory_id) }, goneIsDone: true }),
    receipt: () => ASK_MEMORY_WORDS.undone,
  },
  open: () => MEMORY_ROUTE,
};

export const memoryChangeSpec: ProposalSpecAboveOperator = {
  needs: "partner",
  doing: "change a line of what Ask remembers",
  gate: "settings",
  commit: ({ payload: pl }) => ({
    route: "PATCH ask/memory/[id]",
    params: { id: asText(pl.memory_id) },
    body: { text: asText(pl.text) },
  }),
  receipt: () => "Changed",
  undo: {
    label: () => "Undo",
    window: "ten_minutes",
    record: ({ payload: pl }) =>
      asText(pl.previous) ? { memory_id: asText(pl.memory_id), text: asText(pl.previous) } : null,
    call: (u) => ({
      route: "PATCH ask/memory/[id]",
      params: { id: asText(u.memory_id) },
      body: { text: asText(u.text) },
    }),
    receipt: () => "As it was",
  },
  open: () => MEMORY_ROUTE,
};

export const memoryForgetSpec: ProposalSpec = {
  needs: "operator",
  gate: "approve",
  commit: ({ payload: pl }) => ({
    route: "DELETE ask/memory/[id]",
    params: { id: asText(pl.memory_id) },
    goneIsDone: true,
  }),
  receipt: () => ASK_MEMORY_WORDS.undone,
  undo: {
    label: () => "Undo",
    window: "ten_minutes",
    // Forgotten is kept as forgotten, never deleted: the undo keeps the same words again, a line of its own.
    record: ({ payload: pl }) => (asText(pl.text) ? { text: asText(pl.text) } : null),
    call: (u) => ({ route: "POST ask/memory", body: { text: asText(u.text) } }),
    receipt: () => "Kept again",
  },
  open: () => MEMORY_ROUTE,
};
