import { ASK_MEMORY_WORDS } from "../ask-memory/memory.js";
import { asText } from "./spec.js";
const memoryIdOf = (data, payload) => {
  const d = data && typeof data === "object" ? data : {};
  return typeof d.memory?.id === "string" ? d.memory.id : asText(payload.memory_id);
};
const MEMORY_ROUTE = "admin/memory";
export const memorySpec = {
  needs: "operator",
  gate: "approve",
  commit: ({ payload: pl }) => ({
    route: "POST ask/memory",
    body: { text: asText(pl.text), ...asText(pl.thread_id) ? { thread_id: asText(pl.thread_id) } : {} }
  }),
  receipt: ({ payload: pl }, data) => {
    const d = data && typeof data === "object" ? data : {};
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
    receipt: () => ASK_MEMORY_WORDS.undone
  },
  open: () => MEMORY_ROUTE
};
export const memoryChangeSpec = {
  needs: "partner",
  doing: "change a line of what Ask remembers",
  gate: "settings",
  commit: ({ payload: pl }) => ({
    route: "PATCH ask/memory/[id]",
    params: { id: asText(pl.memory_id) },
    body: { text: asText(pl.text) }
  }),
  receipt: () => "Changed",
  undo: {
    label: () => "Undo",
    window: "ten_minutes",
    record: ({ payload: pl }) => asText(pl.previous) ? { memory_id: asText(pl.memory_id), text: asText(pl.previous) } : null,
    call: (u) => ({
      route: "PATCH ask/memory/[id]",
      params: { id: asText(u.memory_id) },
      body: { text: asText(u.text) }
    }),
    receipt: () => "As it was"
  },
  open: () => MEMORY_ROUTE
};
export const memoryForgetSpec = {
  needs: "operator",
  gate: "approve",
  commit: ({ payload: pl }) => ({
    route: "DELETE ask/memory/[id]",
    params: { id: asText(pl.memory_id) },
    goneIsDone: true
  }),
  receipt: () => ASK_MEMORY_WORDS.undone,
  undo: {
    label: () => "Undo",
    window: "ten_minutes",
    // Forgotten is kept as forgotten, never deleted: the undo keeps the same words again, a line of its own.
    record: ({ payload: pl }) => asText(pl.text) ? { text: asText(pl.text) } : null,
    call: (u) => ({ route: "POST ask/memory", body: { text: asText(u.text) } }),
    receipt: () => "Kept again"
  },
  open: () => MEMORY_ROUTE
};
