/**
 * The lines the apps' loggers write (apps/dashboard/src/server/log.ts, apps/edge/lib/log.ts), read back by a case:
 * one JSON object per console call, parsed, and its fields without the envelope, so a case compares what the line
 * means to say and not the request it happened to serve.
 */

/** A console call's arguments as one logger line, parsed; null when they are not one (a package's own line). */
export function logLineOf(args) {
  if (args.length !== 1 || typeof args[0] !== "string" || !args[0].startsWith("{")) return null;
  try {
    const line = JSON.parse(args[0]);
    return line && typeof line.event === "string" ? line : null;
  } catch {
    return null;
  }
}

/** A line's own fields: the envelope (level, event, request_id) left out. */
export function fieldsOf(line) {
  const { level: _level, event: _event, request_id: _id, ...rest } = line;
  return rest;
}

/** A console call's arguments in the older two-part shape a case may still read: the event, then its fields as JSON. */
export function asEventAndJson(args) {
  const line = logLineOf(args);
  return line ? [line.event, JSON.stringify(fieldsOf(line))] : args;
}

/** The same, as one string: `<event> <fields as JSON>`. */
export const asText = (args) => asEventAndJson(args).map(String).join(" ");
