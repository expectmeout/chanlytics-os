export const ok = (data) => ({ ok: true, data });
export const SERVED_AT_HEADER = "x-served-at";
export const err = (code, message, details) => ({
  ok: false,
  error: details === void 0 ? { code, message } : { code, message, details }
});
