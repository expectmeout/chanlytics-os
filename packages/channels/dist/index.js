// src/log/redact.ts
var CONTACT = /* @__PURE__ */ new Set(["phone", "to", "from", "email", "e164"]);
var CONTACT_SUFFIX = /_(phone|email|e164)$/;
var WORDS_KEYS = /* @__PURE__ */ new Set(["body", "text"]);
var WORDS_SUFFIX = /_(body|text)$/;
var SECRET_KEY = /(?:^|[_-])(?:token|secret|password|passwd|authorization|api[_-]?key|cookie|credentials?|private[_-]?key|signature)$/i;
var MAX_DEPTH = 6;
var MANY_DIGITS = /\d(?:\D*\d){6,}/;
var EMAIL = /^[^\s@]+@([^\s@]+\.[^\s@]+)$/;
var NUMBER_FLOOR = 1e6;
var SECRET_SHAPES = [
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/g,
  /\bsk-[A-Za-z0-9_-]{16,}/g,
  // Anthropic, and any model gateway that keys its account the same way
  /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{8,}/g,
  // Stripe
  /\bwhsec_[A-Za-z0-9]{8,}/g,
  // Stripe's webhook secret
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g,
  // a JWT: a session, a Supabase key
  /\bEAA[A-Za-z0-9]{20,}/g,
  // Meta's access tokens
  /\bre_[A-Za-z0-9_]{20,}/g,
  // Resend
  /\bya29\.[A-Za-z0-9_-]{20,}/g,
  // Google's access tokens
  /\bAIza[A-Za-z0-9_-]{30,}/g,
  // Google's API keys
  /\bxox[abposr]-[A-Za-z0-9-]{10,}/g,
  // Slack
  /\bsb_secret_[A-Za-z0-9_-]{10,}/g
  // Supabase
];
var NAMED_SECRET = /(?<![\w-])((?:api[_-]?key|access[_-]?token|refresh[_-]?token|token|secret|password|passwd|signature|key)=)[^&\s"';,]+/gi;
var EMAIL_IN_TEXT = /(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,})/g;
var MAX_STRING = 1e4;
var ID_OR_MOMENT = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?)$/i;
var PLUS_NUMBER = /\+\d[\d ().-]{6,}\d/g;
var US_NUMBER = /(?<![\w-])\(?\d{3}\)?[ .-]\d{3}[ .-]\d{4}(?![\w-])/g;
var isContactKey = (k) => CONTACT.has(k) || CONTACT_SUFFIX.test(k);
var isWordsKey = (k) => WORDS_KEYS.has(k) || WORDS_SUFFIX.test(k);
var isSecretKey = (k) => SECRET_KEY.test(k);
var tailOf = (digits) => `\u2026${digits.replace(/\D/g, "").slice(-4)}`;
function contact(v) {
  if (typeof v === "string") {
    const at = EMAIL.exec(v.trim());
    if (at) return `\u2026@${at[1]}`;
    if (ID_OR_MOMENT.test(v.trim())) return v;
    if (MANY_DIGITS.test(v)) return tailOf(v);
    return v;
  }
  if (typeof v === "number" && Math.abs(v) >= NUMBER_FLOOR) return tailOf(String(Math.trunc(Math.abs(v))));
  if (typeof v === "bigint") return tailOf(v.toString());
  if (Array.isArray(v)) return v.map(contact);
  if (v !== null && typeof v === "object") return "[redacted]";
  return v;
}
function lengthOnly(v) {
  if (typeof v === "string") return `[${v.length} chars]`;
  if (v === null || typeof v === "boolean" || typeof v === "number") return v;
  return "[redacted]";
}
function credential(v) {
  return v === null || typeof v === "boolean" ? v : "[redacted]";
}
function scrubText(s) {
  let out = s.length > MAX_STRING ? `${s.slice(0, MAX_STRING)}\u2026[${s.length - MAX_STRING} more chars]` : s;
  for (const shape of SECRET_SHAPES)
    out = out.replace(shape, (m) => m.startsWith("Bearer") ? "Bearer [redacted]" : "[redacted]");
  out = out.replace(NAMED_SECRET, "$1[redacted]");
  out = out.replace(EMAIL_IN_TEXT, (_m, domain) => `\u2026@${domain}`);
  out = out.replace(PLUS_NUMBER, tailOf).replace(US_NUMBER, tailOf);
  return out;
}
function errText(e) {
  return scrubText(`${e.name}: ${e.message}`);
}
function redact(key, value, depth = 0, above = /* @__PURE__ */ new Set()) {
  if (isWordsKey(key)) return lengthOnly(value);
  if (isContactKey(key)) return contact(value);
  if (isSecretKey(key)) return credential(value);
  if (value instanceof Error) return errText(value);
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "string") return scrubText(value);
  if (value === null || typeof value !== "object") return value;
  if (above.has(value) || depth >= MAX_DEPTH) return "[\u2026]";
  above.add(value);
  let out;
  if (Array.isArray(value)) out = value.map((x) => redact("", x, depth + 1, above));
  else {
    const fields = {};
    for (const [k, v] of Object.entries(value)) if (v !== void 0) fields[k] = redact(k, v, depth + 1, above);
    out = fields;
  }
  above.delete(value);
  return out;
}

// src/log/request.ts
import { AsyncLocalStorage } from "async_hooks";
var REQUEST_SLOT = /* @__PURE__ */ Symbol.for("chanlytics.request");
var requestHolder = globalThis;
var serving = requestHolder[REQUEST_SLOT] ??= new AsyncLocalStorage();
function withRequestId(id, fn) {
  return serving.run({ id }, fn);
}
function requestId() {
  return serving.getStore()?.id ?? null;
}
function noteTenant(tenantId) {
  const store = serving.getStore();
  if (store) store.tenantId = tenantId;
}
function requestTenant() {
  return serving.getStore()?.tenantId ?? null;
}

// src/log/logger.ts
var ENVELOPE = /* @__PURE__ */ new Set(["level", "event", "request_id"]);
var STACK_FRAMES = 8;
function stackOf(e) {
  if (!e.stack) return void 0;
  const frames = e.stack.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("at ")).slice(0, STACK_FRAMES);
  return frames.length ? String(redact("", frames.join(" | "))) : void 0;
}
function lineOf(level, event, fields) {
  const line = { level, event };
  const id = requestId();
  if (id) line.request_id = id;
  const tenant = requestTenant();
  if (tenant && fields.tenant_id === void 0) line.tenant_id = tenant;
  for (const [k, v] of Object.entries(fields)) {
    if (v === void 0) continue;
    const key = ENVELOPE.has(k) ? `${k}_field` : k;
    line[key] = redact(k, v);
    if (level === "error" && v instanceof Error) {
      const stack = stackOf(v);
      if (stack) line[`${key}_stack`] = stack;
    }
  }
  return line;
}
function emit(level, event, fields) {
  let text;
  try {
    text = JSON.stringify(lineOf(level, event, fields));
  } catch {
    text = JSON.stringify({ level, event, request_id: requestId() ?? void 0, unwritable: true });
  }
  if (level === "error") console.error(text);
  else if (level === "warn") console.warn(text);
  else console.log(text);
}
function logger(base = {}) {
  return {
    info: (event, fields) => emit("info", event, { ...base, ...fields }),
    warn: (event, fields) => emit("warn", event, { ...base, ...fields }),
    error: (event, fields) => emit("error", event, { ...base, ...fields }),
    child: (extra) => logger({ ...base, ...extra })
  };
}
function errField(e) {
  return e instanceof Error ? errText(e) : String(e);
}

// src/provider-fetch.ts
import { jittered } from "../../contracts/dist/index.js";
var PROVIDER_NAMES = [
  "meta",
  "twilio",
  "retell",
  "resend",
  "google",
  "apify",
  "expo",
  "anthropic",
  "typesafe",
  "elevenlabs"
];
var BREAKER_FAILURES = 5;
var BREAKER_OPEN_MS = 3e4;
var RETRY_BASE_MS = 250;
var RETRY_WAIT_CAP_MS = 2e3;
var BREAKER_SLOT = /* @__PURE__ */ Symbol.for("chanlytics.provider-breakers");
var breakerHolder = globalThis;
var breakers = breakerHolder[BREAKER_SLOT] ??= { held: /* @__PURE__ */ new Map(), opened: /* @__PURE__ */ new Map() };
var breakerMap = breakers.held;
var breakerLog = logger();
function breakerOf(provider, now = Date.now()) {
  const b = breakerMap.get(provider);
  return { open: !!b && b.openUntil > now, failures: b?.failures ?? 0 };
}
function breakerStates(now = Date.now()) {
  return PROVIDER_NAMES.map((provider) => {
    const b = breakerMap.get(provider);
    const open = !!b && b.openUntil > now;
    return {
      provider,
      open,
      failures: b?.failures ?? 0,
      opened: breakers.opened.get(provider) ?? 0,
      open_until: open ? new Date(b.openUntil).toISOString() : null
    };
  });
}
function resetBreakers() {
  breakerMap.clear();
  breakers.opened.clear();
}
var NEVER_LEFT = /* @__PURE__ */ new Set([
  "ECONNREFUSED",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ENETUNREACH",
  "EHOSTUNREACH",
  "UND_ERR_CONNECT_TIMEOUT"
]);
function outcomeOfStatus(status) {
  if (status >= 200 && status < 300) return "ok";
  if (status === 408 || status === 429) return "retryable";
  if (status >= 500) return "unknown";
  return "refused";
}
function outcomeOfThrow(e) {
  const err = e instanceof Error ? e : new Error(String(e));
  if (err.name === "TimeoutError" || err.name === "AbortError") return { outcome: "unknown", error: "timeout" };
  const cause = err.cause;
  const code = typeof cause?.code === "string" ? cause.code : err.code;
  const words = typeof cause === "object" && cause && "message" in cause ? `${err.message}: ${String(cause.message)}` : err.message;
  return { outcome: typeof code === "string" && NEVER_LEFT.has(code) ? "retryable" : "unknown", error: words };
}
function retryAfterOf(header, now = Date.now()) {
  if (!header) return null;
  const secs = Number(header);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1e3);
  const at = Date.parse(header);
  return Number.isFinite(at) ? Math.max(0, at - now) : null;
}
var isFault = (a) => a.status === 0 && a.error !== "breaker_open" || a.status >= 500;
function note(provider, a, now) {
  if (a.error === "breaker_open") return;
  const b = breakerMap.get(provider);
  if (!isFault(a)) {
    if (b && b.openUntil > 0) breakerLog.info("breaker_closed", { provider, failures: b.failures });
    breakerMap.delete(provider);
    return;
  }
  const next = b ?? { failures: 0, openUntil: 0 };
  const wasOpen = next.openUntil > now;
  next.failures += 1;
  if (next.failures >= BREAKER_FAILURES) {
    next.openUntil = now + BREAKER_OPEN_MS;
    if (!wasOpen) {
      breakers.opened.set(provider, (breakers.opened.get(provider) ?? 0) + 1);
      breakerLog.warn("breaker_open", {
        provider,
        failures: next.failures,
        status: a.status,
        error: a.error,
        open_ms: BREAKER_OPEN_MS
      });
    }
  }
  breakerMap.set(provider, next);
}
async function once(provider, url, call2, deps, tries) {
  const now = deps.now();
  const b = breakerMap.get(provider);
  if (b && b.openUntil > now && call2.breaker !== "count") {
    const held = {
      outcome: "retryable",
      status: 0,
      text: "",
      json: null,
      body: null,
      headers: null,
      retryAfterMs: b.openUntil - now,
      error: "breaker_open",
      tries: tries - 1
    };
    return held;
  }
  const init = {
    method: call2.method,
    headers: call2.headers,
    body: call2.body,
    cache: call2.cache,
    redirect: call2.redirect
  };
  let a;
  const bound = AbortSignal.timeout(call2.timeoutMs);
  try {
    const r = await deps.fetch(url, { ...init, signal: call2.signal ? AbortSignal.any([bound, call2.signal]) : bound });
    if (call2.stream && r.ok && r.body) {
      a = {
        outcome: "ok",
        status: r.status,
        text: "",
        json: null,
        body: r.body,
        headers: r.headers,
        retryAfterMs: null,
        error: null,
        tries
      };
      note(provider, a, deps.now());
      return a;
    }
    const text = await r.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    a = {
      outcome: outcomeOfStatus(r.status),
      status: r.status,
      text,
      json,
      body: null,
      headers: r.headers,
      retryAfterMs: retryAfterOf(r.headers.get("retry-after"), deps.now()),
      error: null,
      tries
    };
  } catch (e) {
    const { outcome, error } = outcomeOfThrow(e);
    a = { outcome, status: 0, text: "", json: null, body: null, headers: null, retryAfterMs: null, error, tries };
  }
  note(provider, a, deps.now());
  return a;
}
async function providerFetch(provider, url, call2, deps = {}) {
  const d = {
    fetch: deps.fetch ?? globalThis.fetch,
    now: deps.now ?? Date.now,
    sleep: deps.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))),
    random: deps.random ?? Math.random
  };
  const started = d.now();
  const max = Math.max(1, Math.floor(call2.tries ?? 1));
  for (let n = 1; ; n++) {
    const a = await once(provider, url, call2, d, n);
    const again = a.outcome === "retryable" || a.outcome === "unknown" && call2.idempotent === true;
    if (!again || n >= max || a.error === "breaker_open" || a.error === "timeout") return a;
    if (a.retryAfterMs !== null && a.retryAfterMs > RETRY_WAIT_CAP_MS) return a;
    const wait = a.retryAfterMs ?? jittered(RETRY_BASE_MS * 2 ** (n - 1), d.random);
    const left = call2.deadlineMs === void 0 ? Infinity : call2.deadlineMs - (d.now() - started);
    if (wait + call2.timeoutMs > left) return a;
    await d.sleep(wait);
  }
}
function answerObject(a) {
  return a.json !== null && typeof a.json === "object" && !Array.isArray(a.json) ? a.json : null;
}

// src/public-fetch.ts
import dns from "dns";
import http from "http";
import https from "https";
import net from "net";
import { pipeline, Readable, Transform } from "stream";
import zlib from "zlib";
var resolveByLookup = async (host) => {
  const all = await dns.promises.lookup(host, { all: true, verbatim: true });
  return all.map((a) => ({ address: a.address, family: a.family }));
};
function octetsOf(address) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(address);
  if (!m) return null;
  const o = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
  return o.every((n) => n <= 255) ? o : null;
}
function v4IsPublic(o) {
  const [a, b, c] = o;
  if (a === 0 || a === 10 || a === 127) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a === 198 && b === 51 && c === 100) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  if (a >= 224) return false;
  return true;
}
function bytesOfV6(address) {
  const bare = address.replace(/^\[|\]$/g, "").split("%")[0] ?? "";
  if (net.isIP(bare) !== 6) return null;
  let head = bare;
  const tail = /(\d{1,3}(?:\.\d{1,3}){3})$/.exec(bare);
  if (tail) {
    const o = octetsOf(tail[1] ?? "");
    if (!o) return null;
    head = bare.slice(0, tail.index) + (o[0] << 8 | o[1]).toString(16) + ":" + (o[2] << 8 | o[3]).toString(16);
  }
  const [left = "", right] = head.split("::");
  const groups = (s) => s ? s.split(":").filter((x) => x !== "") : [];
  const l = groups(left);
  const r = right === void 0 ? [] : groups(right);
  const zeros = right === void 0 ? 0 : 8 - l.length - r.length;
  if (zeros < 0 || right === void 0 && l.length !== 8) return null;
  const all = [...l, ...Array(zeros).fill("0"), ...r];
  const bytes = [];
  for (const g of all) {
    const n = parseInt(g, 16);
    if (!Number.isFinite(n) || n < 0 || n > 65535) return null;
    bytes.push(n >> 8, n & 255);
  }
  return bytes.length === 16 ? bytes : null;
}
function carriedV4(b) {
  return [b[12] ?? 0, b[13] ?? 0, b[14] ?? 0, b[15] ?? 0];
}
var zeroBetween = (b, from, to) => b.slice(from, to).every((x) => x === 0);
function v6IsPublic(b) {
  if (zeroBetween(b, 0, 15) && (b[15] === 0 || b[15] === 1)) return false;
  if (zeroBetween(b, 0, 10) && b[10] === 255 && b[11] === 255) return v4IsPublic(carriedV4(b));
  if (zeroBetween(b, 0, 12)) return v4IsPublic(carriedV4(b));
  if (b[0] === 0 && b[1] === 100 && b[2] === 255 && b[3] === 155 && zeroBetween(b, 4, 12))
    return v4IsPublic(carriedV4(b));
  const first = b[0] ?? 0;
  const second = b[1] ?? 0;
  if ((first & 254) === 252) return false;
  if (first === 254 && (second & 192) === 128) return false;
  if (first === 255) return false;
  if (first === 32 && second === 1 && b[2] === 13 && b[3] === 184) return false;
  return true;
}
function isPublicAddress(address) {
  const o = octetsOf(address);
  if (o) return v4IsPublic(o);
  const b = bytesOfV6(address);
  return b ? v6IsPublic(b) : false;
}
var NotPublicError = class extends Error {
  constructor(host, detail) {
    super(`${host}: ${detail}`);
    this.name = "NotPublicError";
  }
};
function publicLookup(resolve) {
  return (host, options, callback) => {
    resolve(host).then(
      (answers) => {
        const bad = answers.find((a) => !isPublicAddress(a.address));
        if (answers.length === 0) return callback(new NotPublicError(host, "no address"), "");
        if (bad) return callback(new NotPublicError(host, `resolves to ${bad.address}, not a public address`), "");
        if (typeof options === "object" && options?.all) return callback(null, answers);
        const first = answers[0];
        return first ? callback(null, first.address, first.family) : callback(new NotPublicError(host, "no address"), "");
      },
      (e) => callback(e instanceof Error ? e : new Error(String(e)), "")
    );
  };
}
var BODYLESS = /* @__PURE__ */ new Set([101, 103, 204, 205, 304]);
function bodyText(body) {
  if (typeof body === "string") return body;
  if (body instanceof URLSearchParams) return body.toString();
  throw new TypeError("publicFetch sends a string or form fields as a body");
}
var RESPONSE_MAX_BYTES = 5 * 1024 * 1024;
function capped(limit) {
  let seen = 0;
  return new Transform({
    transform(chunk, _encoding, done) {
      seen += chunk.length;
      if (seen > limit) done(new Error(`the response is over ${limit} bytes`));
      else done(null, chunk);
    }
  });
}
function decoded(res) {
  const coding = String(res.headers["content-encoding"] ?? "").toLowerCase();
  const cap = capped(RESPONSE_MAX_BYTES);
  const ignore = () => void 0;
  if (coding === "gzip" || coding === "x-gzip") return pipeline(res, zlib.createGunzip(), cap, ignore);
  if (coding === "deflate") return pipeline(res, zlib.createInflate(), cap, ignore);
  if (coding === "br") return pipeline(res, zlib.createBrotliDecompress(), cap, ignore);
  return pipeline(res, cap, ignore);
}
function publicFetch(deps = {}) {
  const lookup = publicLookup(deps.resolve ?? resolveByLookup);
  const request = deps.request ?? https.request;
  const once2 = async (input, init) => {
    const target = new URL(input instanceof Request ? input.url : String(input));
    if (target.protocol !== "https:" && target.protocol !== "http:")
      throw new NotPublicError(target.host, `${target.protocol} is not fetched`);
    const literal = target.hostname.replace(/^\[|\]$/g, "");
    if (net.isIP(literal) && !isPublicAddress(literal)) throw new NotPublicError(target.host, "not a public address");
    const headers2 = { "accept-encoding": "gzip, deflate, br" };
    new Headers(input instanceof Request ? input.headers : void 0).forEach((v, k) => headers2[k] = v);
    new Headers(init?.headers).forEach((v, k) => headers2[k] = v);
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const signal = init?.signal ?? (input instanceof Request ? input.signal : void 0);
    return new Promise((resolveResponse, reject) => {
      if (signal?.aborted) return reject(signal.reason instanceof Error ? signal.reason : new Error("aborted"));
      const send = deps.request ?? (target.protocol === "http:" ? http.request : request);
      const req = send(target, { method, headers: headers2, lookup }, (res) => {
        const out = new Headers();
        for (let i = 0; i + 1 < res.rawHeaders.length; i += 2)
          out.append(res.rawHeaders[i] ?? "", res.rawHeaders[i + 1] ?? "");
        const status = res.statusCode ?? 0;
        if (out.has("content-encoding")) {
          out.delete("content-encoding");
          out.delete("content-length");
        }
        const body2 = BODYLESS.has(status) || method === "HEAD" ? null : Readable.toWeb(decoded(res));
        if (body2 === null) res.resume();
        resolveResponse(new Response(body2, { status, statusText: res.statusMessage ?? "", headers: out }));
      });
      const onAbort = () => req.destroy(signal?.reason instanceof Error ? signal.reason : new Error("aborted"));
      signal?.addEventListener("abort", onAbort, { once: true });
      req.on("error", (e) => {
        signal?.removeEventListener("abort", onAbort);
        reject(e);
      });
      req.on("close", () => signal?.removeEventListener("abort", onAbort));
      const body = init?.body;
      if (body !== void 0 && body !== null && method !== "GET" && method !== "HEAD") req.write(bodyText(body));
      req.end();
    });
  };
  return async (input, init) => {
    const manual = init?.redirect === "manual" || input instanceof Request && input.redirect === "manual";
    if (manual) return once2(input, init);
    let url = input instanceof Request ? input.url : String(input);
    let at = init;
    for (let hop = 0; ; hop += 1) {
      const res = await once2(url, at);
      const next = REDIRECT_STATUSES.has(res.status) ? res.headers.get("location") : null;
      if (!next) return res;
      await res.body?.cancel().catch(() => void 0);
      if (hop >= REDIRECTS_MAX) throw new NotPublicError(new URL(url).host, "too many redirects");
      url = new URL(next, url).toString();
      if (res.status !== 307 && res.status !== 308) at = { ...at, method: "GET", body: void 0 };
    }
  };
}
var REDIRECTS_MAX = 5;
var REDIRECT_STATUSES = /* @__PURE__ */ new Set([301, 302, 303, 307, 308]);
var STAND_IN = /* @__PURE__ */ Symbol.for("chanlytics.publicFetch.standIn");
var guarded = null;
function publicFetcher() {
  const standIn = globalThis[STAND_IN];
  if (standIn) return standIn;
  guarded ??= publicFetch();
  return guarded;
}
function setPublicFetch(f) {
  const holder = globalThis;
  const before = holder[STAND_IN] ?? null;
  holder[STAND_IN] = f;
  return before;
}

// src/models/anthropic.ts
import { fallbackModel, modelRoute, usageOf, NO_USAGE } from "../../contracts/dist/index.js";
var ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
var ANTHROPIC_VERSION = "2023-06-01";
var FALLBACK_FLOOR_MS = 1500;
function headersFor(key, betas) {
  return {
    "content-type": "application/json",
    "x-api-key": key,
    "anthropic-version": ANTHROPIC_VERSION,
    ...betas && betas.length ? { "anthropic-beta": betas.join(",") } : {}
  };
}
function errorOf(a) {
  const j = a.json;
  const m = j && typeof j === "object" && j.error && typeof j.error.message === "string" ? j.error.message : null;
  return m ?? a.error ?? `status ${a.status}`;
}
var neverCame = (a) => a.outcome === "unknown";
var modelUnknown = (a) => a.status === 404;
function messageOf(json) {
  const j = json && typeof json === "object" ? json : {};
  const content = Array.isArray(j.content) ? j.content : [];
  return {
    id: typeof j.id === "string" ? j.id : null,
    model: typeof j.model === "string" ? j.model : null,
    stop_reason: typeof j.stop_reason === "string" ? j.stop_reason : null,
    content,
    usage: j.usage && typeof j.usage === "object" ? j.usage : null
  };
}
function messageTextOf(message) {
  return message.content.filter((b) => b.type === "text").map((b) => typeof b.text === "string" ? b.text : "").join("");
}
function formatRejected(r) {
  return r.outcome === "rejected" && r.status === 400 && /output_config|output_format|json_schema|schema|format|fallback|beta/i.test(r.error ?? "");
}
function planOf(ask, deps) {
  const d = {
    fetch: deps.fetch ?? globalThis.fetch,
    now: deps.now ?? Date.now,
    sleep: deps.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
  };
  const route = modelRoute(ask.purpose);
  return { route, first: ask.model ?? route.model, started: d.now(), d };
}
function tryModel(key, ask, p, model, stream) {
  const left = ask.deadlineMs === void 0 ? Infinity : ask.deadlineMs - (p.d.now() - p.started);
  const timeoutMs = Math.max(1, Math.min(ask.timeoutMs ?? p.route.timeoutMs, left));
  return providerFetch(
    "anthropic",
    ANTHROPIC_MESSAGES_URL,
    {
      method: "POST",
      headers: headersFor(key, ask.betas),
      body: JSON.stringify({ max_tokens: p.route.maxTokens, ...ask.body, model, ...stream ? { stream: true } : {} }),
      timeoutMs,
      tries: 1 + Math.max(0, ask.retries ?? p.route.retries),
      ...Number.isFinite(left) ? { deadlineMs: left } : {},
      breaker: "count",
      ...ask.signal ? { signal: ask.signal } : {},
      ...stream ? { stream: true } : {}
    },
    p.d
  );
}
function fallbackFor(ask, p, failed) {
  if (!(neverCame(failed) || modelUnknown(failed)) || ask.signal?.aborted) return null;
  const next = fallbackModel(ask.purpose, p.first);
  if (!next) return null;
  const left = ask.deadlineMs === void 0 ? Infinity : ask.deadlineMs - (p.d.now() - p.started);
  return left >= FALLBACK_FLOOR_MS ? next : null;
}
var failure = (a) => a.outcome === "refused" ? "rejected" : "unreachable";
async function askModel(key, ask, deps = {}) {
  const p = planOf(ask, deps);
  let model = p.first;
  let a = await tryModel(key, ask, p, model, false);
  let fellBack = false;
  const next = a.outcome === "ok" ? null : fallbackFor(ask, p, a);
  if (next) {
    model = next;
    fellBack = true;
    a = await tryModel(key, ask, p, model, false);
  }
  const base = { asked: p.first, fellBack, status: a.status };
  if (a.outcome !== "ok") {
    return {
      ...base,
      model,
      outcome: failure(a),
      error: errorOf(a),
      detail: a.text.slice(0, 300),
      usage: NO_USAGE
    };
  }
  const message = messageOf(a.json);
  return {
    ...base,
    model: message.model ?? model,
    outcome: "ok",
    message,
    usage: usageOf(message.usage),
    text: messageTextOf(message).trim()
  };
}
async function streamModel(key, ask, deps = {}) {
  const p = planOf(ask, deps);
  let model = p.first;
  let a = await tryModel(key, ask, p, model, true);
  let fellBack = false;
  const next = a.outcome === "ok" ? null : fallbackFor(ask, p, a);
  if (next) {
    model = next;
    fellBack = true;
    a = await tryModel(key, ask, p, model, true);
  }
  const base = { asked: p.first, model, fellBack, status: a.status };
  if (a.outcome === "ok" && a.body) return { ...base, outcome: "ok", body: a.body, headers: a.headers };
  return { ...base, outcome: failure(a), error: errorOf(a), detail: a.text.slice(0, 300) };
}

// src/models/typesafe.ts
import {
  SHADOW_TIMEOUT_MS,
  SYSTEM_ONE_MODEL,
  parseSystemOneResponse
} from "../../contracts/dist/index.js";
var SYSTEM_ONE_URL = "https://api.typesafe.ai/v1/systemone";
function scrubbed(text, key) {
  return (key ? text.split(key).join("[key]") : text).slice(0, 200);
}
function errorOf2(a, key) {
  const j = answerObject(a);
  const detail = j && typeof j.detail === "string" ? j.detail : null;
  const nested = j && j.error && typeof j.error === "object" ? j.error.message : null;
  const message = detail ?? (typeof nested === "string" ? nested : null) ?? (typeof j?.error === "string" ? j.error : null);
  return scrubbed(message ?? a.error ?? `status ${a.status}`, key);
}
function failureOf(a) {
  if (a.outcome === "refused") return "rejected";
  if (a.status === 429) return "throttled";
  return "unavailable";
}
async function askSystemOne(key, ask, deps = {}) {
  const request = { state: ask.state, model: SYSTEM_ONE_MODEL, questions: ask.questions };
  const a = await providerFetch(
    "typesafe",
    SYSTEM_ONE_URL,
    {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify(request),
      timeoutMs: ask.timeoutMs ?? SHADOW_TIMEOUT_MS,
      tries: 1,
      ...ask.signal ? { signal: ask.signal } : {}
    },
    deps
  );
  if (a.outcome !== "ok") return { outcome: failureOf(a), status: a.status, error: errorOf2(a, key) };
  const read = parseSystemOneResponse(a.json);
  if (!read.ok)
    return { outcome: "unavailable", status: a.status, error: scrubbed(`unreadable answer: ${read.error}`, key) };
  return {
    outcome: "ok",
    model: read.value.model,
    answers: read.value.answers,
    inputTokens: read.value.usage.input_tokens
  };
}

// src/whatsapp.ts
import {
  CONVERSATION_OPT_IN_PATTERN,
  MARKETING_OPT_IN_PATTERN,
  OPT_OUT_PATTERN,
  REFERRAL_ID_MAX
} from "../../contracts/dist/index.js";
var GRAPH = "https://graph.facebook.com/v25.0";
var UNSTORABLE_IN_ID = /[\p{Cc}\p{Cs}]/u;
var REFERRAL_KIND = /^[\p{L}\p{N}_-]{1,32}$/u;
function adReferralOf(r) {
  if (typeof r !== "object" || r === null) return null;
  const id = "source_id" in r && typeof r.source_id === "string" ? r.source_id.trim() : "";
  if (id.length < 1 || id.length > REFERRAL_ID_MAX || UNSTORABLE_IN_ID.test(id)) return null;
  const kind = "source_type" in r && typeof r.source_type === "string" ? r.source_type.trim() : "";
  return { sourceId: id, sourceType: REFERRAL_KIND.test(kind) ? kind : null };
}
function chosenReply(m) {
  if (m.button) {
    const label = m.button.text ?? m.button.payload ?? "";
    const id = m.button.payload ?? "";
    return label || id ? { label, id } : null;
  }
  const r = m.interactive?.button_reply ?? m.interactive?.list_reply;
  if (r) {
    const label = r.title ?? "";
    const id = r.id ?? "";
    return label || id ? { label, id } : null;
  }
  return null;
}
function mediaRefOf(src) {
  if (!src?.id) return null;
  return {
    provider_media_id: src.id,
    mime_type: src.mime_type ?? null,
    caption: src.caption ?? null,
    filename: src.filename ?? null,
    fetch_state: "pending"
  };
}
function normalizeInbound(m, value) {
  const list = value.contacts || [];
  const contact2 = list.find((c) => c.wa_id === m.from) ?? (list.length === 1 ? list[0] : void 0);
  const mediaSrc = m.image || m.audio || m.video || m.document || m.sticker || null;
  const chosen = chosenReply(m);
  const typed = m.type === "text" && !!m.text?.body;
  const isText = typed || !!chosen;
  const loc = m.location;
  const cards = m.contacts?.length ? m.contacts : null;
  const kind = isText ? "text" : m.type === "reaction" && m.reaction ? "reaction" : loc && (loc.latitude != null || loc.address || loc.name) ? "location" : cards ? "contacts" : m.type === "system" ? "system" : mediaSrc?.id ? "media" : "unsupported";
  const describeLocation = () => {
    const where = [loc?.name, loc?.address].filter(Boolean).join(", ");
    const coords = loc?.latitude != null && loc?.longitude != null ? `${loc.latitude}, ${loc.longitude}` : null;
    return `Shared a location${where ? `: ${where}` : ""}${coords ? ` (${coords})` : ""}`;
  };
  const describeCards = () => {
    const names = (cards ?? []).map((c) => c.name?.formatted_name || c.phones?.[0]?.phone).filter(Boolean);
    return `Shared a contact card${names.length ? `: ${names.join(", ")}` : ""}`;
  };
  const body = typed ? m.text.body : chosen ? chosen.label || chosen.id : kind === "reaction" ? m.reaction?.emoji ?? null : kind === "location" ? describeLocation() : kind === "contacts" ? describeCards() : kind === "system" ? m.system?.body ?? null : null;
  const consentText = [body, chosen?.id].filter((s) => !!s);
  const matches = (re) => consentText.some((s) => re.test(s));
  return {
    waId: contact2?.wa_id || m.from,
    phoneDigits: m.from,
    profileName: contact2?.profile?.name || null,
    messageId: m.id,
    // Reactions, locations, contact cards and system notices all carry words
    // rather than bytes, so they are stored as text — messages.type has no
    // column for them and needs none. `kind` is what routing consults.
    type: isText || body !== null && kind !== "media" ? "text" : "media",
    kind,
    rawType: m.type,
    body,
    channelTsIso: m.timestamp ? new Date(Number(m.timestamp) * 1e3).toISOString() : null,
    media: mediaRefOf(mediaSrc),
    optOut: isText && matches(OPT_OUT_PATTERN),
    // WHICH yes, and only that one. START, UNSTOP, RESUME and ALTA answer the
    // appointment question; YES OFFERS answers the offers question and nothing
    // else. It used to answer both -- "texting OFFERS is also a way back in from
    // a STOP" -- which is one opt-in enrolling a person in two programs: the
    // thing the carriers refuse a campaign for (30913), and the message flow had
    // to confess it in the field the refusal named. The way back in from a STOP
    // is START, as the carriers' own reply to a STOP says.
    optIn: isText && matches(CONVERSATION_OPT_IN_PATTERN),
    optInMarketing: isText && matches(MARKETING_OPT_IN_PATTERN),
    referral: adReferralOf(m.referral)
  };
}
var PRICING_WORD = /^[A-Za-z0-9_-]{1,40}$/;
function waPricingOf(raw) {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw;
  const out = {};
  if (typeof r.billable === "boolean") out.billable = r.billable;
  for (const key of ["pricing_model", "category", "type"]) {
    const word = r[key];
    if (typeof word === "string" && PRICING_WORD.test(word)) out[key] = word;
  }
  return out.category ? out : null;
}
var WA_STOPPED_MARKETING = 131050;
function waStoppedMarketing(errors) {
  if (!Array.isArray(errors)) return false;
  return errors.some(
    (e) => e !== null && typeof e === "object" && Number(e.code) === WA_STOPPED_MARKETING
  );
}
var SEND_TIMEOUT_MS = 15e3;
async function postGraph(cfg, payload) {
  const a = await providerFetch("meta", `${GRAPH}/${cfg.phoneId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    timeoutMs: SEND_TIMEOUT_MS,
    // A reply is always put on the wire: another call's timeouts never fail it (provider-fetch's breaker).
    breaker: "count"
  });
  if (a.status === 0)
    return { ok: false, wamid: null, status: 0, errorBody: a.error ?? "no answer", outcome: a.outcome };
  const out = answerObject(a) ?? {};
  const ok2 = a.outcome === "ok";
  const sent = {
    ok: ok2,
    wamid: out.messages?.[0]?.id ?? null,
    status: a.status,
    errorBody: ok2 ? void 0 : JSON.stringify(out).slice(0, 200),
    // Read before the body is cut: Graph writes its message first, and a long one pushes the code past 200 characters.
    code: !ok2 && typeof out.error?.code === "number" ? out.error.code : null
  };
  return { ...sent, outcome: graphThrottled(sent) ? "retryable" : a.outcome };
}
var GRAPH_THROTTLE_CODES = [4, 80007, 130429, 131048, 131056];
function graphThrottled(r) {
  if (r.ok) return false;
  return r.status === 429 || typeof r.code === "number" && GRAPH_THROTTLE_CODES.includes(r.code);
}
async function sendText(cfg, to, body) {
  return postGraph(cfg, { messaging_product: "whatsapp", to, type: "text", text: { body } });
}
async function sendTemplate(cfg, to, template) {
  return postGraph(cfg, {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: template.name,
      language: { code: template.language },
      components: template.params.length ? [{ type: "body", parameters: template.params.map((t) => ({ type: "text", text: t })) }] : []
    }
  });
}
var MEDIA_META_TIMEOUT_MS = 8e3;
var MEDIA_BYTES_TIMEOUT_MS = 15e3;
var MEDIA_MAX_BYTES = 25 * 1024 * 1024;
async function fetchMediaBytes(cfg, providerMediaId) {
  try {
    const metaRes = await providerFetch("meta", `${GRAPH}/${providerMediaId}`, {
      headers: { Authorization: `Bearer ${cfg.accessToken}` },
      timeoutMs: MEDIA_META_TIMEOUT_MS,
      idempotent: true,
      tries: 2
    });
    if (metaRes.status === 0) logger().error("media_fetch_failed", { media_id: providerMediaId, error: metaRes.error });
    if (metaRes.outcome !== "ok") return null;
    const meta = answerObject(metaRes) ?? {};
    if (!meta.url) return null;
    const binRes = await fetch(meta.url, {
      headers: { Authorization: `Bearer ${cfg.accessToken}` },
      signal: AbortSignal.timeout(MEDIA_BYTES_TIMEOUT_MS)
    });
    if (!binRes.ok) return null;
    const declared = Number(binRes.headers.get("content-length") ?? "0");
    if (declared > MEDIA_MAX_BYTES) {
      logger().error("media_too_large", { media_id: providerMediaId, bytes: declared });
      return null;
    }
    const bytes = await binRes.arrayBuffer();
    if (bytes.byteLength > MEDIA_MAX_BYTES) {
      logger().error("media_too_large_after_read", { media_id: providerMediaId, bytes: bytes.byteLength });
      return null;
    }
    return { bytes, mime: meta.mime_type ?? binRes.headers.get("content-type") };
  } catch (e) {
    logger().error("media_fetch_failed", { media_id: providerMediaId, error: errField(e) });
    return null;
  }
}

// src/voice/voice-retell.ts
import crypto2 from "crypto";
import { callOutcomeWords, isE164 } from "../../contracts/dist/index.js";
var API = "https://api.retellai.com";
function plainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v) ? v : null;
}
function toStatus(s) {
  switch (s) {
    case "registered":
      return "registered";
    case "ongoing":
      return "ongoing";
    case "error":
      return "error";
    case "not_connected":
      return "not_connected";
    default:
      return "ended";
  }
}
function liveTurns(items) {
  if (!items?.length) return null;
  const spoken = items.filter((t) => t.role === "agent" || t.role === "user" || t.role === "injected");
  if (!spoken.length) return null;
  return spoken.map(({ role, content, words }) => ({ role, content: content ?? "", ...words ? { words } : {} }));
}
function parseTranscriptText(text) {
  if (!text) return null;
  const turns = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const m = /^(Agent|User):\s*(.*)$/.exec(line);
    if (!m) {
      const last = turns.at(-1);
      if (last) last.content += ` ${line}`;
      continue;
    }
    turns.push({ role: m[1] === "Agent" ? "agent" : "user", content: m[2] ?? "" });
  }
  return turns.length ? turns : null;
}
function normalizeCall(c) {
  const analysis = c.call_analysis ?? {};
  const from = c.from_number ?? null;
  const computedDuration = c.duration_ms ?? (c.start_timestamp && c.end_timestamp ? c.end_timestamp - c.start_timestamp : null);
  return {
    retellCallId: c.call_id,
    agentId: c.agent_id ?? null,
    direction: c.direction === "outbound" ? "outbound" : "inbound",
    callType: c.call_type ?? null,
    fromE164: isE164(from) ? from : null,
    fromRaw: from,
    toE164: isE164(c.to_number) ? c.to_number : null,
    status: toStatus(c.call_status),
    startedAtIso: c.start_timestamp ? new Date(c.start_timestamp).toISOString() : null,
    endedAtIso: c.end_timestamp ? new Date(c.end_timestamp).toISOString() : null,
    durationMs: computedDuration ?? null,
    disconnectionReason: c.disconnection_reason ?? null,
    sentiment: analysis.user_sentiment ?? null,
    callSuccessful: analysis.call_successful ?? null,
    inVoicemail: analysis.in_voicemail ?? null,
    summary: analysis.call_summary ?? null,
    transcript: c.transcript ?? null,
    transcriptObject: c.transcript_object ?? liveTurns(c.transcript_with_tool_calls),
    recordingUrl: c.recording_url ?? null,
    publicLogUrl: c.public_log_url ?? null,
    cost: c.call_cost ?? null,
    latency: c.latency ?? null,
    analysis: plainObject(analysis.custom_analysis_data)
  };
}
function callSummaryLine(n) {
  const mins = n.durationMs ? Math.max(1, Math.round(n.durationMs / 6e4)) : null;
  const head = n.direction === "inbound" ? "Inbound call" : "Outbound call";
  const dur = mins ? ` \xB7 ${mins} min` : "";
  const wanted = typeof n.analysis?.caller_wanted === "string" ? n.analysis.caller_wanted.trim() : "";
  const outcome = wanted ? callOutcomeWords(n.analysis?.outcome) : null;
  const body = wanted || n.summary?.trim() || (n.inVoicemail ? "Reached voicemail." : "No summary available.");
  return `${head}${dur} \u2014 ${body}${outcome ? ` (${outcome.toLowerCase()})` : ""}`;
}
var RETELL_CALL_TIMEOUT_MS = 8e3;
function retell(cfg, method, path, o = {}) {
  const read = method === "GET" || path === "/v3/list-calls";
  return providerFetch("retell", `${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      ...o.body !== void 0 ? { "Content-Type": "application/json" } : {}
    },
    ...o.body !== void 0 ? { body: JSON.stringify(o.body) } : {},
    timeoutMs: o.timeoutMs ?? RETELL_CALL_TIMEOUT_MS,
    ...read ? { idempotent: true, tries: 2 } : {}
  });
}
function answered(a, what) {
  if (a.status === 0) throw new Error(a.error ?? `retell ${what}: no answer`);
  return a;
}
async function listCalls(cfg, opts) {
  const limit = Math.min(opts.limit ?? 100, 1e3);
  const body = {
    limit,
    sort_order: opts.ascending ? "ascending" : "descending",
    filter_criteria: { agent: [{ agent_id: opts.agentId }] },
    // documented nested shape
    ...opts.paginationKey ? { pagination_key: opts.paginationKey } : {},
    ...opts.includeTotal ? { include_total: true } : {}
  };
  const r = answered(
    await retell(cfg, "POST", "/v3/list-calls", { body, timeoutMs: RETELL_READ_TIMEOUT_MS }),
    "list-calls"
  );
  if (r.outcome !== "ok") throw new Error(`list-calls ${r.status}: ${r.text.slice(0, 200)}`);
  const out = answerObject(r) ?? {};
  const calls = out.items ?? [];
  return {
    calls,
    nextKey: out.has_more ? out.pagination_key ?? null : null,
    total: typeof out.total === "number" ? out.total : null
  };
}
var RETELL_READ_TIMEOUT_MS = 1e4;
function retryAfterMs(header) {
  if (!header) return null;
  const h = header.trim();
  const ms = /^\d+$/.test(h) ? Number(h) * 1e3 : Date.parse(h) - Date.now();
  return Number.isFinite(ms) && ms > 0 ? ms : null;
}
function isCallBody(v) {
  const o = plainObject(v);
  return o !== null && typeof o.call_id === "string";
}
async function getCall(cfg, callId, opts = {}) {
  const r = await providerFetch("retell", `${API}/v2/get-call/${callId}`, {
    headers: { Authorization: `Bearer ${cfg.apiKey}` },
    timeoutMs: opts.timeoutMs ?? RETELL_READ_TIMEOUT_MS
  });
  if (r.status === 0) return { kind: "unavailable", status: null, retryAfterMs: null };
  if (r.outcome === "ok")
    return isCallBody(r.json) ? { kind: "found", call: r.json } : { kind: "unavailable", status: r.status, retryAfterMs: null };
  if (r.status === 401 || r.status === 403) return { kind: "auth", status: r.status };
  if (r.status === 408 || r.status === 425 || r.status === 429 || r.status >= 500)
    return { kind: "unavailable", status: r.status, retryAfterMs: retryAfterMs(r.headers?.get("retry-after") ?? null) };
  return { kind: "not_found", status: r.status };
}
async function getAgent(cfg, agentId) {
  const r = answered(await retell(cfg, "GET", `/get-agent/${agentId}`), "get-agent");
  const a = answerObject(r);
  if (r.outcome !== "ok" || !a) return null;
  const str2 = (k) => typeof a[k] === "string" ? a[k] : null;
  const num = (k) => typeof a[k] === "number" ? a[k] : null;
  const bool = (k) => typeof a[k] === "boolean" ? a[k] : null;
  const engine = a.response_engine ?? {};
  return {
    agent_id: str2("agent_id") ?? agentId,
    agent_name: str2("agent_name"),
    version: num("version"),
    is_published: bool("is_published"),
    llm_id: engine.type === "retell-llm" && typeof engine.llm_id === "string" ? engine.llm_id : null,
    llm_version: typeof engine.version === "number" ? engine.version : null,
    // The URL only, never its query string: Retell lets a secret ride there
    // (?key=...) and this object is meant to be printed by a diagnostic. That
    // a key rides there at all is kept as a fact, so the planner can retire it.
    webhook_url: str2("webhook_url")?.split("?")[0] ?? null,
    webhook_url_keyed: /[?&]key=/.test(str2("webhook_url") ?? ""),
    webhook_events: Array.isArray(a.webhook_events) ? a.webhook_events.map(String) : null,
    webhook_timeout_ms: num("webhook_timeout_ms"),
    data_storage_setting: str2("data_storage_setting"),
    data_storage_retention_days: num("data_storage_retention_days"),
    opt_in_signed_url: bool("opt_in_signed_url"),
    post_call_analysis_data: Array.isArray(a.post_call_analysis_data) ? a.post_call_analysis_data : null
  };
}
async function getAgentRaw(cfg, agentId) {
  const r = answered(await retell(cfg, "GET", `/get-agent/${agentId}`), "get-agent");
  return r.outcome === "ok" ? answerObject(r) : null;
}
async function writeRetell(cfg, method, path, payload) {
  const r = answered(await retell(cfg, method, path, { body: payload }), path);
  const body = answerObject(r) ?? (r.json === null && r.text ? { text: r.text.slice(0, 300) } : null);
  return { ok: r.outcome === "ok", status: r.status, body };
}
function createAgentVersion(cfg, agentId, baseVersion) {
  return writeRetell(cfg, "POST", `/create-agent-version/${agentId}`, { base_version: baseVersion });
}
function updateAgent(cfg, agentId, patch) {
  return writeRetell(cfg, "PATCH", `/update-agent/${agentId}`, patch);
}
function publishAgentVersion(cfg, agentId, version, title) {
  return writeRetell(cfg, "POST", `/publish-agent-version/${agentId}`, { version, version_title: title });
}
function createRetellLlm(cfg, body) {
  return writeRetell(cfg, "POST", "/create-retell-llm", body);
}
function createAgent(cfg, body) {
  return writeRetell(cfg, "POST", "/create-agent", body);
}
function createPhoneNumber(cfg, body) {
  return writeRetell(cfg, "POST", "/create-phone-number", body);
}
function importPhoneNumber(cfg, body) {
  return writeRetell(cfg, "POST", "/import-phone-number", body);
}
async function deletePhoneNumber(cfg, number) {
  const r = answered(
    await retell(cfg, "DELETE", `/delete-phone-number/${encodeURIComponent(number)}`),
    "delete-phone-number"
  );
  return { ok: r.outcome === "ok" || r.status === 404, status: r.status };
}
function updatePhoneNumber(cfg, number, patch) {
  return writeRetell(cfg, "PATCH", `/update-phone-number/${encodeURIComponent(number)}`, patch);
}
async function getPhoneNumber(cfg, number) {
  const r = answered(await retell(cfg, "GET", `/get-phone-number/${encodeURIComponent(number)}`), "get-phone-number");
  return r.outcome === "ok" ? answerObject(r) : null;
}
async function updateLiveCall(cfg, callId, control) {
  const r = answered(
    await retell(cfg, "PATCH", `/v2/update-live-call/${encodeURIComponent(callId)}`, {
      body: {
        ...control.variables ? { fields_to_override: { override_dynamic_variables: control.variables } } : {},
        call_control: {
          additional_context: control.additionalContext,
          ...control.triggerResponse !== void 0 ? { trigger_response: control.triggerResponse } : {}
        }
      }
    }),
    "update-live-call"
  );
  return { ok: r.outcome === "ok", status: r.status };
}
async function stopCall(cfg, callId) {
  const r = answered(await retell(cfg, "POST", `/v2/stop-call/${encodeURIComponent(callId)}`), "stop-call");
  return { ok: r.outcome === "ok", status: r.status };
}
async function getRetellLlm(cfg, llmId, version) {
  const q = version === void 0 || version === null ? "" : `?version=${version}`;
  const r = answered(await retell(cfg, "GET", `/get-retell-llm/${llmId}${q}`), "get-retell-llm");
  const l = answerObject(r);
  if (r.outcome !== "ok" || !l) return null;
  const str2 = (k) => typeof l[k] === "string" ? l[k] : null;
  return {
    llm_id: str2("llm_id") ?? llmId,
    version: typeof l.version === "number" ? l.version : null,
    model: str2("model"),
    model_temperature: typeof l.model_temperature === "number" ? l.model_temperature : null,
    general_prompt: str2("general_prompt"),
    begin_message: str2("begin_message"),
    default_dynamic_variables: l.default_dynamic_variables && typeof l.default_dynamic_variables === "object" ? l.default_dynamic_variables : null,
    general_tools: Array.isArray(l.general_tools) ? l.general_tools : null,
    knowledge_base_ids: Array.isArray(l.knowledge_base_ids) ? l.knowledge_base_ids.map(String) : null
  };
}
var RECORDING_TIMEOUT_MS = 2e4;
async function fetchRecording(url, opts = {}) {
  const r = await fetch(url, { signal: AbortSignal.timeout(opts.timeoutMs ?? RECORDING_TIMEOUT_MS) });
  if (!r.ok) return { ok: false, status: r.status };
  return { ok: true, bytes: await r.arrayBuffer(), mime: r.headers.get("content-type") };
}
function verifyRetellSignature(rawBody, header, apiKey) {
  if (!header || !apiKey) return false;
  const m = /v=(\d+),d=([0-9a-f]+)/i.exec(String(header));
  if (!m) return false;
  const [, ts = "", digest = ""] = m;
  if (Math.abs(Date.now() - Number(ts)) > 5 * 60 * 1e3) return false;
  const expected = crypto2.createHmac("sha256", apiKey).update(rawBody + ts).digest("hex");
  const a = Buffer.from(digest.toLowerCase());
  const b = Buffer.from(expected);
  return a.length === b.length && crypto2.timingSafeEqual(a, b);
}

// src/voice/voice-shell.ts
import {
  BRAIN_INTENTS,
  BRAIN_LANGUAGES,
  CALL_OUTCOMES,
  greetingFor,
  GREETING_DEFAULT,
  POLICY_COVERS
} from "../../contracts/dist/index.js";
var VOICE_SHELL_PROMPT = "{{business_facts}}\n\nWho you are speaking with:\n{{caller_context}}";
var VOICE_SHELL_BEGIN = "{{greeting}}";
var HANDOFF_VAR = "{{handoff_number}}";
var FACTS_UNAVAILABLE = "The business's details could not be loaded for this call. Do not state opening hours, prices, services or an address from memory \u2014 you do not have them. Say you will have someone confirm, offer to take a message, and offer to send the booking link to the caller's WhatsApp.";
var CALLER_UNKNOWN = "New caller - no prior interactions on record.";
function availabilityUrl(fnUrl) {
  return /\/api\/retell-fn$/.test(fnUrl) ? fnUrl.replace(/\/api\/retell-fn$/, "/api/retell-availability") : `${fnUrl}-availability`;
}
function voiceShellTools(fnUrl, bookingHeaders) {
  return [
    {
      type: "end_call",
      name: "end_call",
      description: "End the call once the conversation is complete and the caller has said goodbye."
    },
    {
      type: "transfer_call",
      name: "transfer_to_staff",
      description: "Transfer the caller to a person on the business's own line. Use during opening hours when the caller asks for a person, has a complaint, or needs something the facts do not cover.",
      // A dynamic variable, filled per call from the workspace's profile. An
      // E.164 number typed here would be a fact kept in a second place.
      transfer_destination: { type: "predefined", number: HANDOFF_VAR },
      transfer_option: {
        type: "warm_transfer",
        show_transferee_as_caller: true,
        on_hold_music: "relaxing_sound"
      }
    },
    {
      type: "custom",
      name: "send_booking_link",
      description: "Text the booking link to the caller's WhatsApp. Use when the caller wants to book. It goes to the number they are calling from unless another number is given.",
      url: fnUrl,
      method: "POST",
      speak_during_execution: true,
      execution_message_description: "Say you are sending the booking link to their WhatsApp now.",
      speak_after_execution: true,
      ...bookingHeaders ? { headers: bookingHeaders } : {},
      // No `required` list: the provider drops an empty one on save, and the
      // plan would then see a difference that is not there.
      parameters: {
        type: "object",
        properties: {
          phone_number: {
            type: "string",
            description: "Alternate number to send the link to, digits only with country code. Omit to use the caller's number."
          }
        }
      }
    },
    {
      type: "custom",
      name: "check_availability",
      description: "Check which appointment times are open right now. Use when the caller asks when they could come in, or before offering a time. Returns the open windows; offer up to three that fit, then send the booking link. Never confirm a slot yourself.",
      url: availabilityUrl(fnUrl),
      method: "POST",
      speak_during_execution: true,
      execution_message_description: "Say you are checking the calendar.",
      speak_after_execution: true,
      ...bookingHeaders ? { headers: bookingHeaders } : {},
      parameters: {
        type: "object",
        properties: {
          day: {
            type: "string",
            description: "A day the caller asked about, as YYYY-MM-DD or a weekday name. Omit for the next few days."
          },
          service: {
            type: "string",
            description: "The service they want, so only windows long enough for it are offered. Omit if unknown."
          }
        }
      }
    }
  ];
}
function desiredVoiceShell(fnUrl, bookingHeaders) {
  return {
    general_prompt: VOICE_SHELL_PROMPT,
    begin_message: VOICE_SHELL_BEGIN,
    default_dynamic_variables: {
      business_facts: FACTS_UNAVAILABLE,
      caller_context: CALLER_UNKNOWN,
      greeting: GREETING_DEFAULT,
      // Empty on purpose: with no line to reach, the transfer tool has
      // nowhere to dial and the composed facts tell the agent to take a
      // message instead of transferring.
      handoff_number: ""
    },
    general_tools: voiceShellTools(fnUrl, bookingHeaders)
  };
}
var normalizedText = (s) => (s ?? "").replace(/\r\n/g, "\n").trim();
function stableJson(v) {
  if (Array.isArray(v)) return `[${v.map(stableJson).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v;
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${stableJson(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(v);
}
function subsetEqual(live, desired) {
  if (Array.isArray(desired)) return stableJson(live) === stableJson(desired);
  if (desired && typeof desired === "object") {
    if (!live || typeof live !== "object" || Array.isArray(live)) return false;
    return Object.entries(desired).every(
      ([k, v]) => subsetEqual(live[k], v)
    );
  }
  return stableJson(live) === stableJson(desired);
}
function planVoiceConvergence(live, desired) {
  const drift = [];
  const patch = {};
  if (normalizedText(live.general_prompt) !== normalizedText(desired.general_prompt)) {
    const has = (v) => normalizedText(live.general_prompt).includes(v);
    drift.push(
      `general_prompt differs (${normalizedText(live.general_prompt).length} chars live; reads {{business_facts}}: ${has("{{business_facts}}")}, {{caller_context}}: ${has("{{caller_context}}")})`
    );
    patch.general_prompt = desired.general_prompt;
  }
  if (normalizedText(live.begin_message) !== normalizedText(desired.begin_message)) {
    drift.push(
      `begin_message is typed in (${JSON.stringify(normalizedText(live.begin_message).slice(0, 60))}\u2026), not ${desired.begin_message}`
    );
    patch.begin_message = desired.begin_message;
  }
  const liveDefaults = live.default_dynamic_variables ?? {};
  const missingDefaults = Object.keys(desired.default_dynamic_variables).filter(
    (k) => liveDefaults[k] !== desired.default_dynamic_variables[k]
  );
  if (missingDefaults.length) {
    drift.push(`default_dynamic_variables missing or different: ${missingDefaults.join(", ")}`);
    patch.default_dynamic_variables = { ...liveDefaults, ...desired.default_dynamic_variables };
  }
  const liveTools = live.general_tools ?? [];
  const byName = new Map(liveTools.map((t) => [t.name, t]));
  let toolsDiffer = false;
  for (const want of desired.general_tools) {
    const have = byName.get(want.name);
    if (!have) {
      drift.push(`tool ${want.name} is missing`);
      toolsDiffer = true;
      continue;
    }
    if (!subsetEqual(have, want)) {
      const what = want.name === "transfer_to_staff" ? ` (live destination: ${JSON.stringify(have.transfer_destination?.number ?? "?")}, option: ${JSON.stringify(have.transfer_option?.type ?? "?")})` : "";
      drift.push(`tool ${want.name} differs${what}`);
      toolsDiffer = true;
    }
  }
  const unknownTools = liveTools.map((t) => t.name).filter((n) => !desired.general_tools.some((t) => t.name === n));
  if (unknownTools.length)
    drift.push(`live tools the shell does not define (an apply would drop them): ${unknownTools.join(", ")}`);
  if (toolsDiffer) patch.general_tools = desired.general_tools;
  return { drift, llmPatch: Object.keys(patch).length ? patch : null, unknownTools };
}
function voiceShellDrift(live, fnUrl) {
  const booking = (live.general_tools ?? []).find((t) => t.name === "send_booking_link");
  const url = typeof booking?.url === "string" ? booking.url : fnUrl;
  const headers2 = booking?.headers ?? null;
  const plan = planVoiceConvergence(live, desiredVoiceShell(url, headers2));
  const drift = [...plan.drift];
  if (booking && !headers2) drift.push("send_booking_link has no x-fn-secret header \u2014 the edge will refuse it");
  return { converged: drift.length === 0, drift };
}
var VOICE_WEBHOOK_EVENTS = ["call_started", "call_ended", "call_analyzed", "transcript_updated"];
var VOICE_WEBHOOK_TIMEOUT_MS = 2e4;
var RETELL_DEFAULT_EVENTS = ["call_started", "call_ended", "call_analyzed"];
var CALL_ANALYSIS_FIELDS = [
  {
    type: "string",
    name: "caller_wanted",
    description: "What the caller wanted, in one short sentence in plain words, the way the business owner would say it. Start with the request itself, never with 'The user' or 'The caller'. Leave empty if they asked for nothing.",
    examples: [
      "Asked whether Saturday at 10 is free.",
      "Wanted Tuesday's hours and a price.",
      "Moved Friday's appointment to next week."
    ]
  },
  {
    type: "enum",
    name: "outcome",
    description: "How the call ended for the caller. answered: their question was answered. booking_link_sent: the receptionist sent them the booking link. callback_needed: a person at the business has to call them back or follow up. voicemail: the call reached voicemail. no_request: they hung up, tested the line or asked for nothing. other: none of these.",
    choices: [...CALL_OUTCOMES]
  },
  {
    type: "string",
    name: "follow_up",
    description: "What a person at the business should do next for this caller, in one short sentence. Leave empty when nothing is needed.",
    examples: ["Call back to confirm a Saturday 10:00 gel manicure.", "Text the price list for highlights."]
  },
  {
    type: "string",
    name: "caller_name",
    description: "The caller's name exactly as they gave it. Leave empty if they did not say one.",
    examples: ["Ana", "Daniela R."]
  },
  {
    type: "string",
    name: "caller_email",
    description: "The email address the caller gave, exactly as they spelled it out. Leave empty if they did not give one.",
    examples: ["ana.ruiz@example.com", "daniela.r@example.net"]
  },
  {
    type: "enum",
    name: "topic",
    // The classes a rule covers are said in the words the receptionist's prompt and its texts' intent say them
    // (POLICY_COVERS), so a call and a text read one meaning; only what no rule covers is said here.
    description: `What the call was mainly about. booking: ${POLICY_COVERS.booking}. pricing: ${POLICY_COVERS.faq}, when it is about what something costs. services: ${POLICY_COVERS.faq}, when it is about what the business offers. money: ${POLICY_COVERS.money}. hours: when the business is open. location: where it is or how to get there. complaint: they were unhappy about something. smalltalk: a greeting or a chat with no request. other: none of these.`,
    choices: [...BRAIN_INTENTS]
  },
  {
    type: "enum",
    name: "language",
    description: "The language the caller mostly spoke. en: English. es: Spanish. other: any other language.",
    choices: [...BRAIN_LANGUAGES]
  }
];
function sameAnalysisField(live, want) {
  const w = want;
  return live.name === w.name && live.type === w.type && live.description === w.description && JSON.stringify(live.choices ?? null) === JSON.stringify(w.choices ?? null) && JSON.stringify(live.examples ?? null) === JSON.stringify(w.examples ?? null);
}
function planAgentSettings(live, opts = {}) {
  const drift = [];
  const patch = {};
  const events = live.webhook_events ?? RETELL_DEFAULT_EVENTS;
  const missing = VOICE_WEBHOOK_EVENTS.filter((e) => !events.includes(e));
  if (missing.length) {
    drift.push(`webhook_events missing ${missing.join(", ")} (the live transcript needs transcript_updated)`);
    patch.webhook_events = [.../* @__PURE__ */ new Set([...events, ...VOICE_WEBHOOK_EVENTS])];
  }
  const timeout = live.webhook_timeout_ms ?? 1e4;
  if (timeout < VOICE_WEBHOOK_TIMEOUT_MS) {
    drift.push(`webhook_timeout_ms is ${timeout}; the recording copy needs ${VOICE_WEBHOOK_TIMEOUT_MS}`);
    patch.webhook_timeout_ms = VOICE_WEBHOOK_TIMEOUT_MS;
  }
  if (live.opt_in_signed_url !== true) {
    drift.push(
      "recording URLs are public and permanent (opt_in_signed_url off); the pipeline copies audio within seconds and refetches a fresh link when it must"
    );
    patch.opt_in_signed_url = true;
  }
  const liveFields = Array.isArray(live.post_call_analysis_data) ? live.post_call_analysis_data.filter((f) => f !== null && typeof f === "object") : [];
  const missingFields = CALL_ANALYSIS_FIELDS.filter((f) => !liveFields.some((l) => sameAnalysisField(l, f)));
  if (missingFields.length) {
    drift.push(
      `post_call_analysis_data lacks ${missingFields.map((f) => f.name).join(", ")} (the strip, the profile, the call card and Reports read what the call was about)`
    );
    patch.post_call_analysis_data = [
      ...liveFields.filter((l) => !CALL_ANALYSIS_FIELDS.some((f) => f.name === l.name)),
      ...CALL_ANALYSIS_FIELDS.map((f) => ({ ...f }))
    ];
  }
  if (typeof live.webhook_url === "string" && live.webhook_url !== "" && (live.webhook_url_keyed === true || /[?&]key=/.test(live.webhook_url))) {
    drift.push(
      "webhook_url still carries the retired query-string key; the signature is the credential and the door no longer reads one"
    );
    patch.webhook_url = live.webhook_url.split("?")[0];
  }
  if (opts.retentionDays !== void 0 && live.data_storage_retention_days !== opts.retentionDays) {
    if (!Number.isInteger(opts.retentionDays) || opts.retentionDays < 1 || opts.retentionDays > 730) {
      drift.push(`retention must be a whole number of days from 1 to 730, not ${opts.retentionDays}`);
    } else {
      drift.push(
        `data_storage_retention_days is ${live.data_storage_retention_days ?? "unset (kept forever)"}; asked for ${opts.retentionDays}`
      );
      patch.data_storage_retention_days = opts.retentionDays;
    }
  }
  return { drift, agentPatch: Object.keys(patch).length ? patch : null };
}
function agentSettingsDrift(live) {
  const plan = planAgentSettings(live);
  return { converged: plan.drift.length === 0, drift: plan.drift };
}

// src/voice/voice-provision.ts
import { E164, HOUR_MS, RETELL_MODELS } from "../../contracts/dist/index.js";
var VOICE_LLM_DEFAULTS = {
  model: RETELL_MODELS.llm,
  model_temperature: 0,
  start_speaker: "agent"
};
var VOICE_AGENT_DEFAULTS = {
  voice_id: "minimax-Tamsin",
  language: ["en-US", "es-ES", "fr-FR", "de-DE", "hi-IN", "ru-RU", "pt-PT", "ja-JP", "it-IT", "nl-NL"],
  end_call_after_silence_ms: 3e4,
  max_call_duration_ms: HOUR_MS,
  data_storage_setting: "everything",
  data_storage_retention_days: 90,
  post_call_analysis_model: RETELL_MODELS.analysis,
  allow_user_dtmf: true
};
var VOICE_NUMBER_DEFAULTS = {
  country_code: "US",
  number_provider: "twilio"
};
function voiceEndpoints(fnUrl) {
  const base = fnUrl.replace(/\/api\/retell-fn$/, "");
  return {
    fn: fnUrl,
    availability: availabilityUrl(fnUrl),
    webhook: `${base}/api/retell-webhook`,
    inbound: `${base}/api/retell-inbound`
  };
}
function withKey(url, secret) {
  return `${url}?key=${encodeURIComponent(secret)}`;
}
function stripKey(url) {
  return typeof url === "string" ? url.split("?")[0] ?? url : null;
}
function voiceLlmCreateBody(s, fnUrl) {
  return { ...VOICE_LLM_DEFAULTS, ...desiredVoiceShell(fnUrl, { "x-fn-secret": s.fnSecret }) };
}
function voiceAgentCreateBody(o, s, fnUrl) {
  return {
    agent_name: o.agentName,
    response_engine: {
      type: "retell-llm",
      llm_id: o.llmId,
      ...o.llmVersion === null ? {} : { version: o.llmVersion }
    },
    ...VOICE_AGENT_DEFAULTS,
    language: [...VOICE_AGENT_DEFAULTS.language],
    webhook_url: voiceEndpoints(fnUrl).webhook,
    webhook_events: [...VOICE_WEBHOOK_EVENTS],
    webhook_timeout_ms: VOICE_WEBHOOK_TIMEOUT_MS,
    opt_in_signed_url: true,
    post_call_analysis_data: CALL_ANALYSIS_FIELDS.map((f) => ({ ...f }))
  };
}
function voiceNumberBinding(o) {
  return [{ agent_id: o.agentId, ...o.pinned ? { agent_version: "latest_published" } : {}, weight: 1 }];
}
function voiceNumberCreateBody(o, s, fnUrl) {
  return {
    ...VOICE_NUMBER_DEFAULTS,
    area_code: o.areaCode,
    nickname: o.nickname,
    inbound_agents: voiceNumberBinding(o),
    inbound_webhook_url: withKey(voiceEndpoints(fnUrl).inbound, s.fnSecret)
  };
}
function voiceNumberBindBody(o, s, fnUrl) {
  return {
    nickname: o.nickname,
    inbound_agents: voiceNumberBinding(o),
    inbound_webhook_url: withKey(voiceEndpoints(fnUrl).inbound, s.fnSecret)
  };
}
function planVoiceProvision(st) {
  const errors = [];
  const r = st.request;
  const number = r.number ?? null;
  const area = r.areaCode ?? null;
  if (number !== null && !E164.test(number)) errors.push("number must be E.164, like +13055550100");
  if (area !== null && !(Number.isInteger(area) && area >= 200 && area <= 999))
    errors.push("area_code must be three digits, like 305");
  if (number !== null && area !== null) errors.push("give a number to bind or an area code to buy in, not both");
  if (r.llmId && !/^llm_[a-z0-9]+$/i.test(r.llmId)) errors.push("llm_id does not look like a Retell LLM id");
  if (r.agentId && !/^agent_[a-z0-9]+$/i.test(r.agentId)) errors.push("agent_id does not look like a Retell agent id");
  const names = { agent: `${st.tenant.name} front desk`, nickname: `${st.tenant.name} \xB7 Chanlytics` };
  if (errors.length) return { ok: false, errors, nothing: true, reason: null, steps: [], names };
  if (st.channel) {
    const on = st.channel.status === "active";
    return {
      ok: true,
      errors,
      nothing: true,
      reason: on ? `already answering on ${st.channel.number ?? "its number"} (agent ${st.channel.agentId}); voice-converge keeps it on the shell` : `a voice line exists but is ${st.channel.status} (agent ${st.channel.agentId}); switch it on in Connections rather than provisioning another`,
      steps: [],
      names
    };
  }
  const steps = [];
  if (r.agentId) {
    steps.push({ id: "llm", action: "skip", detail: "the adopted agent brings its own LLM" });
    steps.push({ id: "agent", action: "adopt", detail: `${r.agentId}, read from the provider first` });
  } else {
    steps.push(
      r.llmId ? { id: "llm", action: "reuse", detail: `${r.llmId}, read from the provider first` } : {
        id: "llm",
        action: "create",
        detail: `the shell: placeholders, the four tools, spoken defaults; ${VOICE_LLM_DEFAULTS.model} at temperature ${VOICE_LLM_DEFAULTS.model_temperature}`
      }
    );
    steps.push({
      id: "agent",
      action: "create",
      detail: `"${names.agent}": the product's voice, the webhook with its events, the analysis fields, ${VOICE_AGENT_DEFAULTS.data_storage_retention_days}-day retention`
    });
  }
  steps.push({
    id: "publish",
    action: "publish",
    detail: "the first version, so the number can pin to latest_published"
  });
  if (number)
    steps.push({
      id: "number",
      action: "bind",
      detail: `${number} \u2192 the agent, pinned to latest_published, inbound webhook set`
    });
  else if (area !== null)
    steps.push({
      id: "number",
      action: "buy",
      detail: `a local number in area code ${area} from Retell (Twilio), bound and pinned, inbound webhook set`
    });
  else
    steps.push({
      id: "number",
      action: "skip",
      detail: "no number asked for \u2014 give number (an existing Retell number) or area_code (buy one); the row is not written until a number answers"
    });
  if (number || area !== null) {
    steps.push({
      id: "channel",
      action: "insert",
      detail: "tenant_channels: kind voice, the agent as external_id, the number, active"
    });
    steps.push({
      id: "notify",
      action: "notify",
      detail: "the workspace's bell says the line is ready; a voice.provisioned event"
    });
  }
  return { ok: true, errors, nothing: false, reason: null, steps, names };
}

// src/voice/elevenlabs.ts
var ELEVENLABS_API = "https://api.elevenlabs.io";
var ELEVENLABS_TIMEOUT_MS = 1e4;
var ELEVENLABS_SPEECH_TIMEOUT_MS = 25e3;
var ELEVENLABS_WEBHOOK_TOLERANCE_S = 30 * 60;
var ELEVENLABS_SIGNATURE_HEADER = "elevenlabs-signature";
function vendorWords(a) {
  if (a.error) return a.error;
  const j = answerObject(a);
  const detail = j?.detail;
  if (typeof detail === "string") return detail.slice(0, 200);
  const message = detail && typeof detail === "object" ? detail.message : null;
  return typeof message === "string" ? message.slice(0, 200) : `status ${a.status}`;
}
var notOk = (a) => ({
  outcome: a.outcome === "refused" ? "rejected" : "unreachable",
  status: a.status,
  error: vendorWords(a)
});
async function mintConversationToken(cfg, deps) {
  const url = `${ELEVENLABS_API}/v1/convai/conversation/token?agent_id=${encodeURIComponent(cfg.agentId)}`;
  const a = await providerFetch(
    "elevenlabs",
    url,
    { method: "GET", headers: { "xi-api-key": cfg.apiKey }, timeoutMs: ELEVENLABS_TIMEOUT_MS },
    deps
  );
  if (a.outcome !== "ok") return notOk(a);
  const j = answerObject(a);
  const token = typeof j?.token === "string" ? j.token : "";
  const conversationId = typeof j?.conversation_id === "string" ? j.conversation_id : "";
  if (!token || !conversationId) return { outcome: "rejected", status: a.status, error: "no token in the answer" };
  return { outcome: "ok", token, conversationId };
}
async function speakText(cfg, input, deps) {
  const url = `${ELEVENLABS_API}/v1/text-to-speech/${encodeURIComponent(input.voiceId)}/stream?output_format=mp3_44100_128`;
  const a = await providerFetch(
    "elevenlabs",
    url,
    {
      method: "POST",
      headers: { "xi-api-key": cfg.apiKey, "content-type": "application/json", accept: "audio/mpeg" },
      body: JSON.stringify({ text: input.text, model_id: input.modelId, apply_text_normalization: "on" }),
      timeoutMs: ELEVENLABS_SPEECH_TIMEOUT_MS,
      stream: true
    },
    deps
  );
  if (a.outcome !== "ok" || !a.body) return notOk(a);
  return { outcome: "ok", body: a.body, contentType: a.headers?.get("content-type") || "audio/mpeg" };
}
async function deleteConversation(cfg, conversationId, deps) {
  const a = await providerFetch(
    "elevenlabs",
    `${ELEVENLABS_API}/v1/convai/conversations/${encodeURIComponent(conversationId)}`,
    {
      method: "DELETE",
      headers: { "xi-api-key": cfg.apiKey },
      timeoutMs: ELEVENLABS_TIMEOUT_MS,
      idempotent: true,
      tries: 2
    },
    deps
  );
  return {
    outcome: a.outcome === "ok" ? "ok" : a.outcome === "refused" ? "rejected" : "unreachable",
    status: a.status
  };
}
var hexOf = (b) => Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, "0")).join("");
function sameBytes(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
async function elevenLabsWebhookSignature(secret, timestamp, rawBody) {
  const enc = new TextEncoder();
  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await globalThis.crypto.subtle.sign("HMAC", key, enc.encode(`${timestamp}.${rawBody}`));
  return `v0=${hexOf(sig)}`;
}
async function verifyElevenLabsWebhook(secret, signatureHeader, rawBody, nowMs) {
  if (!secret || !signatureHeader) return false;
  const fields = /* @__PURE__ */ new Map();
  for (const part of signatureHeader.split(",")) {
    const i = part.indexOf("=");
    if (i > 0) fields.set(part.slice(0, i).trim(), part.slice(i + 1).trim());
  }
  const t = fields.get("t") ?? "";
  const ts = Number(t);
  if (!/^\d+$/.test(t) || !Number.isFinite(ts) || Math.abs(nowMs / 1e3 - ts) > ELEVENLABS_WEBHOOK_TOLERANCE_S)
    return false;
  const v0 = fields.get("v0");
  if (!v0) return false;
  return sameBytes(`v0=${v0}`, await elevenLabsWebhookSignature(secret, t, rawBody));
}

// src/lines/lines.ts
import { randomInt } from "crypto";
var RETELL_ORIGINATION = "sip:sip.retellai.com";
var LINE_COSTS = {
  local_number_month_usd: 1.15,
  toll_free_month_usd: 2.15
};
function chooseLineProvider(env) {
  if (env.sid && env.token) return "twilio";
  if (env.dryRun === "1" && env.vercelEnv !== "production") return "dry";
  return null;
}
function trunkDomain(lineId) {
  return `chanlytics-${lineId.replace(/[^a-z0-9]/gi, "").slice(0, 12).toLowerCase()}.pstn.twilio.com`;
}
function subaccountName(tenantName, lineId) {
  const tag = lineId.replace(/[^a-z0-9]/gi, "").slice(0, 12).toLowerCase();
  const suffix = ` \xB7 Chanlytics \xB7 ${tag}`;
  return `${tenantName.slice(0, 64 - suffix.length)}${suffix}`;
}
function sipUsername(lineId) {
  return `line-${lineId.replace(/[^a-z0-9]/gi, "").slice(0, 12).toLowerCase()}`;
}
var LOWER = "abcdefghijkmnpqrstuvwxyz";
var UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
var DIGIT = "23456789";
function sipPassword(random) {
  const below = random ? (n) => Math.floor(random() * n) : (n) => randomInt(n);
  const pick = (s) => s[below(s.length)];
  const all = LOWER + UPPER + DIGIT;
  const chars = [pick(LOWER), pick(UPPER), pick(DIGIT)];
  while (chars.length < 24) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = below(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}
function isValidSipPassword(p) {
  return p.length >= 12 && /\d/.test(p) && /[a-z]/.test(p) && /[A-Z]/.test(p);
}
var isAreaCode = (n) => typeof n === "number" && Number.isInteger(n) && n >= 200 && n <= 999;

// src/lines/lines-twilio.ts
var API2 = "https://api.twilio.com/2010-04-01";
var TRUNKING = "https://trunking.twilio.com/v1";
var MESSAGING = "https://messaging.twilio.com/v1";
var TWILIO_TIMEOUT_MS = 15e3;
var twilioUrls = {
  subaccounts: `${API2}/Accounts.json`,
  availableLocal: (sid2, country = "US") => `${API2}/Accounts/${sid2}/AvailablePhoneNumbers/${country}/Local.json`,
  incomingNumbers: (sid2) => `${API2}/Accounts/${sid2}/IncomingPhoneNumbers.json`,
  incomingNumber: (sid2, numberSid) => `${API2}/Accounts/${sid2}/IncomingPhoneNumbers/${numberSid}.json`,
  credentialLists: (sid2) => `${API2}/Accounts/${sid2}/SIP/CredentialLists.json`,
  credentials: (sid2, listSid) => `${API2}/Accounts/${sid2}/SIP/CredentialLists/${listSid}/Credentials.json`,
  credential: (sid2, listSid, credentialSid) => `${API2}/Accounts/${sid2}/SIP/CredentialLists/${listSid}/Credentials/${credentialSid}.json`,
  trunks: `${TRUNKING}/Trunks`,
  trunk: (trunkSid) => `${TRUNKING}/Trunks/${trunkSid}`,
  trunkCredentialLists: (trunkSid) => `${TRUNKING}/Trunks/${trunkSid}/CredentialLists`,
  trunkOriginationUrls: (trunkSid) => `${TRUNKING}/Trunks/${trunkSid}/OriginationUrls`,
  trunkPhoneNumbers: (trunkSid) => `${TRUNKING}/Trunks/${trunkSid}/PhoneNumbers`,
  messagingServices: `${MESSAGING}/Services`,
  serviceNumbers: (serviceSid) => `${MESSAGING}/Services/${serviceSid}/PhoneNumbers`,
  messages: (sid2) => `${API2}/Accounts/${sid2}/Messages.json`
};
var TwilioError = class extends Error {
  status;
  code;
  constructor(status, body, what) {
    const code = typeof body?.code === "number" ? body.code : null;
    const msg = typeof body?.message === "string" ? body.message : `HTTP ${status}`;
    super(`${what}: ${msg}${code ? ` (Twilio ${code})` : ""}`);
    this.name = "TwilioError";
    this.status = status;
    this.code = code;
  }
};
function twilioRequest(acct, method, url, o = {}) {
  return providerFetch("twilio", url, {
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(`${acct.sid}:${acct.token}`).toString("base64")}`,
      ...o.form !== void 0 ? { "Content-Type": "application/x-www-form-urlencoded" } : {}
    },
    body: o.form,
    timeoutMs: o.timeoutMs ?? TWILIO_TIMEOUT_MS,
    breaker: o.breaker ?? "hold",
    ...method === "GET" ? { idempotent: true, tries: 2 } : {}
  });
}
var fetchTwilio = async (acct, method, url, form2) => {
  const text = method === "POST" && url.endsWith("/Messages.json");
  const a = await twilioRequest(acct, method, url, {
    ...form2 ? { form: new URLSearchParams(form2).toString() } : {},
    ...text ? { breaker: "count" } : {}
  });
  const body = a.status === 0 ? { error: a.error ?? "no answer" } : answerObject(a) ?? (a.json === null && a.text ? { text: a.text.slice(0, 300) } : null);
  return { status: a.status, body, outcome: a.outcome };
};
var str = (o, k) => typeof o?.[k] === "string" ? o[k] : null;
function need(a, what) {
  if (a.status < 200 || a.status >= 300 || !a.body) throw new TwilioError(a.status, a.body, what);
  return a.body;
}
function rowsOf(b, key) {
  const rows = b[key];
  return Array.isArray(rows) ? rows.filter((r) => !!r && typeof r === "object" && !Array.isArray(r)) : [];
}
async function createSubaccount(http2, master, friendlyName) {
  const b = need(
    await http2(master, "POST", twilioUrls.subaccounts, { FriendlyName: friendlyName.slice(0, 64) }),
    "create subaccount"
  );
  const sid2 = str(b, "sid");
  const token = str(b, "auth_token");
  if (!sid2 || !token) throw new TwilioError(200, b, "create subaccount answered without sid/auth_token");
  return { sid: sid2, token, status: str(b, "status") ?? "active" };
}
async function findSubaccount(http2, master, friendlyName) {
  const url = `${twilioUrls.subaccounts}?${new URLSearchParams({ FriendlyName: friendlyName.slice(0, 64), PageSize: "20" })}`;
  for (const a of rowsOf(need(await http2(master, "GET", url), "list subaccounts"), "accounts")) {
    const sid2 = str(a, "sid");
    const token = str(a, "auth_token");
    if (sid2 && token && str(a, "status") !== "closed") return { sid: sid2, token };
  }
  return null;
}
async function findTrunk(http2, acct, domainName) {
  for (const t of rowsOf(need(await http2(acct, "GET", `${twilioUrls.trunks}?PageSize=50`), "list trunks"), "trunks")) {
    const sid2 = str(t, "sid");
    if (sid2 && str(t, "domain_name") === domainName) return { sid: sid2, domainName };
  }
  return null;
}
async function findCredentialList(http2, acct, friendlyName) {
  const b = need(
    await http2(acct, "GET", `${twilioUrls.credentialLists(acct.sid)}?PageSize=50`),
    "list credential lists"
  );
  for (const l of rowsOf(b, "credential_lists")) {
    const sid2 = str(l, "sid");
    if (sid2 && str(l, "friendly_name") === friendlyName.slice(0, 64)) return { sid: sid2 };
  }
  return null;
}
async function findCredential(http2, acct, listSid, username) {
  const b = need(
    await http2(acct, "GET", `${twilioUrls.credentials(acct.sid, listSid)}?PageSize=50`),
    "list credentials"
  );
  for (const c of rowsOf(b, "credentials")) {
    const sid2 = str(c, "sid");
    if (sid2 && str(c, "username") === username) return { sid: sid2 };
  }
  return null;
}
async function deleteCredential(http2, acct, listSid, credentialSid) {
  const a = await http2(acct, "DELETE", twilioUrls.credential(acct.sid, listSid, credentialSid));
  if (a.status !== 204 && a.status !== 404) throw new TwilioError(a.status, a.body, "delete credential");
}
async function findOrigination(http2, acct, trunkSid, sipUrl) {
  const b = need(
    await http2(acct, "GET", `${twilioUrls.trunkOriginationUrls(trunkSid)}?PageSize=50`),
    "list origination urls"
  );
  for (const o of rowsOf(b, "origination_urls")) {
    const sid2 = str(o, "sid");
    if (sid2 && str(o, "sip_url") === sipUrl) return { sid: sid2 };
  }
  return null;
}
async function searchLocal(http2, acct, q) {
  const url = `${twilioUrls.availableLocal(acct.sid)}?${new URLSearchParams({
    AreaCode: String(q.areaCode),
    VoiceEnabled: "true",
    SmsEnabled: "true",
    PageSize: String(Math.min(Math.max(q.limit, 1), 30))
  }).toString()}`;
  const b = need(await http2(acct, "GET", url), "search numbers");
  const rows = Array.isArray(b.available_phone_numbers) ? b.available_phone_numbers : [];
  return rows.map((n) => {
    const e164 = str(n, "phone_number");
    if (!e164) return null;
    const caps = n.capabilities ?? {};
    return {
      e164,
      friendly: str(n, "friendly_name") ?? e164,
      locality: str(n, "locality"),
      region: str(n, "region"),
      capabilities: { voice: caps.voice === true, sms: caps.sms === true, mms: caps.mms === true }
    };
  }).filter((n) => n !== null);
}
async function buyNumber(http2, acct, e164, friendlyName) {
  const b = need(
    await http2(acct, "POST", twilioUrls.incomingNumbers(acct.sid), {
      PhoneNumber: e164,
      FriendlyName: friendlyName.slice(0, 64)
    }),
    "buy number"
  );
  const sid2 = str(b, "sid");
  if (!sid2) throw new TwilioError(200, b, "buy number answered without a sid");
  return { sid: sid2, e164: str(b, "phone_number") ?? e164 };
}
async function ownedNumber(http2, acct, e164) {
  const a = await http2(
    acct,
    "GET",
    `${twilioUrls.incomingNumbers(acct.sid)}?PhoneNumber=${encodeURIComponent(e164)}&PageSize=1`
  );
  if (a.status === 404) return null;
  const b = need(a, "list owned numbers");
  const list = Array.isArray(b.incoming_phone_numbers) ? b.incoming_phone_numbers : [];
  for (const row of list) {
    if (!row || typeof row !== "object") continue;
    const sid2 = str(row, "sid");
    if (sid2) return { sid: sid2, e164: str(row, "phone_number") ?? e164 };
  }
  return null;
}
async function releaseNumber(http2, acct, numberSid) {
  const a = await http2(acct, "DELETE", twilioUrls.incomingNumber(acct.sid, numberSid));
  if (a.status !== 204 && a.status !== 404) throw new TwilioError(a.status, a.body, "release number");
}
async function createTrunk(http2, acct, o) {
  const b = need(
    await http2(acct, "POST", twilioUrls.trunks, {
      FriendlyName: o.friendlyName.slice(0, 64),
      DomainName: o.domainName
    }),
    "create trunk"
  );
  const sid2 = str(b, "sid");
  if (!sid2) throw new TwilioError(200, b, "create trunk answered without a sid");
  return { sid: sid2, domainName: str(b, "domain_name") ?? o.domainName };
}
async function deleteTrunk(http2, acct, trunkSid) {
  const a = await http2(acct, "DELETE", twilioUrls.trunk(trunkSid));
  if (a.status !== 204 && a.status !== 404) throw new TwilioError(a.status, a.body, "delete trunk");
}
async function createCredentialList(http2, acct, friendlyName) {
  const b = need(
    await http2(acct, "POST", twilioUrls.credentialLists(acct.sid), { FriendlyName: friendlyName.slice(0, 64) }),
    "create credential list"
  );
  const sid2 = str(b, "sid");
  if (!sid2) throw new TwilioError(200, b, "create credential list answered without a sid");
  return { sid: sid2 };
}
async function addCredential(http2, acct, listSid, username, password) {
  const b = need(
    await http2(acct, "POST", twilioUrls.credentials(acct.sid, listSid), { Username: username, Password: password }),
    "add credential"
  );
  const sid2 = str(b, "sid");
  if (!sid2) throw new TwilioError(200, b, "add credential answered without a sid");
  return { sid: sid2 };
}
async function attachCredentialList(http2, acct, trunkSid, listSid) {
  need(
    await http2(acct, "POST", twilioUrls.trunkCredentialLists(trunkSid), { CredentialListSid: listSid }),
    "attach credential list"
  );
}
async function addOrigination(http2, acct, trunkSid, o) {
  const b = need(
    await http2(acct, "POST", twilioUrls.trunkOriginationUrls(trunkSid), {
      SipUrl: o.sipUrl,
      FriendlyName: o.friendlyName.slice(0, 64),
      Weight: "10",
      Priority: "10",
      Enabled: "true"
    }),
    "add origination"
  );
  const sid2 = str(b, "sid");
  if (!sid2) throw new TwilioError(200, b, "add origination answered without a sid");
  return { sid: sid2 };
}
async function attachNumber(http2, acct, trunkSid, numberSid) {
  need(
    await http2(acct, "POST", twilioUrls.trunkPhoneNumbers(trunkSid), { PhoneNumberSid: numberSid }),
    "attach number to trunk"
  );
}
async function createMessagingService(http2, acct, o) {
  const b = need(
    await http2(acct, "POST", twilioUrls.messagingServices, {
      FriendlyName: o.friendlyName.slice(0, 64),
      InboundRequestUrl: o.inboundUrl,
      InboundMethod: "POST",
      UseInboundWebhookOnNumber: "false",
      StickySender: "true",
      SmartEncoding: "true"
    }),
    "create messaging service"
  );
  const sid2 = str(b, "sid");
  if (!sid2) throw new TwilioError(200, b, "create messaging service answered without a sid");
  return { sid: sid2 };
}
async function addNumberToService(http2, acct, serviceSid, numberSid) {
  const b = need(
    await http2(acct, "POST", twilioUrls.serviceNumbers(serviceSid), { PhoneNumberSid: numberSid }),
    "add number to messaging service"
  );
  const sid2 = str(b, "sid");
  if (!sid2) throw new TwilioError(200, b, "add number to messaging service answered without a sid");
  return { sid: sid2 };
}
async function sendSms(http2, acct, o) {
  const a = await http2(acct, "POST", twilioUrls.messages(acct.sid), {
    MessagingServiceSid: o.serviceSid,
    To: o.to,
    Body: o.body,
    ...o.statusCallback ? { StatusCallback: o.statusCallback } : {}
  });
  const ok2 = a.status >= 200 && a.status < 300 && !!str(a.body, "sid");
  return {
    ok: ok2,
    sid: str(a.body, "sid"),
    status: a.status,
    code: typeof a.body?.code === "number" ? a.body.code : null,
    ...a.outcome ? { outcome: ok2 ? "ok" : a.outcome === "ok" ? "unknown" : a.outcome } : {}
  };
}
function twilioProvider(http2 = fetchTwilio) {
  return {
    name: "twilio",
    createSubaccount: (master, friendlyName) => createSubaccount(http2, master, friendlyName),
    findSubaccount: (master, friendlyName) => findSubaccount(http2, master, friendlyName),
    findTrunk: (acct, domainName) => findTrunk(http2, acct, domainName),
    findCredentialList: (acct, friendlyName) => findCredentialList(http2, acct, friendlyName),
    findCredential: (acct, listSid, username) => findCredential(http2, acct, listSid, username),
    deleteCredential: (acct, listSid, credentialSid) => deleteCredential(http2, acct, listSid, credentialSid),
    findOrigination: (acct, trunkSid, sipUrl) => findOrigination(http2, acct, trunkSid, sipUrl),
    searchLocal: (acct, q) => searchLocal(http2, acct, q),
    buyNumber: (acct, e164, friendlyName) => buyNumber(http2, acct, e164, friendlyName),
    ownedNumber: (acct, e164) => ownedNumber(http2, acct, e164),
    releaseNumber: (acct, numberSid) => releaseNumber(http2, acct, numberSid),
    createTrunk: (acct, o) => createTrunk(http2, acct, o),
    deleteTrunk: (acct, trunkSid) => deleteTrunk(http2, acct, trunkSid),
    createCredentialList: (acct, friendlyName) => createCredentialList(http2, acct, friendlyName),
    addCredential: (acct, listSid, username, password) => addCredential(http2, acct, listSid, username, password),
    attachCredentialList: (acct, trunkSid, listSid) => attachCredentialList(http2, acct, trunkSid, listSid),
    addOrigination: (acct, trunkSid, o) => addOrigination(http2, acct, trunkSid, o),
    attachNumber: (acct, trunkSid, numberSid) => attachNumber(http2, acct, trunkSid, numberSid),
    createMessagingService: (acct, o) => createMessagingService(http2, acct, o),
    addNumberToService: (acct, serviceSid, numberSid) => addNumberToService(http2, acct, serviceSid, numberSid),
    sendSms: (acct, o) => sendSms(http2, acct, o)
  };
}

// src/lines/lines-dry.ts
var hex = (n, width = 32) => n.toString(16).padStart(width, "0");
function dryProvider(seed = 1) {
  let n = seed;
  const next = (prefix) => `${prefix}${hex(n++)}`;
  const calls = [];
  const owned = /* @__PURE__ */ new Map();
  const subaccounts = /* @__PURE__ */ new Map();
  const trunks = /* @__PURE__ */ new Map();
  const lists = /* @__PURE__ */ new Map();
  const credentials = /* @__PURE__ */ new Map();
  const originations = /* @__PURE__ */ new Map();
  const rec = (op, ...args) => calls.push({ op, args });
  const acctOf = (a) => a.sid;
  return {
    name: "dry",
    calls,
    owned,
    async createSubaccount(master, friendlyName) {
      rec("createSubaccount", acctOf(master), friendlyName);
      const acct = { sid: next("AC"), token: next("tok") };
      subaccounts.set(friendlyName, acct);
      return { ...acct, status: "active" };
    },
    async findSubaccount(master, friendlyName) {
      rec("findSubaccount", acctOf(master), friendlyName);
      return subaccounts.get(friendlyName) ?? null;
    },
    async findTrunk(acct, domainName) {
      rec("findTrunk", acctOf(acct), domainName);
      const sid2 = trunks.get(`${acctOf(acct)} ${domainName}`);
      return sid2 ? { sid: sid2, domainName } : null;
    },
    async findCredentialList(acct, friendlyName) {
      rec("findCredentialList", acctOf(acct), friendlyName);
      const sid2 = lists.get(`${acctOf(acct)} ${friendlyName}`);
      return sid2 ? { sid: sid2 } : null;
    },
    async findCredential(acct, listSid, username) {
      rec("findCredential", acctOf(acct), listSid, username);
      const sid2 = credentials.get(`${listSid} ${username}`);
      return sid2 ? { sid: sid2 } : null;
    },
    async deleteCredential(acct, listSid, credentialSid) {
      rec("deleteCredential", acctOf(acct), listSid, credentialSid);
      for (const [k, v] of credentials) if (v === credentialSid) credentials.delete(k);
    },
    async findOrigination(acct, trunkSid, sipUrl) {
      rec("findOrigination", acctOf(acct), trunkSid, sipUrl);
      const sid2 = originations.get(`${trunkSid} ${sipUrl}`);
      return sid2 ? { sid: sid2 } : null;
    },
    async searchLocal(acct, q) {
      rec("searchLocal", acctOf(acct), q);
      const out = [];
      for (let i = 0; i < Math.min(q.limit, 8); i++) {
        const local = `555${String(100 + i).padStart(4, "0")}`;
        out.push({
          e164: `+1${q.areaCode}${local}`,
          friendly: `(${q.areaCode}) ${local.slice(0, 3)}-${local.slice(3)}`,
          locality: "Dry Run",
          region: "XX",
          capabilities: { voice: true, sms: true, mms: false }
        });
      }
      return out;
    },
    async buyNumber(acct, e164, friendlyName) {
      rec("buyNumber", acctOf(acct), e164, friendlyName);
      const sid2 = next("PN");
      owned.set(sid2, e164);
      return { sid: sid2, e164 };
    },
    // The dry provider already keeps what it "sold", so it can answer honestly --
    // which is what makes the saga's lookup-before-buy testable without a carrier.
    async ownedNumber(acct, e164) {
      rec("ownedNumber", acctOf(acct), e164);
      for (const [sid2, held] of owned) if (held === e164) return { sid: sid2, e164 };
      return null;
    },
    async releaseNumber(acct, numberSid) {
      rec("releaseNumber", acctOf(acct), numberSid);
      owned.delete(numberSid);
    },
    async createTrunk(acct, o) {
      rec("createTrunk", acctOf(acct), o);
      const sid2 = next("TK");
      trunks.set(`${acctOf(acct)} ${o.domainName}`, sid2);
      return { sid: sid2, domainName: o.domainName };
    },
    async deleteTrunk(acct, trunkSid) {
      rec("deleteTrunk", acctOf(acct), trunkSid);
    },
    async createCredentialList(acct, friendlyName) {
      rec("createCredentialList", acctOf(acct), friendlyName);
      const sid2 = next("CL");
      lists.set(`${acctOf(acct)} ${friendlyName}`, sid2);
      return { sid: sid2 };
    },
    async addCredential(acct, listSid, username) {
      rec("addCredential", acctOf(acct), listSid, username);
      if (credentials.has(`${listSid} ${username}`)) throw new Error(`add credential: ${username} already exists`);
      const sid2 = next("CR");
      credentials.set(`${listSid} ${username}`, sid2);
      return { sid: sid2 };
    },
    async attachCredentialList(acct, trunkSid, listSid) {
      rec("attachCredentialList", acctOf(acct), trunkSid, listSid);
    },
    async addOrigination(acct, trunkSid, o) {
      rec("addOrigination", acctOf(acct), trunkSid, o);
      const sid2 = next("OU");
      originations.set(`${trunkSid} ${o.sipUrl}`, sid2);
      return { sid: sid2 };
    },
    async attachNumber(acct, trunkSid, numberSid) {
      rec("attachNumber", acctOf(acct), trunkSid, numberSid);
    },
    async createMessagingService(acct, o) {
      rec("createMessagingService", acctOf(acct), o);
      return { sid: next("MG") };
    },
    async addNumberToService(acct, serviceSid, numberSid) {
      rec("addNumberToService", acctOf(acct), serviceSid, numberSid);
      return { sid: next("PH") };
    },
    async sendSms(acct, o) {
      rec("sendSms", acctOf(acct), o.serviceSid, o.to);
      return { ok: true, sid: next("SM"), status: 201, code: null };
    }
  };
}

// src/lines/lines-saga.ts
var LINE_STEPS = [
  "subaccount",
  "number",
  "trunk",
  "agent",
  "import",
  "messaging",
  "channel"
];
var OUT_OF_TIME = /* @__PURE__ */ Symbol("out of time");
var AGENT_STEP_MORE_MS = 1e4;
function retellImportBody(o) {
  return {
    phone_number: o.e164,
    termination_uri: o.terminationUri,
    sip_trunk_auth_username: o.username,
    sip_trunk_auth_password: o.password,
    inbound_agents: [{ agent_id: o.agentId, ...o.pinned ? { agent_version: "latest_published" } : {}, weight: 1 }],
    nickname: o.nickname,
    inbound_webhook_url: o.inboundWebhookUrl
  };
}
function nextLineStep(line) {
  if (!line.subaccount_sid) return "subaccount";
  if (!line.number_sid) return "number";
  if (!line.trunk_sid || !line.credential_list_sid || !line.termination_uri || line.facts.trunk_ready !== true)
    return "trunk";
  if (!line.retell_agent_id) return "agent";
  if (line.facts.retell_imported !== true) return "import";
  if (!line.messaging_service_sid || line.facts.number_in_service !== true) return "messaging";
  if (typeof line.facts.channel_id !== "string" || typeof line.facts.sms_channel_id !== "string") return "channel";
  return null;
}
function errorWords(e) {
  return (e instanceof Error ? e.message : String(e)).slice(0, 500);
}
function lineRun(start, ports) {
  const run = {
    ports,
    line: { ...start, facts: { ...start.facts ?? {} } },
    secrets: {},
    async save(patch) {
      run.line = { ...run.line, ...patch, facts: patch.facts ? { ...patch.facts } : run.line.facts };
      await ports.store.save(patch);
    },
    fact: async (k, v) => run.save({ facts: { ...run.line.facts, [k]: v } }),
    room(more = 0) {
      if (ports.timeLeft && ports.timeLeft() <= more) throw OUT_OF_TIME;
    },
    async once(key, look, make) {
      const asked = `asked_${key}`;
      run.room();
      if (run.line.facts[asked] === true) {
        const found = await look();
        if (found) return found;
        run.room();
      } else {
        await run.fact(asked, true);
      }
      return make();
    },
    async putSecrets(s) {
      run.secrets = { ...run.secrets, ...s };
      await ports.store.putSecrets(s);
    },
    sub() {
      if (!run.line.subaccount_sid || !run.secrets.auth_token)
        throw new Error("the subaccount's token is missing from the vault");
      return { sid: run.line.subaccount_sid, token: run.secrets.auth_token };
    }
  };
  return run;
}
var ON_STEP = {
  subaccount: subaccountStep,
  number: numberStep,
  trunk: trunkStep,
  agent: agentStep,
  import: importStep,
  messaging: messagingStep,
  channel: channelStep
};
async function runLineSaga(start, ports) {
  const run = lineRun(start, ports);
  if (run.line.voice_state === "answering" && nextLineStep(run.line) === null) return { ok: true, line: run.line };
  if (!run.line.e164) {
    await run.save({ voice_state: "failed", step: "number", last_error: "no number chosen", state_since: ports.now() });
    return { ok: false, step: "number", error: "no number chosen", line: run.line };
  }
  run.secrets = await ports.store.getSecrets();
  let step = nextLineStep(run.line);
  await run.save({ voice_state: "provisioning", step, last_error: null, state_since: ports.now() });
  try {
    while ((step = nextLineStep(run.line)) !== null) {
      run.room();
      await run.save({ step });
      await ON_STEP[step](run);
    }
    await run.save({ voice_state: "answering", step: null, last_error: null, state_since: ports.now() });
    return { ok: true, line: run.line };
  } catch (e) {
    if (e === OUT_OF_TIME)
      return { ok: true, later: true, step: run.line.step ?? step ?? "subaccount", line: run.line };
    const error = errorWords(e);
    const at = run.line.step ?? step ?? "subaccount";
    await run.save({ voice_state: "failed", step: at, last_error: error, state_since: ports.now() });
    return { ok: false, step: at, error, line: run.line };
  }
}
async function subaccountStep(run) {
  const { ports } = run;
  const name = subaccountName(ports.tenant.name, run.line.id);
  const acct = await run.once(
    "subaccount",
    () => ports.provider.findSubaccount(ports.master, name),
    () => ports.provider.createSubaccount(ports.master, name)
  );
  await run.putSecrets({ auth_token: acct.token });
  await run.save({ subaccount_sid: acct.sid });
}
async function numberStep(run) {
  const { ports } = run;
  const held = await ports.provider.ownedNumber(run.sub(), run.line.e164);
  if (!held) run.room();
  const bought = held ?? await ports.provider.buyNumber(run.sub(), run.line.e164, `${ports.tenant.name} \xB7 Chanlytics`);
  await run.save({ number_sid: bought.sid, e164: bought.e164 });
}
var TRUNK_PARTS = [
  ensureTrunk,
  ensureCredentialList,
  ensureSipCredential,
  ensureCredentialListAttached,
  ensureOrigination,
  ensureNumberAttached
];
async function trunkStep(run) {
  const acct = run.sub();
  for (const ensure of TRUNK_PARTS) await ensure(run, acct);
  await run.fact("trunk_ready", true);
}
async function ensureTrunk(run, acct) {
  if (run.line.trunk_sid) return;
  const { ports } = run;
  const domainName = trunkDomain(run.line.id);
  const t = await run.once(
    "trunk",
    () => ports.provider.findTrunk(acct, domainName),
    () => ports.provider.createTrunk(acct, { friendlyName: `${ports.tenant.name} \xB7 Chanlytics`, domainName })
  );
  await run.save({ trunk_sid: t.sid, termination_uri: t.domainName });
}
async function ensureCredentialList(run, acct) {
  if (run.line.credential_list_sid) return;
  const { ports } = run;
  const name = `${ports.tenant.name} \xB7 Chanlytics`;
  const cl = await run.once(
    "credential_list",
    () => ports.provider.findCredentialList(acct, name),
    () => ports.provider.createCredentialList(acct, name)
  );
  await run.save({ credential_list_sid: cl.sid });
}
async function ensureSipCredential(run, acct) {
  if (run.secrets.sip_password && run.secrets.sip_username) return;
  const { ports } = run;
  const username = sipUsername(run.line.id);
  const password = sipPassword(ports.random);
  if (!isValidSipPassword(password)) throw new Error("generated SIP password failed Twilio's rule");
  await run.once(
    "credential",
    async () => {
      const lost = await ports.provider.findCredential(acct, run.line.credential_list_sid, username);
      if (lost) {
        run.room();
        await ports.provider.deleteCredential(acct, run.line.credential_list_sid, lost.sid);
      }
      return null;
    },
    () => ports.provider.addCredential(acct, run.line.credential_list_sid, username, password)
  );
  await run.putSecrets({ sip_username: username, sip_password: password });
}
async function ensureCredentialListAttached(run, acct) {
  if (run.line.facts.credential_list_attached === true) return;
  const { ports } = run;
  run.room();
  await ports.provider.attachCredentialList(acct, run.line.trunk_sid, run.line.credential_list_sid);
  await run.fact("credential_list_attached", true);
}
async function ensureOrigination(run, acct) {
  if (typeof run.line.facts.origination_sid === "string") return;
  const { ports } = run;
  const o = await run.once(
    "origination",
    () => ports.provider.findOrigination(acct, run.line.trunk_sid, RETELL_ORIGINATION),
    () => ports.provider.addOrigination(acct, run.line.trunk_sid, {
      sipUrl: RETELL_ORIGINATION,
      friendlyName: "Retell"
    })
  );
  await run.fact("origination_sid", o.sid);
}
async function ensureNumberAttached(run, acct) {
  if (run.line.facts.number_attached === true) return;
  const { ports } = run;
  run.room();
  await ports.provider.attachNumber(acct, run.line.trunk_sid, run.line.number_sid);
  await run.fact("number_attached", true);
}
async function agentStep(run) {
  const { ports } = run;
  run.room(AGENT_STEP_MORE_MS);
  const a = await ports.agent.ensure();
  await run.save({ retell_agent_id: a.agentId, facts: { ...run.line.facts, llm_id: a.llmId, agent_pinned: a.pinned } });
}
async function importStep(run) {
  const { ports } = run;
  if (!run.secrets.sip_username || !run.secrets.sip_password)
    throw new Error("the SIP credential is missing from the vault");
  const body = retellImportBody({
    e164: run.line.e164,
    terminationUri: run.line.termination_uri,
    username: run.secrets.sip_username,
    password: run.secrets.sip_password,
    agentId: run.line.retell_agent_id,
    pinned: run.line.facts.agent_pinned === true,
    nickname: ports.nickname,
    inboundWebhookUrl: ports.inboundWebhookUrl
  });
  const r = await ports.retell.importNumber(body);
  if (!r.ok) {
    const msg = typeof r.body?.message === "string" ? r.body.message : JSON.stringify(r.body ?? {}).slice(0, 200);
    throw new Error(`Retell import: HTTP ${r.status} ${msg}`);
  }
  await run.save({
    facts: {
      ...run.line.facts,
      retell_imported: true,
      retell_number_type: typeof r.body?.phone_number_type === "string" ? r.body.phone_number_type : "custom"
    }
  });
}
async function messagingStep(run) {
  const { ports } = run;
  const acct = run.sub();
  if (!run.line.messaging_service_sid) {
    const svc = await ports.provider.createMessagingService(acct, {
      friendlyName: `${ports.tenant.name} \xB7 Chanlytics`,
      inboundUrl: ports.smsInboundUrl
    });
    await run.save({ messaging_service_sid: svc.sid });
  }
  if (run.line.facts.number_in_service !== true) {
    run.room();
    await ports.provider.addNumberToService(acct, run.line.messaging_service_sid, run.line.number_sid);
    await run.fact("number_in_service", true);
  }
}
async function channelStep(run) {
  const { ports } = run;
  if (typeof run.line.facts.channel_id !== "string") {
    const c = await ports.channel.ensure({
      agentId: run.line.retell_agent_id,
      e164: run.line.e164,
      lineId: run.line.id
    });
    await run.fact("channel_id", c.channelId);
  }
  if (typeof run.line.facts.sms_channel_id !== "string") {
    const s = await ports.smsChannel.ensure({
      e164: run.line.e164,
      lineId: run.line.id,
      serviceSid: run.line.messaging_service_sid
    });
    await run.fact("sms_channel_id", s.channelId);
  }
}

// src/lines/sms.ts
import {
  LINE_CODES_MAX,
  LINE_CODES_WITHIN_MS,
  SMS_OPT_OUT_PATTERN,
  utf8Bytes
} from "../../contracts/dist/index.js";
function smsInboundFrom(form2) {
  const messageSid = form2.MessageSid || form2.SmsSid || "";
  const from = form2.From || "";
  const to = form2.To || "";
  if (!messageSid || !from || !to) return null;
  const numMedia = Math.max(0, Number.parseInt(form2.NumMedia || "0", 10) || 0);
  const mediaTypes = [];
  for (let i = 0; i < numMedia; i++) {
    const t = form2[`MediaContentType${i}`];
    if (t) mediaTypes.push(t);
  }
  const opt = (form2.OptOutType || "").toUpperCase();
  return {
    messageSid,
    from,
    to,
    body: form2.Body ?? "",
    numMedia,
    mediaTypes,
    optOutType: opt === "STOP" || opt === "START" || opt === "HELP" ? opt : null,
    messagingServiceSid: form2.MessagingServiceSid || null,
    accountSid: form2.AccountSid || null
  };
}
function smsAsWaMessage(s, nowMs = Date.now()) {
  const digits = s.from.replace(/[^\d]/g, "");
  const words = s.body.trim();
  const base = { from: digits, id: s.messageSid, timestamp: String(Math.floor(nowMs / 1e3)) };
  if (words)
    return {
      ...base,
      type: "text",
      text: {
        body: s.numMedia > 0 ? `${words} [with ${s.numMedia === 1 ? "a picture" : `${s.numMedia} pictures`}]` : words
      }
    };
  return { ...base, type: s.numMedia > 0 ? "image" : "unsupported" };
}
function carrierConsent(s) {
  if (s.optOutType === "STOP") return { optOut: true, optIn: false };
  if (s.optOutType === "START") return { optOut: false, optIn: true };
  return null;
}
function smsKeywordConsent(body) {
  if (!body || !SMS_OPT_OUT_PATTERN.test(body)) return null;
  return { optOut: true, optIn: false };
}
function mergeConsent(a, b) {
  if (!a) return b;
  if (!b) return a;
  return { optOut: a.optOut || b.optOut, optIn: a.optIn || b.optIn };
}
function withCarrierConsent(n, c) {
  if (!c) return n;
  return { ...n, optOut: n.optOut || c.optOut, optIn: n.optIn || c.optIn };
}
var ONE_TIME_CODE_MAX_CHARS = 320;
var CODE_DIGITS = String.raw`(\d{3,4}[ -]\d{3,4}|\d{4,8})`;
var CODE = String.raw`(?<![\d\w])${CODE_DIGITS}(?![\d\w])`;
var CODE_KIND = String.raw`(?:verification|security|confirmation|login|log-in|sign-in|access|one-time|authentication)`;
var CODE_NAME = String.raw`([\p{L}\d&.'’-]+(?: [\p{L}\d&.'’-]+){0,2}?)`;
var CODE_WORD = String.raw`(?:code|passcode|otp|pin)`;
var YOUR_NAME_CODE = new RegExp(
  String.raw`\byour ${CODE_NAME} (?:${CODE_KIND} )?${CODE_WORD}\b[ :]{0,3}(?:is\b[ :]{0,3})?${CODE}`,
  "iu"
);
var CODE_IS_YOUR_KIND = new RegExp(String.raw`${CODE} is your ${CODE_KIND} ${CODE_WORD}\b`, "iu");
var CODE_IS_YOUR_NAME = new RegExp(String.raw`${CODE} is your ${CODE_NAME} (?:${CODE_KIND} )?${CODE_WORD}\b`, "iu");
var DONT_SHARE = /\b(?:don'?t|do not|never) share (?:this|the|your|it)\b/i;
var TO_VERIFY = /\b(?:verif\w*|confirm\w*|log ?in|sign ?in|security|one-time|authenticat\w*|2-?step|two-step)\b/i;
var ANDROID_TAG = /^\s*<#>\s/;
var NOT_A_SERVICE = /^(?:door|gate|garage|locker|lock|building|entry|promo|discount|coupon|gift|referral|booking|appointment|order|reservation|alarm|wi-?fi|security|verification|confirmation|login|log-in|sign-in|access|one-time|authentication)$/i;
function serviceName(name) {
  if (!name) return null;
  return name.split(" ").every((w) => /\p{Lu}/u.test(w) && !NOT_A_SERVICE.test(w)) ? name : null;
}
function oneTimeCodeOf(body) {
  if (body.length > ONE_TIME_CODE_MAX_CHARS || body.includes("?")) return null;
  const [, name, digits] = YOUR_NAME_CODE.exec(body) ?? [];
  const sender = serviceName(name);
  if (digits && sender) return { code: digits, from: sender };
  const [, unnamed] = CODE_IS_YOUR_KIND.exec(body) ?? [];
  if (unnamed) return { code: unnamed, from: null };
  const [, named, namedBy] = CODE_IS_YOUR_NAME.exec(body) ?? [];
  const namedFrom = serviceName(namedBy);
  if (named && namedFrom) return { code: named, from: namedFrom };
  if (ANDROID_TAG.test(body) || DONT_SHARE.test(body) && TO_VERIFY.test(body)) {
    const found = [...body.matchAll(new RegExp(CODE, "gu"))].map((m) => m[1]);
    const only = found.length === 1 ? found[0] : void 0;
    if (only) return { code: only, from: null };
  }
  return null;
}
function lineCodesFrom(texts, nowMs) {
  return [...texts].filter((t) => nowMs - t.atMs <= LINE_CODES_WITHIN_MS).sort((a, b) => b.atMs - a.atMs).flatMap((t) => {
    const read = oneTimeCodeOf(t.body);
    return read ? [{ code: read.code, from: read.from, at: new Date(t.atMs).toISOString() }] : [];
  }).slice(0, LINE_CODES_MAX);
}
var SMS_OPTED_OUT_CODE = 21610;
function smsRefusalOf(r) {
  return !r.ok && r.code === SMS_OPTED_OUT_CODE ? "opted_out" : null;
}
var SMS_FOOTER = "Msg & data rates may apply. Reply STOP to opt out, HELP for help.";
var SMS_MAX_CHARS = 1600;
function smsBody(reply, isFirstReply) {
  const text = reply.trim();
  const withFooter = isFirstReply && !text.includes("STOP") ? `${text}
${SMS_FOOTER}` : text;
  return withFooter.length > SMS_MAX_CHARS ? `${withFooter.slice(0, SMS_MAX_CHARS - 1)}\u2026` : withFooter;
}
var SMS_HELD_REASON = "carriers";
var SMS_HELD_DETAILS = "This text arrived on your line before the carriers approved it for texting, so the receptionist did not answer. It is kept here; answer it yourself, or wait for the approval on Setup.";
function smsInboundUrl(fnUrl) {
  return `${fnUrl.replace(/\/api\/retell-fn$/, "")}/api/inbound-sms`;
}
function smsStatusUrl(fnUrl) {
  return `${fnUrl.replace(/\/api\/retell-fn$/, "")}/api/sms-status`;
}
function smsStatusFrom(form2) {
  const messageSid = form2.MessageSid || form2.SmsSid || "";
  const status = (form2.MessageStatus || form2.SmsStatus || "").toLowerCase();
  const from = form2.From || "";
  const to = form2.To || "";
  if (!messageSid || !status || !from || !to) return null;
  return {
    messageSid,
    status,
    errorCode: form2.ErrorCode ? String(form2.ErrorCode) : null,
    from,
    to,
    messagingServiceSid: form2.MessagingServiceSid || null,
    accountSid: form2.AccountSid || null
  };
}
function smsStatusToRow(status) {
  switch (status) {
    case "sent":
      return "sent";
    case "delivered":
      return "delivered";
    case "read":
      return "read";
    case "undelivered":
    case "failed":
    case "canceled":
      return "failed";
    default:
      return null;
  }
}
function twilioSignedString(url, form2) {
  return url + Object.keys(form2).sort().map((k) => `${k}${form2[k]}`).join("");
}
async function twilioSignature(authToken, url, form2) {
  const key = await crypto.subtle.importKey("raw", utf8Bytes(authToken), { name: "HMAC", hash: "SHA-1" }, false, [
    "sign"
  ]);
  const mac = await crypto.subtle.sign("HMAC", key, utf8Bytes(twilioSignedString(url, form2)));
  return btoa(String.fromCharCode(...new Uint8Array(mac)));
}
function sameSignature(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
async function verifyTwilioSignature(authToken, url, form2, header) {
  if (!header) return false;
  return sameSignature(await twilioSignature(authToken, url, form2), header);
}

// src/email/request.ts
import { escapeHtml, posesAsReply } from "../../contracts/dist/index.js";

// src/email/header-values.ts
var oneLine = (s) => s.replace(/\p{Cc}+/gu, " ").replace(/\s+/g, " ").trim();
function messageIdHeader(id) {
  const s = oneLine(id ?? "");
  const bare = s.replace(/^<|>$/g, "");
  return /^[^\s<>@]+@[^\s<>@]+$/.test(bare) ? `<${bare}>` : null;
}
function addressOf(header) {
  const s = oneLine(header ?? "");
  if (!s) return null;
  const angle = /^(.*)<([^<>\s]+)>\s*$/.exec(s);
  const address = (angle ? angle[2] ?? "" : s).trim().toLowerCase();
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(address)) return null;
  const name = angle ? (angle[1] ?? "").trim().replace(/^"(.*)"$/, "$1").trim() : "";
  return { address, name: name || null };
}
var stringsOf = (v) => (Array.isArray(v) ? v : typeof v === "string" ? [v] : []).filter(
  (x) => typeof x === "string" && x.length > 0
);
var addressesOf = (v) => stringsOf(v).map((r) => addressOf(r)?.address).filter((a) => !!a);

// src/email/request.ts
function mailboxHeader(name, address) {
  const clean = oneLine(name).replace(/["\\]/g, "");
  return clean ? `"${clean}" <${address}>` : address;
}
var REPLY_PREFIX = /^\s*(?:re|aw|sv|rv|antw)\s*:\s*/i;
var SUBJECT_MAX = 200;
function replySubject(parentSubject) {
  let s = oneLine(parentSubject ?? "");
  while (REPLY_PREFIX.test(s)) s = s.replace(REPLY_PREFIX, "");
  return `Re: ${s || "your message"}`.slice(0, SUBJECT_MAX);
}
var LINK_IN_TEXT = /https?:\/\/[^\s<>]+/g;
var linkify = (escaped) => escaped.replace(LINK_IN_TEXT, (m) => {
  const trail = /[.,;:!?)]+$/.exec(m)?.[0] ?? "";
  const href = m.slice(0, m.length - trail.length);
  return `<a href="${href}">${href}</a>${trail}`;
});
function emailHtml(text) {
  return text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean).map((p) => `<p>${linkify(escapeHtml(p)).replace(/\n/g, "<br>")}</p>`).join("\n");
}
function referencesFor(parent) {
  const ids = [...parent.references, parent.rfcMessageId].map(messageIdHeader).filter((x) => x !== null);
  const unique = [...new Set(ids)];
  const MAX = 20;
  return unique.length <= MAX ? unique : [...unique.slice(0, 1), ...unique.slice(unique.length - (MAX - 1))];
}
var UNSUBSCRIBE_URL = /^https:\/\/[A-Za-z0-9\-._~:/?#[\]@!$&'()*+;=%]+$/;
var BARE_ADDRESS = /^[A-Za-z0-9._+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/;
function unsubscribeHeaders(c) {
  const url = c.unsubscribeUrl.trim();
  if (!UNSUBSCRIBE_URL.test(url)) throw new Error("buildEmailRequest: a campaign's unsubscribe is one https address");
  const mail = c.unsubscribeMailto?.trim().replace(/^mailto:/i, "");
  if (mail !== void 0 && !BARE_ADDRESS.test(mail))
    throw new Error("buildEmailRequest: a campaign's unsubscribe by mail is one address");
  return {
    "List-Unsubscribe": mail ? `<${url}>, <mailto:${mail}>` : `<${url}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"
  };
}
function buildEmailRequest(i) {
  const subject = i.parent ? replySubject(i.parent.subject) : oneLine(i.subject ?? "").slice(0, SUBJECT_MAX);
  if (!subject) throw new Error("buildEmailRequest: a first email names its subject");
  if (!i.parent && (i.campaign || i.actor === "ai") && posesAsReply(subject))
    throw new Error("buildEmailRequest: a first email a program sends does not pose as a reply");
  if (i.campaign && !i.campaign.footer.trim()) throw new Error("buildEmailRequest: a campaign's footer is never empty");
  const unsubscribe = i.campaign ? unsubscribeHeaders(i.campaign) : {};
  const text = [i.body.trim(), i.signature?.trim(), i.campaign?.footer.trim()].filter(Boolean).join("\n\n");
  const footerHtml = i.campaign?.footerHtml?.trim() || null;
  if (footerHtml && !footerHtml.includes(`href="${escapeHtml(i.campaign.unsubscribeUrl.trim())}"`))
    throw new Error("buildEmailRequest: a campaign's HTML footer carries its unsubscribe link");
  const html = footerHtml ? `${emailHtml([i.body.trim(), i.signature?.trim()].filter(Boolean).join("\n\n"))}
${footerHtml}` : emailHtml(text);
  const inReplyTo = i.parent ? messageIdHeader(i.parent.rfcMessageId) : null;
  const references = i.parent ? referencesFor(i.parent) : [];
  const autoSubmitted = i.campaign || i.actor === "ai" && !i.parent ? "auto-generated" : i.actor === "ai" ? "auto-replied" : null;
  const headers2 = {
    ...inReplyTo ? { "In-Reply-To": inReplyTo } : {},
    ...references.length ? { References: references.join(" ") } : {},
    ...autoSubmitted ? { "Auto-Submitted": autoSubmitted } : {},
    ...unsubscribe
  };
  return {
    from: mailboxHeader(i.identity.fromName, i.identity.fromAddress),
    to: [i.to],
    reply_to: [i.identity.replyTo],
    subject,
    text,
    html,
    headers: headers2,
    tags: [
      { name: "cl_message", value: i.messageId },
      { name: "cl_tenant", value: i.tenantId }
    ],
    idempotency_key: i.messageId
  };
}
function isEmailRequest(v) {
  if (!v || typeof v !== "object") return false;
  const r = v;
  const strings = (x) => Array.isArray(x) && x.length > 0 && x.every((s) => typeof s === "string" && s.length > 0);
  return typeof r.from === "string" && strings(r.to) && strings(r.reply_to) && typeof r.subject === "string" && typeof r.text === "string" && typeof r.html === "string" && !!r.headers && typeof r.headers === "object" && Array.isArray(r.tags) && typeof r.idempotency_key === "string" && r.idempotency_key.length > 0;
}

// src/email/identity.ts
function hostedAddress(localPart, domain) {
  return `${localPart}@${domain}`;
}
function replyRouteAddress(replyToken, domain) {
  return `r+${replyToken}@${domain}`;
}
function hostedIdentity(mailbox, domain) {
  return {
    fromName: mailbox.from_name,
    fromAddress: hostedAddress(mailbox.local_part, domain),
    replyTo: replyRouteAddress(mailbox.reply_token, domain)
  };
}
function sendsAs(mailbox, domain) {
  return {
    address: hostedAddress(mailbox.local_part, domain),
    replyRoutes: [mailbox.reply_token, mailbox.reply_token_prev].filter((t) => !!t).map((t) => replyRouteAddress(t, domain))
  };
}
function sendsAsCampaigns(mailbox, campaignsDomain, mailDomain) {
  return {
    address: hostedAddress(mailbox.local_part, campaignsDomain),
    replyRoutes: sendsAs(mailbox, mailDomain).replyRoutes
  };
}
function campaignsIdentity(mailbox, campaignsDomain, mailDomain) {
  return {
    fromName: mailbox.from_name,
    fromAddress: hostedAddress(mailbox.local_part, campaignsDomain),
    replyTo: replyRouteAddress(mailbox.reply_token, mailDomain)
  };
}
function sendsAsOwnDomain(domain, mailbox, mailDomain, coldReplyDomains = null) {
  const cold = typeof coldReplyDomains === "string" ? [coldReplyDomains] : coldReplyDomains ?? [];
  return {
    address: `${domain.from_local}@${domain.host}`.toLowerCase(),
    replyRoutes: [
      ...sendsAs(mailbox, mailDomain).replyRoutes,
      ...cold.filter((d) => d !== mailDomain).flatMap((d) => sendsAs(mailbox, d).replyRoutes)
    ]
  };
}
function ownDomainIdentity(domain, mailbox, replyDomain) {
  return {
    fromName: domain.from_name,
    fromAddress: `${domain.from_local}@${domain.host}`.toLowerCase(),
    replyTo: replyRouteAddress(mailbox.reply_token, replyDomain)
  };
}
function requestLeavesAs(request, as) {
  return addressOf(request.from)?.address === as.address && request.reply_to.length === 1 && request.reply_to.every((to) => as.replyRoutes.includes(to.trim().toLowerCase()));
}

// src/email/webhook-signature.ts
var bytesOfBase64 = (s) => {
  const raw = atob(s);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out.buffer;
};
var base64OfBytes = (b) => btoa(String.fromCharCode(...new Uint8Array(b)));
function sameBytes2(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
var WEBHOOK_TOLERANCE_S = 300;
async function resendWebhookSignature(secret, id, timestamp, rawBody) {
  let keyBytes;
  try {
    keyBytes = bytesOfBase64(secret.startsWith("whsec_") ? secret.slice(6) : secret);
  } catch {
    return null;
  }
  const key = await globalThis.crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, [
    "sign"
  ]);
  return base64OfBytes(
    await globalThis.crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${timestamp}.${rawBody}`))
  );
}
async function verifyResendWebhook(secret, h, rawBody, nowMs) {
  if (!secret || !h.id || !h.timestamp || !h.signature) return false;
  const ts = Number(h.timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowMs / 1e3 - ts) > WEBHOOK_TOLERANCE_S) return false;
  const expected = await resendWebhookSignature(secret, h.id, h.timestamp, rawBody);
  if (!expected) return false;
  return h.signature.split(" ").some((entry) => {
    const [version, sig] = entry.split(",");
    return version === "v1" && !!sig && sameBytes2(sig, expected);
  });
}

// src/email/intake.ts
function platformRecipient(address, domain, coldReplyDomains = null) {
  const a = address.trim().toLowerCase();
  const at = a.lastIndexOf("@");
  if (at < 1) return null;
  const host = a.slice(at + 1);
  const local = a.slice(0, at);
  const token = /^r\+([a-z2-7]{24})$/.exec(local)?.[1];
  const cold = (typeof coldReplyDomains === "string" ? [coldReplyDomains] : coldReplyDomains ?? []).map(
    (d) => d.toLowerCase()
  );
  if (host !== domain.toLowerCase() && cold.includes(host)) return token ? { kind: "reply", token } : null;
  if (host !== domain.toLowerCase()) return null;
  if (token) return { kind: "reply", token };
  return /^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$/.test(local) && local !== "r" ? { kind: "mailbox", localPart: local } : null;
}
function emailReceivedEventFrom(payload) {
  const p = payload;
  if (!p || p.type !== "email.received" || !p.data || typeof p.data !== "object") return null;
  const id = p.data.email_id ?? p.data.id;
  if (typeof id !== "string" || !id) return null;
  const envelope = addressesOf(p.data.received_for);
  const recipients = envelope.length ? envelope : [...addressesOf(p.data.to), ...addressesOf(p.data.cc), ...addressesOf(p.data.bcc)];
  return { type: "email.received", receivedId: id, recipients: [...new Set(recipients)] };
}
function headersOf(v) {
  const out = {};
  const put = (k, val) => {
    if (typeof k === "string" && typeof val === "string" && !(k.toLowerCase() in out)) out[k.toLowerCase()] = val;
  };
  if (Array.isArray(v)) for (const h of v) put(h?.name, h?.value);
  else if (v && typeof v === "object")
    for (const [k, val] of Object.entries(v)) put(k, Array.isArray(val) ? val[0] : val);
  return out;
}
function allValuesOf(v, name) {
  const out = [];
  const take = (k, val) => {
    if (typeof k !== "string" || k.toLowerCase() !== name) return;
    for (const x of Array.isArray(val) ? val : [val]) if (typeof x === "string") out.push(x);
  };
  if (Array.isArray(v)) for (const h of v) take(h?.name, h?.value);
  else if (v && typeof v === "object") for (const [k, val] of Object.entries(v)) take(k, val);
  return out;
}
function receivedEmailFrom(body) {
  const b = body;
  if (!b || typeof b !== "object" || typeof b.id !== "string") return null;
  const headers2 = headersOf(b.headers);
  const str2 = (v) => typeof v === "string" && v.length ? v : null;
  return {
    id: b.id,
    from: addressOf(str2(b.from) ?? headers2.from),
    to: addressesOf(b.to),
    cc: addressesOf(b.cc),
    subject: str2(b.subject) ?? str2(headers2.subject),
    text: str2(b.text),
    html: str2(b.html),
    headers: headers2,
    authResults: allValuesOf(b.headers, "authentication-results"),
    messageId: messageIdHeader(str2(b.message_id) ?? headers2["message-id"]),
    createdAt: str2(b.created_at),
    attachments: (Array.isArray(b.attachments) ? b.attachments : []).map((a) => {
      const x = a ?? {};
      return {
        filename: str2(x.filename),
        contentType: str2(x.content_type),
        size: typeof x.size === "number" ? x.size : null
      };
    })
  };
}
function messageIdsIn(header) {
  return (header ?? "").split(/\s+/).map(messageIdHeader).filter((x) => x !== null);
}
function withoutComments(header) {
  let said = header.toLowerCase().replace(/"[^"]*"/g, '""');
  for (let before = ""; before !== said; ) {
    before = said;
    said = said.replace(/\([^()]*\)/g, " ");
  }
  return said;
}
function authservIdOf(header) {
  return withoutComments(header).split(";")[0]?.trim().split(/\s+/)[0] ?? "";
}
function authResultsOf(header) {
  return withoutComments(header).split(";").slice(1).flatMap((clause) => {
    const [head, ...rest] = clause.trim().split(/\s+/);
    const m = /^([a-z0-9-]+)(?:\/\d+)?=([a-z]+)$/.exec(head ?? "");
    if (!m) return [];
    const props = /* @__PURE__ */ new Map();
    for (const pair of rest) {
      const eq = pair.indexOf("=");
      if (eq > 0 && !props.has(pair.slice(0, eq))) props.set(pair.slice(0, eq), pair.slice(eq + 1));
    }
    return [{ method: m[1] ?? "", result: m[2] ?? "", props }];
  });
}
var domainOf = (identity) => {
  const d = identity?.slice(identity.lastIndexOf("@") + 1).trim();
  return d || null;
};
function senderAuthenticated(e, authservId) {
  const expected = authservId?.trim().toLowerCase();
  if (!expected) return false;
  const from = domainOf(e.from?.address.toLowerCase());
  if (!from) return false;
  const own = (e.authResults ?? []).filter((h) => authservIdOf(h) === expected);
  if (own.length !== 1) return false;
  const results = authResultsOf(own[0] ?? "");
  const dmarc = results.filter((r) => r.method === "dmarc");
  if (dmarc.some((r) => r.result === "fail")) return false;
  const alignedDmarc = dmarc.some((r) => r.result === "pass" && domainOf(r.props.get("header.from")) === from);
  const signedByFrom = results.some(
    (r) => r.method === "dkim" && r.result === "pass" && (r.props.has("header.d") ? r.props.get("header.d") === from : domainOf(r.props.get("header.i")) === from)
  );
  return alignedDmarc || signedByFrom;
}
function classifyReceived(e) {
  const h = e.headers;
  const local = e.from?.address.split("@")[0] ?? "";
  if (/multipart\/report/i.test(h["content-type"] ?? "") || /^(mailer-daemon|postmaster)$/.test(local)) return "report";
  const auto = (h["auto-submitted"] ?? "").trim().toLowerCase();
  if (auto.startsWith("auto-replied") || "x-autoreply" in h || "x-autorespond" in h || /^auto[_-]?reply$/i.test((h.precedence ?? "").trim()))
    return "auto_reply";
  if (auto && auto !== "no" || /^(bulk|list|junk)$/i.test((h.precedence ?? "").trim()) || "list-id" in h || "list-unsubscribe" in h)
    return "automated";
  return "person";
}

// src/email/receipts.ts
import { UUID } from "../../contracts/dist/index.js";
var RECEIPT_TYPES = /* @__PURE__ */ new Set([
  "sent",
  "delivered",
  "delivery_delayed",
  "bounced",
  "complained",
  "failed",
  "suppressed"
]);
function tagOf(tags, name) {
  const v = Array.isArray(tags) ? tags.find((t) => t?.name === name)?.value : tags && typeof tags === "object" ? tags[name] : void 0;
  return typeof v === "string" && UUID.test(v) ? v.toLowerCase() : null;
}
function emailReceiptFrom(payload) {
  const p = payload;
  if (!p || typeof p.type !== "string" || !p.type.startsWith("email.") || !p.data || typeof p.data !== "object")
    return null;
  const type = p.type.slice("email.".length);
  if (!RECEIPT_TYPES.has(type)) return null;
  const d = p.data;
  if (typeof d.email_id !== "string" || !d.email_id) return null;
  const str2 = (v) => typeof v === "string" && v.trim() ? v.trim() : null;
  const said = d.bounce ?? d.failed ?? d.suppressed ?? {};
  return {
    type,
    providerId: d.email_id,
    rfcMessageId: messageIdHeader(str2(d.message_id)),
    to: addressesOf(d.to),
    messageId: tagOf(d.tags, "cl_message"),
    tenantId: tagOf(d.tags, "cl_tenant"),
    detail: { kind: str2(said.type) ?? str2(said.reason), subKind: str2(said.subType), message: str2(said.message) }
  };
}
function emailReceiptEffect(r) {
  const error = { provider: r.type, kind: r.detail.kind, sub_kind: r.detail.subKind, message: r.detail.message };
  switch (r.type) {
    case "delivered":
      return { status: "delivered", error: null, suppress: null };
    case "bounced":
      return { status: "failed", error, suppress: /^permanent$/i.test(r.detail.kind ?? "") ? "hard_bounce" : null };
    case "failed":
      return { status: "failed", error, suppress: null };
    case "suppressed":
      return { status: "failed", error, suppress: "provider" };
    case "complained":
      return { status: null, error: null, suppress: "complaint" };
    default:
      return { status: null, error: null, suppress: null };
  }
}

// src/email/provider-answers.ts
function resendLimitOf(r) {
  if (r.ok || r.status !== 429 && r.status !== 409) return null;
  let name;
  try {
    name = JSON.parse(r.errorBody ?? "")?.name ?? null;
  } catch {
    name = null;
  }
  if (name === "daily_quota_exceeded") return "daily";
  if (name === "monthly_quota_exceeded") return "monthly";
  if (name === "concurrent_idempotent_requests") return "in_flight";
  return r.status === 429 ? "rate" : null;
}
var capabilityOf = (v) => v === "enabled" || v === "disabled" ? v : "unknown";
function mailDomainsFrom(body) {
  const rows = body?.data;
  if (!Array.isArray(rows)) return null;
  const out = [];
  for (const r of rows) {
    const d = r ?? {};
    const caps = d.capabilities ?? {};
    if (typeof d.name !== "string" || !d.name) continue;
    out.push({
      name: d.name.trim().toLowerCase(),
      status: typeof d.status === "string" && d.status.trim() ? d.status.trim() : "unknown",
      sending: capabilityOf(caps.sending),
      receiving: capabilityOf(caps.receiving)
    });
  }
  return out;
}

// src/email/email-text.ts
import { convert } from "html-to-text";
function emailPlainText(e) {
  const text = (e.text ?? "").replace(/\r\n/g, "\n").trim();
  if (text) return text;
  if (!e.html) return null;
  const converted = convert(e.html, {
    wordwrap: false,
    selectors: [
      { selector: "img", format: "skip" },
      { selector: "a", options: { hideLinkHrefIfSameAsText: true } }
    ]
  }).replace(/\n{3,}/g, "\n\n").trim();
  return converted || null;
}

// src/email/email-resend.ts
var RESEND_API = "https://api.resend.com";
var SEND_TIMEOUT_MS2 = 15e3;
var SEND_DEADLINE_MS = 32e3;
var SEND_MIN_MS = 3e3;
var RETRY_NEEDS_MS = 5e3;
var LIMIT_WAIT_MAX_MS = 2e3;
var LIMIT_WAIT_DEFAULT_MS = 1e3;
var sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function waitAskedMs(h) {
  for (const name of ["retry-after", "ratelimit-reset"]) {
    const v = h.get(name);
    const s = Number(v);
    if (v !== null && v.trim() !== "" && Number.isFinite(s) && s >= 0) return Math.round(s * 1e3);
  }
  return null;
}
async function resendRequest(cfg, method, path, opts = {}) {
  const a = await providerFetch("resend", `${RESEND_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      ...opts.body !== void 0 ? { "Content-Type": "application/json" } : {},
      ...opts.idempotencyKey ? { "Idempotency-Key": opts.idempotencyKey } : {}
    },
    ...opts.body !== void 0 ? { body: JSON.stringify(opts.body) } : {},
    timeoutMs: opts.timeoutMs ?? SEND_TIMEOUT_MS2,
    breaker: opts.breaker ?? "hold"
  });
  return {
    status: a.status,
    json: a.json,
    raw: a.status === 0 ? a.error ?? "" : a.text,
    headers: a.headers,
    timedOut: a.error === "timeout",
    outcome: a.outcome
  };
}
function emailOutcome(result, answered2) {
  const limit = resendLimitOf(result);
  if (limit === "rate") return "retryable";
  if (limit === "in_flight") return "unknown";
  if (limit === "daily" || limit === "monthly") return "refused";
  return answered2;
}
function paceAskedMs(h) {
  if (!h || h.get("ratelimit-remaining")?.trim() !== "0") return null;
  const s = Number(h.get("ratelimit-reset"));
  return h.get("ratelimit-reset") !== null && Number.isFinite(s) && s >= 0 ? Math.round(s * 1e3) : LIMIT_WAIT_DEFAULT_MS;
}
async function postEmail(cfg, request, timeoutMs) {
  const { idempotency_key, ...body } = request;
  const a = await resendRequest(cfg, "POST", "/emails", {
    body,
    timeoutMs,
    idempotencyKey: idempotency_key,
    breaker: "count"
  });
  if (a.status >= 200 && a.status < 300) {
    const id = a.json?.id;
    return {
      result: { ok: true, wamid: typeof id === "string" ? id : null, status: a.status, outcome: "ok" },
      waitMs: null,
      paceMs: paceAskedMs(a.headers),
      timedOut: false
    };
  }
  if (a.status === 0)
    return {
      result: { ok: false, wamid: null, status: 0, errorBody: a.timedOut ? "timeout" : a.raw, outcome: a.outcome },
      waitMs: null,
      paceMs: null,
      timedOut: a.timedOut
    };
  const refused = { ok: false, wamid: null, status: a.status, errorBody: a.raw.slice(0, 500) };
  return {
    result: { ...refused, outcome: emailOutcome(refused, a.outcome) },
    waitMs: a.headers ? waitAskedMs(a.headers) : null,
    paceMs: null,
    timedOut: false
  };
}
async function sendEmail(cfg, request, opts = {}) {
  const wait = opts.wait ?? sleep;
  const now = opts.now ?? Date.now;
  const deadline = now() + Math.min(opts.deadlineMs ?? SEND_DEADLINE_MS, SEND_DEADLINE_MS);
  const left = () => Math.max(0, deadline - now());
  const paced = async (p) => {
    if (p.result.ok && p.paceMs) await wait(Math.min(p.paceMs, LIMIT_WAIT_MAX_MS, left()));
    return p.result;
  };
  const first = await postEmail(cfg, request, Math.min(SEND_TIMEOUT_MS2, left()));
  if (first.timedOut) {
    if (left() < RETRY_NEEDS_MS) return first.result;
    const second = await postEmail(cfg, request, Math.min(SEND_TIMEOUT_MS2, left()));
    const s = second.result;
    if (!s.ok && (s.status === 0 || s.status >= 500 || resendLimitOf(s) === "in_flight"))
      return { ok: false, wamid: null, status: 0, errorBody: "timeout", outcome: "unknown" };
    return paced(second);
  }
  const limit = resendLimitOf(first.result);
  if (limit !== "rate" && limit !== "in_flight") return paced(first);
  const ms = first.waitMs ?? LIMIT_WAIT_DEFAULT_MS;
  if (ms > LIMIT_WAIT_MAX_MS || ms >= left()) return first.result;
  await wait(ms);
  return paced(await postEmail(cfg, request, Math.min(SEND_TIMEOUT_MS2, left())));
}
var RESEND_RECEIVED = `${RESEND_API}/emails/receiving`;
var FETCH_TIMEOUT_MS = 15e3;
async function fetchReceivedEmail(cfg, receivedId) {
  const r = await providerFetch("resend", `${RESEND_RECEIVED}/${encodeURIComponent(receivedId)}`, {
    headers: { Authorization: `Bearer ${cfg.apiKey}` },
    timeoutMs: FETCH_TIMEOUT_MS,
    idempotent: true,
    tries: 2
  });
  if (r.status === 404) return null;
  if (r.status === 0) throw new Error(`resend: received email ${receivedId} could not be read: ${r.error}`);
  const raw = r.text;
  if (r.outcome !== "ok")
    throw new Error(`resend: received email ${receivedId} answered ${r.status}: ${raw.slice(0, 200)}`);
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new Error(`resend: received email ${receivedId} answered something that is not JSON`);
  }
  const email = receivedEmailFrom(body);
  if (!email) throw new Error(`resend: received email ${receivedId} answered a shape that is not an email`);
  return email;
}
var RESEND_DOMAINS = `${RESEND_API}/domains`;
async function fetchMailDomains(cfg) {
  const r = await providerFetch("resend", RESEND_DOMAINS, {
    headers: { Authorization: `Bearer ${cfg.apiKey}` },
    timeoutMs: FETCH_TIMEOUT_MS,
    idempotent: true,
    tries: 2
  });
  if (r.status === 0) throw new Error(`resend: domains could not be read: ${r.error}`);
  const raw = r.text;
  if (r.outcome !== "ok") throw new Error(`resend: domains answered ${r.status}: ${raw.slice(0, 200)}`);
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new Error("resend: domains answered something that is not JSON");
  }
  const domains = mailDomainsFrom(body);
  if (!domains) throw new Error("resend: domains answered a shape that is not a list of domains");
  return domains;
}

// src/email/email-domains.ts
var unquote = (s) => {
  const t = s.trim();
  return t.length >= 2 && t.startsWith('"') && t.endsWith('"') ? t.slice(1, -1) : t;
};
function recordFrom(r) {
  const o = r ?? {};
  const str2 = (k) => typeof o[k] === "string" && o[k].trim() ? o[k] : null;
  const label = str2("record");
  const type = str2("type");
  const name = str2("name");
  const value = str2("value");
  if (!label || !type || !name || !value) return null;
  if (label.toLowerCase() === "tracking") return null;
  return {
    label,
    type: type.toUpperCase(),
    name: name.trim(),
    value: type.toUpperCase() === "TXT" ? unquote(value) : value.trim(),
    priority: typeof o.priority === "number" && Number.isFinite(o.priority) ? o.priority : null,
    status: str2("status")?.trim() ?? "unknown"
  };
}
function providerDomainFrom(body) {
  const d = body ?? {};
  if (typeof d.id !== "string" || !d.id || typeof d.name !== "string" || !d.name) return null;
  const records = Array.isArray(d.records) ? d.records.map(recordFrom).filter((r) => !!r) : [];
  return {
    id: d.id,
    name: d.name.trim().toLowerCase(),
    status: typeof d.status === "string" && d.status.trim() ? d.status.trim() : "unknown",
    records,
    createdAt: typeof d.created_at === "string" && Number.isFinite(Date.parse(d.created_at)) ? d.created_at : null
  };
}
async function resendCall(cfg, method, path, body) {
  const a = await resendRequest(cfg, method, `/domains${path}`, body !== void 0 ? { body } : {});
  return { status: a.status, json: a.json, raw: a.raw };
}
function resendRefusal(status, json, raw) {
  const m = json?.message;
  return {
    ok: false,
    status,
    message: typeof m === "string" && m.trim() ? m.trim() : raw.slice(0, 200) || `HTTP ${status}`
  };
}
async function createMailDomain(cfg, host) {
  const r = await resendCall(cfg, "POST", "", {
    name: host,
    region: "us-east-1",
    open_tracking: false,
    click_tracking: false,
    capabilities: { sending: "enabled", receiving: "disabled" }
  });
  if (r.status < 200 || r.status >= 300) return resendRefusal(r.status, r.json, r.raw);
  const d = providerDomainFrom(r.json);
  return d ? { ok: true, value: d } : { ok: false, status: r.status, message: "the provider answered a shape that is not a domain" };
}
async function getMailDomain(cfg, id) {
  const r = await resendCall(cfg, "GET", `/${encodeURIComponent(id)}`);
  if (r.status === 404) return { ok: true, value: null };
  if (r.status < 200 || r.status >= 300) return resendRefusal(r.status, r.json, r.raw);
  const d = providerDomainFrom(r.json);
  return d ? { ok: true, value: d } : { ok: false, status: r.status, message: "the provider answered a shape that is not a domain" };
}
var FIND_PAGES_MAX = 20;
async function findMailDomain(cfg, name) {
  const want = name.trim().toLowerCase();
  let after = null;
  for (let page = 0; page < FIND_PAGES_MAX; page++) {
    const r = await resendCall(cfg, "GET", `?limit=100${after ? `&after=${encodeURIComponent(after)}` : ""}`);
    if (r.status < 200 || r.status >= 300) return resendRefusal(r.status, r.json, r.raw);
    const body = r.json ?? {};
    if (!Array.isArray(body.data))
      return { ok: false, status: r.status, message: "the provider answered a shape that is not a list" };
    let last = null;
    for (const d of body.data) {
      if (typeof d?.id !== "string") continue;
      last = d.id;
      if (typeof d.name === "string" && d.name.trim().toLowerCase() === want)
        return {
          ok: true,
          value: { id: d.id, name: want, status: typeof d.status === "string" && d.status ? d.status : "unknown" }
        };
    }
    if (body.has_more !== true || !last) return { ok: true, value: null };
    after = last;
  }
  return { ok: false, status: 0, message: `more than ${FIND_PAGES_MAX * 100} domains to look through` };
}
async function verifyMailDomain(cfg, id) {
  const r = await resendCall(cfg, "POST", `/${encodeURIComponent(id)}/verify`);
  if (r.status < 200 || r.status >= 300) return resendRefusal(r.status, r.json, r.raw);
  return { ok: true, value: true };
}
async function removeMailDomain(cfg, id) {
  const r = await resendCall(cfg, "DELETE", `/${encodeURIComponent(id)}`);
  if (r.status === 404) return { ok: true, value: "gone" };
  if (r.status < 200 || r.status >= 300) return resendRefusal(r.status, r.json, r.raw);
  return { ok: true, value: "removed" };
}
function dmarcOf(txt) {
  return txt.some((chunks) => /^v=DMARC1\s*(;|$)/i.test(chunks.join("").trim())) ? "found" : "missing";
}

// src/lines/a2p/wire.ts
var A2P_POLICIES = {
  /** The bundle one customer of an ISV gets. */
  secondaryCustomerProfile: "RNdfbf3fae0e1107f8aded0e7cead80bf5",
  /** The messaging profile a brand is registered from. */
  a2pMessaging: "RNb0d4771c2c98518d916a3d4cd70a8f8b",
  /**
   * A customer with no tax id registers on a PAIR of these instead, and it is
   * a pair -- half of it was here for months and the other half was missing,
   * which is why the path was refused rather than built.
   *
   * Verified against the live Policies API on 2026-09-09, because filing
   * against the wrong policy produces a registration that is refused after it
   * has been paid for:
   *
   *   RN806dd6... "Starter Customer Profile of type Business"
   *   RN670d5d... "Sole Proprietor TrustProduct"
   */
  starterCustomerProfile: "RN806dd6cd175f314e1f96a9727ee271f4",
  soleProprietor: "RN670d5d2e282a6130ae063b234b6019c8"
};
var TRUSTHUB = "https://trusthub.twilio.com/v1";
var MESSAGING2 = "https://messaging.twilio.com/v1";
function encodeForm(form2) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(form2)) {
    if (Array.isArray(v)) v.forEach((one) => q.append(k, one));
    else q.append(k, v);
  }
  return q.toString();
}

// src/lines/a2p/business-record.ts
import { registrationPathOf } from "../../contracts/dist/index.js";
function brandTypeFor(r) {
  return registrationPathOf(r) === "sole_proprietor" ? "SOLE_PROPRIETOR" : "STANDARD";
}

// src/lines/a2p/trust-hub.ts
import { businessTypeOf, companyTypeOf, industryOf } from "../../contracts/dist/index.js";
var attrs = (o) => JSON.stringify(o);
function customerProfileRequest(o) {
  return {
    url: `${TRUSTHUB}/CustomerProfiles`,
    method: "POST",
    form: {
      FriendlyName: o.friendlyName.slice(0, 64),
      // Twilio asks for the ISV's address here, not the customer's: we are
      // the one it writes to about the bundle.
      Email: o.email,
      PolicySid: A2P_POLICIES.secondaryCustomerProfile,
      ...o.statusCallback ? { StatusCallback: o.statusCallback } : {}
    }
  };
}
function starterProfileRequest(o) {
  return {
    url: `${TRUSTHUB}/CustomerProfiles`,
    method: "POST",
    form: {
      FriendlyName: o.friendlyName.slice(0, 64),
      Email: o.email,
      PolicySid: A2P_POLICIES.starterCustomerProfile,
      ...o.statusCallback ? { StatusCallback: o.statusCallback } : {}
    }
  };
}
function starterEndUserRequest(r) {
  return {
    url: `${TRUSTHUB}/EndUsers`,
    method: "POST",
    form: {
      FriendlyName: `${r.contactFirstName} ${r.contactLastName}`.trim().slice(0, 64),
      Type: "starter_customer_profile_information",
      Attributes: attrs({
        first_name: r.contactFirstName,
        last_name: r.contactLastName,
        email: r.contactEmail,
        phone_number: r.contactPhone
      })
    }
  };
}
function soleProprietorProfileRequest(o) {
  return {
    url: `${TRUSTHUB}/TrustProducts`,
    method: "POST",
    form: {
      FriendlyName: o.friendlyName.slice(0, 64),
      Email: o.email,
      PolicySid: A2P_POLICIES.soleProprietor,
      ...o.statusCallback ? { StatusCallback: o.statusCallback } : {}
    }
  };
}
function soleProprietorEndUserRequest(r, industry) {
  return {
    url: `${TRUSTHUB}/EndUsers`,
    method: "POST",
    form: {
      FriendlyName: `${r.tradeName || r.legalName} \xB7 sole proprietor`.slice(0, 64),
      Type: "sole_proprietor_information",
      Attributes: attrs({
        brand_name: r.tradeName || r.legalName,
        mobile_phone_number: r.contactPhone,
        vertical: industry
      })
    }
  };
}
function businessEndUserRequest(r) {
  return {
    url: `${TRUSTHUB}/EndUsers`,
    method: "POST",
    form: {
      FriendlyName: `${r.legalName} \xB7 business`.slice(0, 64),
      Type: "customer_profile_business_information",
      Attributes: attrs({
        business_name: r.legalName,
        social_media_profile_urls: "",
        website_url: r.websiteUrl,
        business_regions_of_operation: "USA_AND_CANADA",
        business_type: businessTypeOf(r.businessType),
        business_registration_identifier: "EIN",
        business_identity: "direct_customer",
        business_industry: industryOf(r.industry),
        business_registration_number: r.ein ?? ""
      })
    }
  };
}
function representativeEndUserRequest(r) {
  return {
    url: `${TRUSTHUB}/EndUsers`,
    method: "POST",
    form: {
      FriendlyName: `${r.contactFirstName} ${r.contactLastName}`.slice(0, 64),
      Type: "authorized_representative_1",
      Attributes: attrs({
        job_position: r.contactJobPosition,
        last_name: r.contactLastName,
        phone_number: r.contactPhone,
        first_name: r.contactFirstName,
        email: r.contactEmail,
        business_title: r.contactTitle
      })
    }
  };
}
function addressRequest(accountSid, r) {
  return {
    url: `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Addresses.json`,
    method: "POST",
    form: {
      FriendlyName: r.legalName.slice(0, 64),
      CustomerName: r.legalName.slice(0, 64),
      Street: r.street,
      ...r.streetSecondary ? { StreetSecondary: r.streetSecondary } : {},
      City: r.city,
      Region: r.region,
      PostalCode: r.postalCode,
      IsoCountry: r.country
    }
  };
}
function supportingDocumentRequest(o) {
  return {
    url: `${TRUSTHUB}/SupportingDocuments`,
    method: "POST",
    form: {
      FriendlyName: `${o.legalName} \xB7 address`.slice(0, 64),
      Type: "customer_profile_address",
      Attributes: attrs({ address_sids: o.addressSid })
    }
  };
}
function updateEndUserRequest(sid2, attributes) {
  return { url: `${TRUSTHUB}/EndUsers/${sid2}`, method: "POST", form: { Attributes: attrs(attributes) } };
}
var parsed = (req) => JSON.parse(String(req.form?.Attributes ?? "{}"));
function businessAttributes(r) {
  return parsed(businessEndUserRequest(r));
}
function starterAttributes(r) {
  return parsed(starterEndUserRequest(r));
}
function representativeAttributes(r) {
  return parsed(representativeEndUserRequest(r));
}
function assignRequest(bundleSid, objectSid) {
  return {
    url: `${TRUSTHUB}/CustomerProfiles/${bundleSid}/EntityAssignments`,
    method: "POST",
    form: { ObjectSid: objectSid }
  };
}
function trustProductAssignRequest(bundleSid, objectSid) {
  return {
    url: `${TRUSTHUB}/TrustProducts/${bundleSid}/EntityAssignments`,
    method: "POST",
    form: { ObjectSid: objectSid }
  };
}
function evaluateRequest(bundleSid, policySid = A2P_POLICIES.secondaryCustomerProfile) {
  return {
    url: `${TRUSTHUB}/CustomerProfiles/${bundleSid}/Evaluations`,
    method: "POST",
    form: { PolicySid: policySid }
  };
}
function submitProfileRequest(bundleSid) {
  return { url: `${TRUSTHUB}/CustomerProfiles/${bundleSid}`, method: "POST", form: { Status: "pending-review" } };
}
function a2pProfileRequest(o) {
  return {
    url: `${TRUSTHUB}/TrustProducts`,
    method: "POST",
    form: {
      FriendlyName: `${o.friendlyName} \xB7 A2P`.slice(0, 64),
      Email: o.email,
      PolicySid: A2P_POLICIES.a2pMessaging,
      ...o.statusCallback ? { StatusCallback: o.statusCallback } : {}
    }
  };
}
function a2pProfileEndUserRequest(o) {
  const companyType = companyTypeOf(o.companyType);
  return {
    url: `${TRUSTHUB}/EndUsers`,
    method: "POST",
    form: {
      FriendlyName: `${o.friendlyName} \xB7 A2P`.slice(0, 64),
      Type: "us_a2p_messaging_profile_information",
      Attributes: attrs({ company_type: companyType })
    }
  };
}
function evaluateTrustProductRequest(bundleSid) {
  return {
    url: `${TRUSTHUB}/TrustProducts/${bundleSid}/Evaluations`,
    method: "POST",
    form: { PolicySid: A2P_POLICIES.a2pMessaging }
  };
}
function submitTrustProductRequest(bundleSid) {
  return { url: `${TRUSTHUB}/TrustProducts/${bundleSid}`, method: "POST", form: { Status: "pending-review" } };
}

// src/lines/a2p/brand-campaign.ts
function brandRequest(o) {
  return {
    url: `${MESSAGING2}/a2p/BrandRegistrations`,
    method: "POST",
    form: {
      CustomerProfileBundleSid: o.customerProfileBundleSid,
      A2PProfileBundleSid: o.a2pProfileBundleSid,
      BrandType: o.brandType,
      ...o.skipVetting ? { SkipAutomaticSecVet: "true" } : {},
      ...o.mock ? { Mock: "true" } : {}
    }
  };
}
function keywordsFor(words) {
  return words.map((w) => w.trim()).filter((w) => /^[A-Za-z0-9]+$/.test(w));
}
var LOW_VOLUME_USECASE = "LOW_VOLUME";
function campaignRequest(f) {
  const form2 = {
    BrandRegistrationSid: f.brandSid,
    Description: f.description,
    MessageFlow: f.messageFlow,
    UsAppToPersonUsecase: f.useCase,
    HasEmbeddedLinks: "true",
    HasEmbeddedPhone: "true",
    SubscriberOptIn: "true",
    AgeGated: "false",
    DirectLending: "false",
    OptInMessage: f.optInMessage,
    PrivacyPolicyUrl: f.privacyPolicyUrl,
    TermsAndConditionsUrl: f.termsUrl
  };
  form2.MessageSamples = f.samples.slice(0, 5);
  const keywords = keywordsFor(f.optInKeywords);
  if (keywords.length) form2.OptInKeywords = keywords;
  else delete form2.OptInMessage;
  return { url: `${MESSAGING2}/Services/${f.messagingServiceSid}/Compliance/Usa2p`, method: "POST", form: form2 };
}
function updateCampaignRequest(messagingServiceSid, campaignSid, f) {
  const form2 = {
    Description: f.description,
    MessageFlow: f.messageFlow,
    HasEmbeddedLinks: "true",
    HasEmbeddedPhone: "true",
    AgeGated: "false",
    DirectLending: "false",
    PrivacyPolicyUrl: f.privacyPolicyUrl,
    TermsAndConditionsUrl: f.termsUrl
  };
  form2.MessageSamples = f.samples.slice(0, 5);
  return { url: `${MESSAGING2}/Services/${messagingServiceSid}/Compliance/Usa2p/${campaignSid}`, method: "POST", form: form2 };
}
function deleteCampaignRequest(messagingServiceSid, campaignSid) {
  return { url: `${MESSAGING2}/Services/${messagingServiceSid}/Compliance/Usa2p/${campaignSid}`, method: "DELETE" };
}

// src/lines/a2p/steps.ts
var A2P_STEPS = [
  "profile",
  "business",
  "representative",
  "address",
  "document",
  "primary",
  "submit",
  "a2p_profile",
  "brand",
  "campaign"
];
var EMPTY_A2P_STATE = {
  profileSid: null,
  businessSid: null,
  representativeSid: null,
  addressSid: null,
  documentSid: null,
  primaryAssigned: false,
  profileSubmitted: false,
  a2pProfileSid: null,
  brandSid: null,
  campaignSid: null
};
function nextA2PStep(s, brandType = "STANDARD") {
  if (brandType === "SOLE_PROPRIETOR") {
    if (!s.profileSid) return "profile";
    if (!s.businessSid) return "business";
    if (!s.addressSid) return "address";
    if (!s.documentSid) return "document";
    if (!s.primaryAssigned) return "primary";
    if (!s.profileSubmitted) return "submit";
    if (!s.a2pProfileSid) return "a2p_profile";
    if (!s.brandSid) return "brand";
    if (!s.campaignSid) return "campaign";
    return null;
  }
  if (!s.profileSid) return "profile";
  if (!s.businessSid) return "business";
  if (!s.representativeSid) return "representative";
  if (!s.addressSid) return "address";
  if (!s.documentSid) return "document";
  if (!s.primaryAssigned) return "primary";
  if (!s.profileSubmitted) return "submit";
  if (!s.a2pProfileSid) return "a2p_profile";
  if (!s.brandSid) return "brand";
  if (!s.campaignSid) return "campaign";
  return null;
}

// src/lines/a2p/verdict.ts
function isBrandNotReady(error) {
  return /until Brand is registered|Brand.*Current status:\s*(IN_PROGRESS|PENDING)/i.test(error);
}
var PREAMBLE = /^the campaign submission has been reviewed and (?:it was )?rejected because\s*(?:of\s*)?/i;
function refusalWords(o) {
  const parts = [];
  const brand = (o.brandFailureReason ?? "").trim();
  if (brand) parts.push(brand);
  for (const e of o.campaignErrors ?? []) {
    const said = String(e?.description ?? "");
    const body = said.replace(PREAMBLE, "").trim().replace(/\.$/, "").trim();
    if (!body) continue;
    const tags = [e?.error_code == null ? null : String(e.error_code), ...e?.fields ?? []].filter(Boolean);
    parts.push(tags.length ? `${body} (${tags.join(" \xB7 ")})` : body);
  }
  if (!parts.length) return null;
  return parts.join("; ");
}
function smsStateFor(o) {
  const brand = (o.brandStatus ?? "").toUpperCase();
  const campaign = (o.campaignStatus ?? "").toUpperCase();
  if (brand === "FAILED" || campaign === "FAILED") return "rejected";
  if (brand === "SUSPENDED") return "failed";
  if (campaign === "VERIFIED") return o.mock ? "approved" : "active";
  if (brand === "APPROVED") return "approved";
  return "registering";
}
function registrationVerdict(before, after, o) {
  if (before === after) return null;
  const num = o.number ?? "your line";
  const rehearsal = o.mock ? " (this was a test filing, so nothing routes)" : "";
  if (after === "active") {
    return {
      kind: "number",
      title: `Texting is on: ${num}`,
      body: `The carriers approved ${num}, so the receptionist answers texts to it inside your hours${rehearsal}. Customers who text first are answered; offers go only to people who said yes.`,
      route: "admin/integrations",
      event: "line.texting_on"
    };
  }
  if (after === "approved") {
    return {
      kind: "number",
      title: "Your business is approved by the carriers",
      body: `${num} is through the slow half. One last check on the line is left, usually days; nothing is needed from you, and texting switches itself on when it clears.`,
      route: "admin/integrations",
      event: "line.texting_approved"
    };
  }
  if (after === "rejected") {
    return {
      kind: "alert",
      title: "The carriers sent your texting registration back",
      body: `${o.reason ? `They said: ${o.reason}. ` : ""}Open Connections, correct your business on record, and file it again. Calls and WhatsApp are unaffected.`,
      route: "admin/integrations",
      event: "line.texting_rejected"
    };
  }
  if (after === "failed") {
    return {
      kind: "alert",
      title: "Your texting registration stopped",
      body: `${o.reason ? `The carriers said: ${o.reason}. ` : ""}A person at Chanlytics has it \u2014 there is nothing for you to do. Calls and WhatsApp are unaffected.`,
      route: "admin/integrations",
      event: "line.texting_rejected"
    };
  }
  return null;
}

// src/lines/a2p-saga.ts
var sid = (a) => typeof a.body?.sid === "string" ? a.body.sid : null;
function twilioRefusal(a, what) {
  const msg = typeof a.body?.message === "string" ? a.body.message : `HTTP ${a.status}`;
  const code = typeof a.body?.code === "number" ? ` (Twilio ${a.body.code})` : "";
  return `${what}: ${msg}${code}`;
}
var ok = (a) => a.status >= 200 && a.status < 300;
async function runA2PSaga(start, p) {
  let state = { ...EMPTY_A2P_STATE, ...start };
  const save = async (patch) => {
    state = { ...state, ...patch };
    await p.save(patch);
  };
  const need2 = async (req, what) => {
    const a = await p.send(req);
    const id = sid(a);
    if (!ok(a) || !id) throw new Error(twilioRefusal(a, what));
    return id;
  };
  const brandType = brandTypeFor(p.record);
  const soleProp = brandType === "SOLE_PROPRIETOR";
  let step = null;
  try {
    while ((step = nextA2PStep(state, brandType)) !== null) {
      switch (step) {
        case "profile":
          await save({
            profileSid: await need2(
              (soleProp ? starterProfileRequest : customerProfileRequest)({
                friendlyName: p.workspace.name,
                email: p.email,
                statusCallback: p.statusCallback
              }),
              "creating the customer's profile"
            )
          });
          break;
        case "business": {
          const id = await need2(
            soleProp ? starterEndUserRequest(p.record) : businessEndUserRequest(p.record),
            soleProp ? "recording who you are" : "recording the business"
          );
          const a = await p.send(assignRequest(state.profileSid, id));
          if (!ok(a)) throw new Error(twilioRefusal(a, soleProp ? "attaching your details" : "attaching the business"));
          await save({ businessSid: id });
          break;
        }
        case "representative": {
          const id = await need2(representativeEndUserRequest(p.record), "recording the person who signs");
          const a = await p.send(assignRequest(state.profileSid, id));
          if (!ok(a)) throw new Error(twilioRefusal(a, "attaching the person who signs"));
          await save({ representativeSid: id });
          break;
        }
        case "address":
          await save({ addressSid: await need2(addressRequest(p.accountSid, p.record), "recording the address") });
          break;
        case "document": {
          const id = await need2(
            supportingDocumentRequest({ legalName: p.record.legalName, addressSid: state.addressSid }),
            "attaching the address"
          );
          const a = await p.send(assignRequest(state.profileSid, id));
          if (!ok(a)) throw new Error(twilioRefusal(a, "attaching the address document"));
          await save({ documentSid: id });
          break;
        }
        case "primary": {
          const a = await p.send(assignRequest(state.profileSid, p.primaryProfileSid));
          if (!ok(a)) throw new Error(twilioRefusal(a, "naming us as the provider"));
          await save({ primaryAssigned: true });
          break;
        }
        case "submit": {
          const refresh = soleProp ? [[state.businessSid, starterAttributes(p.record)]] : [
            [state.businessSid, businessAttributes(p.record)],
            [state.representativeSid, representativeAttributes(p.record)]
          ];
          for (const [sid2, a] of refresh) {
            const up = await p.send(updateEndUserRequest(sid2, a));
            if (!ok(up)) throw new Error(twilioRefusal(up, "refreshing the business on record"));
          }
          const ev = await p.send(
            evaluateRequest(
              state.profileSid,
              soleProp ? A2P_POLICIES.starterCustomerProfile : A2P_POLICIES.secondaryCustomerProfile
            )
          );
          const status = typeof ev.body?.status === "string" ? ev.body.status : "";
          if (!ok(ev)) throw new Error(twilioRefusal(ev, "checking the profile"));
          if (status !== "compliant")
            throw new Error(
              `the profile is not complete yet: ${JSON.stringify(ev.body?.results ?? ev.body).slice(0, 300)}`
            );
          const sub = await p.send(submitProfileRequest(state.profileSid));
          if (!ok(sub)) throw new Error(twilioRefusal(sub, "submitting the profile"));
          await save({ profileSubmitted: true });
          break;
        }
        case "a2p_profile": {
          const bundle = await need2(
            (soleProp ? soleProprietorProfileRequest : a2pProfileRequest)({
              friendlyName: p.workspace.name,
              email: p.email,
              statusCallback: p.statusCallback
            }),
            "creating the messaging profile"
          );
          const endUser = await need2(
            soleProp ? soleProprietorEndUserRequest(p.record, p.industry) : a2pProfileEndUserRequest({ friendlyName: p.workspace.name, companyType: p.record.companyType }),
            soleProp ? "recording your mobile for the carriers' code" : "recording the company type"
          );
          for (const objectSid of [endUser, state.profileSid]) {
            const a = await p.send(trustProductAssignRequest(bundle, objectSid));
            if (!ok(a)) throw new Error(twilioRefusal(a, "attaching to the messaging profile"));
          }
          const ev = await p.send(evaluateTrustProductRequest(bundle));
          if (!ok(ev)) throw new Error(twilioRefusal(ev, "checking the messaging profile"));
          const sub = await p.send(submitTrustProductRequest(bundle));
          if (!ok(sub)) throw new Error(twilioRefusal(sub, "submitting the messaging profile"));
          await save({ a2pProfileSid: bundle });
          break;
        }
        case "brand":
          await save({
            brandSid: await need2(
              brandRequest({
                customerProfileBundleSid: state.profileSid,
                a2pProfileBundleSid: state.a2pProfileSid,
                brandType: brandTypeFor(p.record),
                mock: p.mock,
                skipVetting: p.skipVetting
              }),
              "registering the brand"
            )
          });
          break;
        case "campaign":
          await save({
            campaignSid: await need2(
              campaignRequest({
                ...p.campaign,
                brandSid: state.brandSid,
                messagingServiceSid: p.messagingServiceSid,
                useCase: p.useCase
              }),
              "registering the campaign"
            )
          });
          break;
      }
    }
    return { ok: true, state };
  } catch (e) {
    const error = (e instanceof Error ? e.message : String(e)).slice(0, 500);
    return {
      ok: false,
      step: step ?? nextA2PStep(state) ?? "profile",
      error,
      pending: isBrandNotReady(error),
      state
    };
  }
}

// src/google/google-places.ts
import {
  E164 as E1642,
  finiteOrNull,
  nonBlankOrNull,
  recordOrNull
} from "../../contracts/dist/index.js";
var PLACES_BASE = "https://places.googleapis.com/v1";
var PLACES_SEARCH_MASK = "places.id,places.displayName,places.formattedAddress,places.googleMapsUri,places.businessStatus,places.primaryTypeDisplayName";
var PLACES_DETAILS_MASK = "id,displayName,formattedAddress,googleMapsUri,businessStatus,rating,userRatingCount,reviews,regularOpeningHours,internationalPhoneNumber,nationalPhoneNumber,websiteUri,primaryType,primaryTypeDisplayName,pureServiceAreaBusiness,timeZone";
var PLACES_SEARCH_LIMIT = 5;
var PLACES_TIMEOUT_MS = 1e4;
var PlacesError = class extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
    this.name = "PlacesError";
  }
  status;
};
function headers(key, mask, json = false) {
  return { "X-Goog-Api-Key": key, "X-Goog-FieldMask": mask, ...json ? { "Content-Type": "application/json" } : {} };
}
function placesSearchRequest(key, query, opts = {}) {
  const pageSize = Math.max(1, Math.min(20, opts.limit ?? PLACES_SEARCH_LIMIT));
  return {
    url: `${PLACES_BASE}/places:searchText`,
    method: "POST",
    headers: headers(key, PLACES_SEARCH_MASK, true),
    body: JSON.stringify({ textQuery: query, pageSize, languageCode: opts.languageCode ?? "en" })
  };
}
function placesDetailsRequest(key, placeId, opts = {}) {
  const q = new URLSearchParams({ languageCode: opts.languageCode ?? "en" });
  return {
    url: `${PLACES_BASE}/places/${encodeURIComponent(placeId)}?${q.toString()}`,
    method: "GET",
    headers: headers(key, PLACES_DETAILS_MASK)
  };
}
var localized = (v) => {
  const o = recordOrNull(v);
  return { text: nonBlankOrNull(o?.text), languageCode: nonBlankOrNull(o?.languageCode) };
};
function candidateOf(p) {
  const id = nonBlankOrNull(p.id);
  const name = localized(p.displayName).text;
  if (!id || !name) return null;
  return {
    place_id: id,
    name,
    address: nonBlankOrNull(p.formattedAddress),
    maps_uri: nonBlankOrNull(p.googleMapsUri),
    business_status: nonBlankOrNull(p.businessStatus),
    category: localized(p.primaryTypeDisplayName).text
  };
}
function reviewIdOf(name) {
  const s = nonBlankOrNull(name);
  if (!s) return null;
  const last = s.split("/").pop();
  return last && last.length > 0 ? last : null;
}
function reviewOf(r) {
  const id = reviewIdOf(r.name);
  if (!id) return null;
  const author = recordOrNull(r.authorAttribution);
  const text = localized(r.text);
  return {
    review_id: id,
    rating: finiteOrNull(r.rating),
    author: nonBlankOrNull(author?.displayName),
    author_uri: nonBlankOrNull(author?.uri),
    author_photo_uri: nonBlankOrNull(author?.photoUri),
    text: text.text,
    language_code: text.languageCode,
    published_at: nonBlankOrNull(r.publishTime),
    maps_uri: nonBlankOrNull(r.googleMapsUri)
  };
}
function pointOf(v) {
  const o = recordOrNull(v);
  if (!o) return null;
  const day = finiteOrNull(o.day) ?? 0;
  const hour = finiteOrNull(o.hour) ?? 0;
  const minute = finiteOrNull(o.minute) ?? 0;
  return day >= 0 && day <= 6 && hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59 ? { day, hour, minute } : null;
}
function periodOf(v) {
  const o = recordOrNull(v);
  const open = pointOf(o?.open);
  if (!o || !open) return null;
  if (o.close === void 0) return { open, close: null };
  const close = pointOf(o.close);
  return close ? { open, close } : null;
}
function e164Of(international) {
  if (!international || !international.trim().startsWith("+")) return null;
  const e164 = `+${international.replace(/\D/g, "")}`;
  return E1642.test(e164) ? e164 : null;
}
function listingFactsOf(p) {
  const periods = recordOrNull(p.regularOpeningHours)?.periods;
  return {
    hours: Array.isArray(periods) ? periods.map(periodOf).filter((x) => x !== null) : null,
    phone_e164: e164Of(nonBlankOrNull(p.internationalPhoneNumber)),
    phone_display: nonBlankOrNull(p.nationalPhoneNumber),
    website: nonBlankOrNull(p.websiteUri),
    primary_type: nonBlankOrNull(p.primaryType),
    primary_type_label: localized(p.primaryTypeDisplayName).text,
    service_area_only: p.pureServiceAreaBusiness === true,
    time_zone: nonBlankOrNull(recordOrNull(p.timeZone)?.id)
  };
}
function parsePlacesSearch(json) {
  const places = recordOrNull(json)?.places;
  if (!Array.isArray(places)) return [];
  return places.map((p) => recordOrNull(p) ? candidateOf(recordOrNull(p)) : null).filter((c) => c !== null);
}
function parsePlaceDetails(json) {
  const p = recordOrNull(json);
  const id = nonBlankOrNull(p?.id);
  const name = localized(p?.displayName).text;
  if (!p || !id || !name) throw new PlacesError(502, "Google answered without a place");
  const reviews = Array.isArray(p.reviews) ? p.reviews.map((r) => recordOrNull(r) ? reviewOf(recordOrNull(r)) : null).filter((r) => r !== null) : [];
  return {
    place_id: id,
    name,
    address: nonBlankOrNull(p.formattedAddress),
    maps_uri: nonBlankOrNull(p.googleMapsUri),
    business_status: nonBlankOrNull(p.businessStatus),
    rating: finiteOrNull(p.rating),
    review_count: finiteOrNull(p.userRatingCount),
    reviews,
    facts: listingFactsOf(p)
  };
}
function refusal(status, body) {
  let message = `Google answered ${status}`;
  try {
    const e = recordOrNull(recordOrNull(JSON.parse(body))?.error);
    const m = nonBlankOrNull(e?.message);
    const s = nonBlankOrNull(e?.status);
    if (m) message = s ? `${s}: ${m}` : m;
  } catch {
  }
  return new PlacesError(status, message);
}
async function call(http2, req) {
  const r = await http2(req);
  if (r.status < 200 || r.status >= 300) throw refusal(r.status, r.body);
  try {
    return JSON.parse(r.body);
  } catch {
    throw new PlacesError(502, "Google answered with something other than JSON");
  }
}
async function searchPlaces(http2, key, query, opts = {}) {
  return parsePlacesSearch(await call(http2, placesSearchRequest(key, query, opts)));
}
async function getPlace(http2, key, placeId, opts = {}) {
  return parsePlaceDetails(await call(http2, placesDetailsRequest(key, placeId, opts)));
}
function placesFetch(fetchImpl = fetch, timeoutMs = PLACES_TIMEOUT_MS) {
  return async (req) => {
    const a = await providerFetch(
      "google",
      req.url,
      {
        method: req.method,
        headers: req.headers,
        body: req.body,
        timeoutMs,
        ...req.method === "GET" ? { idempotent: true, tries: 2 } : {}
      },
      { fetch: fetchImpl }
    );
    if (a.status === 0) throw new Error(`google: ${a.error ?? "no answer"}`);
    return { status: a.status, body: a.text };
  };
}
var PLACE_ID = /^[A-Za-z0-9_-]{10,300}$/;

// src/google/google-sync.ts
import { plural, ratingWords, reviewSnippet, starsOf, DAY_MS } from "../../contracts/dist/index.js";
var REVIEW_BELL_MAX = 3;
var FRESH_SLACK_MS = 2 * DAY_MS;
function overall(rating, count) {
  return `${ratingWords(rating)} overall${typeof count === "number" ? ` \xB7 ${plural(count, "review")}` : ""}`;
}
function reviewBells(news, counted, listing) {
  if (news.length > 0 && news.length <= REVIEW_BELL_MAX) {
    return news.map((r) => ({
      title: `New on Google: ${starsOf(r.rating)} from ${r.author?.trim() || "a customer"}`,
      body: `${r.text?.trim() ? `\u201C${reviewSnippet(r.text, 280)}\u201D` : "A rating without words."}
${overall(listing.rating, listing.review_count)}.`,
      review_id: r.review_id
    }));
  }
  if (news.length > REVIEW_BELL_MAX) {
    const who = news.map((r) => r.author?.trim() || "a customer").slice(0, 5).join(", ");
    return [
      {
        title: `${news.length} new reviews on Google`,
        body: `From ${who}${news.length > 5 ? " and others" : ""}. ${overall(listing.rating, listing.review_count)}. The words are on Reports.`,
        review_id: null
      }
    ];
  }
  if (counted > 0) {
    return [
      {
        title: `${plural(counted, "new rating")} on Google`,
        body: `${overall(listing.rating, listing.review_count)}. Google shows the words of its five most relevant reviews; a rating outside them counts without its words.`,
        review_id: null
      }
    ];
  }
  return [];
}
function writtenSince(at, sinceMs) {
  const t = at ? Date.parse(at) : NaN;
  return !Number.isNaN(t) && t >= sinceMs - FRESH_SLACK_MS;
}
function planListingCheck(before, knownIds, fresh, day, nowMs, opts = {}) {
  const now = new Date(nowMs).toISOString();
  const first = !before.checked_at;
  const sinceMs = before.checked_at ? Date.parse(before.checked_at) : NaN;
  const carriesReviews = opts.reviews !== false;
  const unseen = carriesReviews ? fresh.reviews.filter((r) => !knownIds.has(r.review_id)) : [];
  const news = first || Number.isNaN(sinceMs) ? [] : unseen.filter((r) => writtenSince(r.published_at, sinceMs));
  const counted = first || typeof before.review_count !== "number" || typeof fresh.review_count !== "number" ? 0 : Math.max(0, fresh.review_count - before.review_count);
  return {
    listing: {
      name: fresh.name,
      address: fresh.address,
      maps_uri: fresh.maps_uri,
      business_status: fresh.business_status,
      rating: fresh.rating,
      review_count: fresh.review_count,
      checked_at: now,
      check_error: null,
      facts: fresh.facts
    },
    day: { day, rating: fresh.rating, review_count: fresh.review_count ?? 0 },
    reviews: carriesReviews ? fresh.reviews.map((r) => ({ ...r, last_seen_at: now })) : [],
    fresh: news,
    counted,
    bells: carriesReviews ? reviewBells(news, counted, fresh) : []
  };
}
function planProfileSync(before, known, page, day, nowMs) {
  const now = new Date(nowMs).toISOString();
  const first = !before.last_synced_at;
  const sinceMs = before.last_synced_at ? Date.parse(before.last_synced_at) : NaN;
  const unseen = page.reviews.filter((r) => !known.has(r.review_id));
  const news = first || Number.isNaN(sinceMs) ? [] : unseen.filter((r) => writtenSince(r.created_at, sinceMs));
  const replied = page.reviews.filter((r) => {
    const k = known.get(r.review_id);
    return !!k && !!r.reply_text && r.reply_text !== k.reply_text;
  }).map((r) => r.review_id);
  const rating = page.average_rating;
  const count = page.total_count;
  const listing = typeof count === "number" || typeof rating === "number" ? {
    rating: typeof rating === "number" ? Math.round(rating * 10) / 10 : null,
    review_count: count,
    checked_at: now,
    check_error: null
  } : null;
  return {
    listing,
    day: typeof count === "number" ? { day, rating: listing?.rating ?? null, review_count: count } : null,
    reviews: page.reviews.map((r) => ({ ...r, last_seen_at: now })),
    fresh: news,
    replied,
    bells: reviewBells(news, 0, { rating: listing?.rating ?? null, review_count: count }),
    synced_at: now
  };
}

// src/google/google-oauth.ts
import { MIN_MS, utf8Bytes as utf8Bytes2 } from "../../contracts/dist/index.js";
var GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
var GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
var GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
var PROFILE_SCOPES = ["openid", "email", "https://www.googleapis.com/auth/business.manage"];
var STATE_TTL_MS = 10 * MIN_MS;
function authorizeUrl(cfg, state, loginHint) {
  const q = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: "code",
    scope: PROFILE_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "false",
    state
  });
  if (loginHint) q.set("login_hint", loginHint);
  return `${GOOGLE_AUTH_URL}?${q.toString()}`;
}
var form = (params) => new URLSearchParams(params).toString();
var FORM = { "Content-Type": "application/x-www-form-urlencoded" };
function tokenExchangeRequest(cfg, code) {
  return {
    url: GOOGLE_TOKEN_URL,
    method: "POST",
    headers: FORM,
    body: form({
      code,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uri: cfg.redirectUri,
      grant_type: "authorization_code"
    })
  };
}
function tokenRefreshRequest(cfg, refreshToken) {
  return {
    url: GOOGLE_TOKEN_URL,
    method: "POST",
    headers: FORM,
    body: form({
      refresh_token: refreshToken,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      grant_type: "refresh_token"
    })
  };
}
function revokeRequest(token) {
  return { url: GOOGLE_REVOKE_URL, method: "POST", headers: FORM, body: form({ token }) };
}
function parseTokenResponse(json) {
  const o = json && typeof json === "object" ? json : {};
  const access = typeof o.access_token === "string" ? o.access_token : "";
  if (!access)
    throw new Error(
      typeof o.error === "string" ? `${o.error}${typeof o.error_description === "string" ? `: ${o.error_description}` : ""}` : "Google answered without a token"
    );
  return {
    access_token: access,
    refresh_token: typeof o.refresh_token === "string" && o.refresh_token ? o.refresh_token : null,
    expires_in: typeof o.expires_in === "number" ? o.expires_in : 3600,
    scope: typeof o.scope === "string" ? o.scope : "",
    id_token: typeof o.id_token === "string" ? o.id_token : null
  };
}
function grantHasScope(grant, scope) {
  return grant.scope.split(/\s+/).includes(scope);
}
var dec = new TextDecoder();
function b64url(bytes) {
  const b = typeof bytes === "string" ? utf8Bytes2(bytes) : bytes;
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function unb64url(s) {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - s.length % 4);
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function idTokenClaims(idToken) {
  try {
    const payload = (idToken ?? "").split(".")[1];
    if (payload === void 0) return { email: null, sub: null };
    const c = JSON.parse(dec.decode(unb64url(payload)));
    return { email: typeof c.email === "string" ? c.email : null, sub: typeof c.sub === "string" ? c.sub : null };
  } catch {
    return { email: null, sub: null };
  }
}
async function hmac(secret, data) {
  const key = await crypto.subtle.importKey("raw", utf8Bytes2(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign"
  ]);
  const sig = await crypto.subtle.sign("HMAC", key, utf8Bytes2(data));
  return b64url(new Uint8Array(sig));
}
async function signState(secret, s) {
  const payload = b64url(JSON.stringify(s));
  return `${payload}.${await hmac(secret, payload)}`;
}
async function verifyState(secret, state, nowMs) {
  if (!state) return { ok: false, reason: "missing" };
  const [payload, sig, ...rest] = state.split(".");
  if (!payload || !sig || rest.length) return { ok: false, reason: "malformed" };
  const expected = await hmac(secret, payload);
  if (expected.length !== sig.length || !timingSafeEqualStr(expected, sig)) return { ok: false, reason: "signature" };
  let s;
  try {
    s = JSON.parse(dec.decode(unb64url(payload)));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (typeof s.t !== "string" || typeof s.u !== "string" || typeof s.n !== "string" || typeof s.exp !== "number")
    return { ok: false, reason: "malformed" };
  if (s.exp < nowMs) return { ok: false, reason: "expired" };
  return { ok: true, state: s };
}
function timingSafeEqualStr(a, b) {
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
function newNonce() {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return b64url(b);
}

// src/google/google-profile.ts
import { nonBlankOrNull as nonBlankOrNull2, recordOrNull as recordOrNull2 } from "../../contracts/dist/index.js";
var GBP_ACCOUNTS_URL = "https://mybusinessaccountmanagement.googleapis.com/v1/accounts";
var GBP_INFO_BASE = "https://mybusinessbusinessinformation.googleapis.com/v1";
var GBP_V4_BASE = "https://mybusiness.googleapis.com/v4";
var GBP_LOCATIONS_READ_MASK = "name,title,storefrontAddress,metadata";
var GBP_REVIEWS_PAGE = 50;
var GBP_REVIEWS_MAX_PAGES = 5;
function bearer(token, v4 = false) {
  return { Authorization: `Bearer ${token}`, ...v4 ? { "X-GOOG-API-FORMAT-VERSION": "2" } : {} };
}
function accountsRequest(token, pageToken) {
  const q = new URLSearchParams({ pageSize: "20" });
  if (pageToken) q.set("pageToken", pageToken);
  return { url: `${GBP_ACCOUNTS_URL}?${q.toString()}`, method: "GET", headers: bearer(token) };
}
function locationsRequest(token, accountName, pageToken) {
  const q = new URLSearchParams({ readMask: GBP_LOCATIONS_READ_MASK, pageSize: "100" });
  if (pageToken) q.set("pageToken", pageToken);
  return { url: `${GBP_INFO_BASE}/${accountName}/locations?${q.toString()}`, method: "GET", headers: bearer(token) };
}
function reviewParent(accountName, locationName) {
  const loc = locationName.startsWith("locations/") ? locationName.slice("locations/".length) : locationName;
  return `${accountName}/locations/${loc}`;
}
function reviewsRequest(token, parent, pageToken) {
  const q = new URLSearchParams({ pageSize: String(GBP_REVIEWS_PAGE), orderBy: "updateTime desc" });
  if (pageToken) q.set("pageToken", pageToken);
  return { url: `${GBP_V4_BASE}/${parent}/reviews?${q.toString()}`, method: "GET", headers: bearer(token, true) };
}
function replyRequest(token, reviewName, comment) {
  return {
    url: `${GBP_V4_BASE}/${reviewName}/reply`,
    method: "PUT",
    headers: { ...bearer(token, true), "Content-Type": "application/json" },
    body: JSON.stringify({ comment })
  };
}
function deleteReplyRequest(token, reviewName) {
  return { url: `${GBP_V4_BASE}/${reviewName}/reply`, method: "DELETE", headers: bearer(token, true) };
}
function parseAccounts(json) {
  const o = recordOrNull2(json);
  const list = Array.isArray(o?.accounts) ? o.accounts : [];
  const accounts = list.map((a) => recordOrNull2(a)).filter((a) => !!a).map((a) => ({
    name: nonBlankOrNull2(a.name) ?? "",
    title: nonBlankOrNull2(a.accountName) ?? nonBlankOrNull2(recordOrNull2(a.organizationInfo)?.registeredDomain) ?? nonBlankOrNull2(a.name) ?? "",
    type: nonBlankOrNull2(a.type)
  })).filter((a) => a.name.startsWith("accounts/"));
  return { accounts, next: nonBlankOrNull2(o?.nextPageToken) };
}
function oneLineAddress(a) {
  const o = recordOrNull2(a);
  if (!o) return null;
  const lines = Array.isArray(o.addressLines) ? o.addressLines.filter((l) => typeof l === "string" && !!l.trim()) : [];
  const parts = [
    ...lines,
    nonBlankOrNull2(o.locality),
    [nonBlankOrNull2(o.administrativeArea), nonBlankOrNull2(o.postalCode)].filter(Boolean).join(" ")
  ].filter((p) => !!p);
  return parts.length ? parts.join(", ") : null;
}
function parseLocations(json) {
  const o = recordOrNull2(json);
  const list = Array.isArray(o?.locations) ? o.locations : [];
  const locations = list.map((l) => recordOrNull2(l)).filter((l) => !!l).map((l) => {
    const meta = recordOrNull2(l.metadata);
    return {
      name: nonBlankOrNull2(l.name) ?? "",
      title: nonBlankOrNull2(l.title) ?? "",
      address: oneLineAddress(l.storefrontAddress),
      place_id: nonBlankOrNull2(meta?.placeId),
      maps_uri: nonBlankOrNull2(meta?.mapsUri),
      new_review_uri: nonBlankOrNull2(meta?.newReviewUri)
    };
  }).filter((l) => l.name.startsWith("locations/"));
  return { locations, next: nonBlankOrNull2(o?.nextPageToken) };
}
var STARS = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };
function starRatingNumber(v) {
  return typeof v === "string" && Object.hasOwn(STARS, v) ? STARS[v] ?? null : null;
}
function parseReviewsPage(json) {
  const o = recordOrNull2(json);
  const list = Array.isArray(o?.reviews) ? o.reviews : [];
  const reviews = list.map((r) => recordOrNull2(r)).filter((r) => !!r).map((r) => {
    const name = nonBlankOrNull2(r.name);
    const id = nonBlankOrNull2(r.reviewId) ?? (name ? name.split("/").pop() ?? null : null);
    if (!name || !id) return null;
    const who = recordOrNull2(r.reviewer);
    const reply = recordOrNull2(r.reviewReply);
    return {
      name,
      review_id: id,
      rating: starRatingNumber(r.starRating),
      author: who?.isAnonymous === true ? null : nonBlankOrNull2(who?.displayName),
      author_photo_uri: nonBlankOrNull2(who?.profilePhotoUrl),
      anonymous: who?.isAnonymous === true,
      text: nonBlankOrNull2(r.comment),
      created_at: nonBlankOrNull2(r.createTime),
      updated_at: nonBlankOrNull2(r.updateTime),
      reply_text: nonBlankOrNull2(reply?.comment),
      replied_at: nonBlankOrNull2(reply?.updateTime)
    };
  }).filter((r) => r !== null);
  const avg = typeof o?.averageRating === "number" ? o.averageRating : null;
  const total = typeof o?.totalReviewCount === "number" ? o.totalReviewCount : null;
  return { reviews, average_rating: avg, total_count: total, next_page_token: nonBlankOrNull2(o?.nextPageToken) };
}
async function callProfileApi(http2, req) {
  const r = await http2(req);
  if (r.status < 200 || r.status >= 300) throw refusal(r.status, r.body);
  if (!r.body.trim()) return {};
  try {
    return JSON.parse(r.body);
  } catch {
    throw new PlacesError(502, "Google answered with something other than JSON");
  }
}
async function listAccounts(http2, token) {
  const out = [];
  let page = null;
  for (let i = 0; i < 5; i++) {
    const r = parseAccounts(await callProfileApi(http2, accountsRequest(token, page)));
    out.push(...r.accounts);
    page = r.next;
    if (!page) break;
  }
  return out;
}
async function listLocations(http2, token, accountName) {
  const out = [];
  let page = null;
  for (let i = 0; i < 5; i++) {
    const r = parseLocations(await callProfileApi(http2, locationsRequest(token, accountName, page)));
    out.push(...r.locations);
    page = r.next;
    if (!page) break;
  }
  return out;
}
async function listReviews(http2, token, parent, maxPages = GBP_REVIEWS_MAX_PAGES) {
  const all = [];
  let page = null;
  let avg = null;
  let total = null;
  for (let i = 0; i < Math.max(1, maxPages); i++) {
    const r = parseReviewsPage(await callProfileApi(http2, reviewsRequest(token, parent, page)));
    all.push(...r.reviews);
    if (i === 0) {
      avg = r.average_rating;
      total = r.total_count;
    }
    page = r.next_page_token;
    if (!page) break;
  }
  return { reviews: all, average_rating: avg, total_count: total, next_page_token: page };
}
async function replyToReview(http2, token, reviewName, comment) {
  const o = recordOrNull2(await callProfileApi(http2, replyRequest(token, reviewName, comment)));
  return {
    reply_text: nonBlankOrNull2(o?.comment) ?? comment,
    replied_at: nonBlankOrNull2(o?.updateTime) ?? (/* @__PURE__ */ new Date()).toISOString()
  };
}
var GBP_REPLY_MAX = 4096;
function cleanReply(text) {
  return typeof text === "string" ? text.replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n[ \t]+/g, "\n").trim().slice(0, GBP_REPLY_MAX) : "";
}

// src/tokens/edge-token.ts
import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import { MIN_MS as MIN_MS2 } from "../../contracts/dist/index.js";

// src/tokens/request-id.ts
var REQUEST_ID_HEADER = "x-request-id";
var SHAPE = /^[A-Za-z0-9._:-]{8,128}$/;
function requestIdOf(headers2, opts) {
  const given = opts.trustCaller ? requestIdShaped(headers2.get(REQUEST_ID_HEADER)) : null;
  if (given) return given;
  const platform = headers2.get("x-vercel-id")?.trim();
  if (platform && SHAPE.test(platform)) return platform;
  return globalThis.crypto.randomUUID();
}
function requestIdShaped(value) {
  const v = typeof value === "string" ? value.trim() : "";
  return SHAPE.test(v) ? v : null;
}

// src/tokens/edge-token.ts
var EDGE_TOKEN_TTL_MS = MIN_MS2;
function edgeBodyHash(body) {
  return createHash("sha256").update(body, "utf8").digest("base64url");
}
function signEdgeToken(secret, aud, ctx = {}, nowMs = Date.now()) {
  const rid = requestIdShaped(ctx.request);
  const claims = {
    aud,
    ws: ctx.workspace ?? null,
    user: ctx.user ?? null,
    iat: nowMs,
    exp: nowMs + EDGE_TOKEN_TTL_MS,
    nonce: randomBytes(16).toString("hex"),
    ...rid ? { rid } : {},
    ...ctx.body === void 0 ? {} : { bh: edgeBodyHash(ctx.body) }
  };
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`;
}
function verifyEdgeToken(secret, token, aud, nowMs = Date.now()) {
  const dot = token.indexOf(".");
  if (dot <= 0 || dot === token.length - 1) return { ok: false, reason: "malformed" };
  const payload = token.slice(0, dot);
  const given = Buffer.from(token.slice(dot + 1), "base64url");
  const expected = createHmac("sha256", secret).update(payload).digest();
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false, reason: "signature" };
  let claims;
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (!claims || typeof claims !== "object" || typeof claims.aud !== "string")
    return { ok: false, reason: "malformed" };
  if (claims.aud !== aud) return { ok: false, reason: "audience" };
  if (typeof claims.iat !== "number" || typeof claims.exp !== "number") return { ok: false, reason: "malformed" };
  if (typeof claims.nonce !== "string" || !claims.nonce) return { ok: false, reason: "malformed" };
  if (claims.bh !== void 0 && typeof claims.bh !== "string") return { ok: false, reason: "malformed" };
  if (nowMs > claims.exp || claims.iat > nowMs + EDGE_TOKEN_TTL_MS) return { ok: false, reason: "expired" };
  return {
    ok: true,
    claims: { ...claims, ws: claims.ws ?? null, user: claims.user ?? null, rid: requestIdShaped(claims.rid) }
  };
}
function edgeBodyMatches(claims, body) {
  if (claims.bh === void 0) return false;
  const a = Buffer.from(edgeBodyHash(body));
  const b = Buffer.from(claims.bh);
  return a.length === b.length && timingSafeEqual(a, b);
}

// src/tokens/unsubscribe-token.ts
import { createHmac as createHmac2, timingSafeEqual as timingSafeEqual2 } from "crypto";
import { UUID as UUID2 } from "../../contracts/dist/index.js";
var UNSUBSCRIBE_PATH = "/u/";
var VERSION = 1;
var PAYLOAD_BYTES = 1 + 16 * 3;
var MAC_BYTES = 16;
var TOKEN = /^[A-Za-z0-9_-]{87}$/;
var bytesOf = (uuid) => Buffer.from(uuid.replace(/-/g, ""), "hex");
var uuidOf = (b) => {
  const h = b.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};
var macOf = (secret, payload) => createHmac2("sha256", secret).update("chanlytics-unsubscribe:").update(payload).digest().subarray(0, MAC_BYTES);
function signUnsubscribeToken(secret, c) {
  if (!secret) throw new Error("signUnsubscribeToken: no secret");
  for (const id of [c.tenantId, c.contactId, c.messageId])
    if (!UUID2.test(id)) throw new Error("signUnsubscribeToken: the workspace, the person and the email are uuids");
  const payload = Buffer.concat([
    Buffer.from([VERSION]),
    bytesOf(c.tenantId),
    bytesOf(c.contactId),
    bytesOf(c.messageId)
  ]);
  return Buffer.concat([payload, macOf(secret, payload)]).toString("base64url");
}
function verifyUnsubscribeToken(secrets, token) {
  if (!Array.isArray(secrets)) return null;
  const keys = secrets.filter((s) => typeof s === "string" && s.length > 0);
  if (!keys.length || typeof token !== "string" || !TOKEN.test(token)) return null;
  const raw = Buffer.from(token, "base64url");
  if (raw.length !== PAYLOAD_BYTES + MAC_BYTES || raw[0] !== VERSION || raw.toString("base64url") !== token)
    return null;
  const payload = raw.subarray(0, PAYLOAD_BYTES);
  const mac = raw.subarray(PAYLOAD_BYTES);
  if (!keys.some((k) => timingSafeEqual2(mac, macOf(k, payload)))) return null;
  return {
    tenantId: uuidOf(payload.subarray(1, 17)),
    contactId: uuidOf(payload.subarray(17, 33)),
    messageId: uuidOf(payload.subarray(33, 49))
  };
}
function unsubscribeUrl(origin, token) {
  return `${origin.replace(/\/+$/, "")}${UNSUBSCRIBE_PATH}${token}`;
}

// src/leads/apify.ts
import { finiteOrNull as finiteOrNull2, trimmedOrNull, recordOrNull as recordOrNull3 } from "../../contracts/dist/index.js";
var APIFY_BASE = "https://api.apify.com/v2";
var APIFY_TIMEOUT_MS = 2e4;
var APIFY_RUN_END_EVENTS = [
  "ACTOR.RUN.SUCCEEDED",
  "ACTOR.RUN.FAILED",
  "ACTOR.RUN.TIMED_OUT",
  "ACTOR.RUN.ABORTED"
];
var ApifyRetryable = class extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
    this.name = "ApifyRetryable";
  }
  status;
};
var ApifyRefused = class extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
    this.name = "ApifyRefused";
  }
  status;
};
var actorPath = (actor) => encodeURIComponent(actor.replace("/", "~"));
function runOf(data) {
  const d = recordOrNull3(data);
  const id = trimmedOrNull(d?.id);
  const status = trimmedOrNull(d?.status);
  if (!d || !id || !status) throw new ApifyRefused(200, "the provider answered without a run");
  return {
    id,
    status,
    datasetId: trimmedOrNull(d.defaultDatasetId),
    usageTotalUsd: finiteOrNull2(d.usageTotalUsd),
    startedAt: trimmedOrNull(d.startedAt),
    finishedAt: trimmedOrNull(d.finishedAt)
  };
}
function apifyClient(fetchImpl, token) {
  const headers2 = (json) => ({
    Authorization: `Bearer ${token}`,
    ...json ? { "content-type": "application/json" } : {}
  });
  async function call2(url, init, allow = () => false) {
    const res = await providerFetch(
      "apify",
      url,
      { method: init.method, headers: init.headers, body: init.body, timeoutMs: APIFY_TIMEOUT_MS },
      { fetch: fetchImpl }
    );
    if (res.status === 0 || !res.headers) throw new ApifyRetryable(null, `the provider did not answer: ${res.error}`);
    const text = res.text;
    if (res.status >= 200 && res.status < 300) {
      try {
        return { body: text ? JSON.parse(text) : null, headers: res.headers };
      } catch {
        throw new ApifyRefused(res.status, "the provider answered with something that is not JSON");
      }
    }
    if (allow(res.status)) return { body: null, headers: res.headers };
    let type = `http ${res.status}`;
    try {
      type = trimmedOrNull(recordOrNull3(recordOrNull3(JSON.parse(text))?.error)?.type) ?? type;
    } catch {
    }
    if (res.status === 429 || res.status >= 500) throw new ApifyRetryable(res.status, `the provider is busy: ${type}`);
    throw new ApifyRefused(res.status, `the provider refused: ${type}`);
  }
  return {
    async startRun(actor, input, opts) {
      const webhooks = Buffer.from(JSON.stringify(opts.webhooks), "utf8").toString("base64");
      const q = new URLSearchParams({
        build: opts.build,
        timeout: String(opts.timeoutSecs),
        maxTotalChargeUsd: String(opts.maxTotalChargeUsd),
        webhooks
      });
      if (opts.memoryMb) q.set("memory", String(opts.memoryMb));
      const { body } = await call2(`${APIFY_BASE}/actors/${actorPath(actor)}/runs?${q}`, {
        method: "POST",
        headers: headers2(true),
        body: JSON.stringify(input)
      });
      const run = runOf(recordOrNull3(body)?.data);
      if (!run.datasetId) throw new ApifyRefused(201, "the provider started a run with no dataset");
      return { id: run.id, datasetId: run.datasetId };
    },
    async getRun(id) {
      const { body } = await call2(`${APIFY_BASE}/actor-runs/${encodeURIComponent(id)}`, {
        method: "GET",
        headers: headers2(false)
      });
      return runOf(recordOrNull3(body)?.data);
    },
    async listActorRuns(actor, sinceIso) {
      const q = new URLSearchParams({ desc: "1", limit: "100" });
      const { body } = await call2(`${APIFY_BASE}/actors/${actorPath(actor)}/runs?${q}`, {
        method: "GET",
        headers: headers2(false)
      });
      const items = recordOrNull3(recordOrNull3(body)?.data)?.items;
      const out = [];
      for (const it of Array.isArray(items) ? items : []) {
        const o = recordOrNull3(it);
        const id = trimmedOrNull(o?.id);
        const status = trimmedOrNull(o?.status);
        const startedAt = trimmedOrNull(o?.startedAt);
        if (!o || !id || !status || !startedAt || startedAt < sinceIso) continue;
        out.push({ id, status, startedAt, datasetId: trimmedOrNull(o.defaultDatasetId) });
      }
      return out;
    },
    async runInput(id) {
      const { body } = await call2(`${APIFY_BASE}/actor-runs/${encodeURIComponent(id)}`, {
        method: "GET",
        headers: headers2(false)
      });
      const store = trimmedOrNull(recordOrNull3(recordOrNull3(body)?.data)?.defaultKeyValueStoreId);
      if (!store) return null;
      const rec = await call2(
        `${APIFY_BASE}/key-value-stores/${encodeURIComponent(store)}/records/INPUT`,
        { method: "GET", headers: headers2(false) },
        (s) => s === 404
      );
      return rec.body;
    },
    async listItems(datasetId, offset, limit, fields) {
      const q = new URLSearchParams({
        offset: String(offset),
        limit: String(limit),
        fields: fields.join(","),
        format: "json"
      });
      const { body, headers: h } = await call2(`${APIFY_BASE}/datasets/${encodeURIComponent(datasetId)}/items?${q}`, {
        method: "GET",
        headers: headers2(false)
      });
      if (!Array.isArray(body)) throw new ApifyRefused(200, "the provider answered items that are not a list");
      const total = Number(h.get("x-apify-pagination-total"));
      return {
        items: body,
        total: Number.isFinite(total) && h.get("x-apify-pagination-total") !== null ? total : null
      };
    },
    async abortRun(id) {
      await call2(
        `${APIFY_BASE}/actor-runs/${encodeURIComponent(id)}/abort`,
        { method: "POST", headers: headers2(false) },
        (s) => s >= 400 && s < 500 && s !== 401 && s !== 403 && s !== 429
      );
    },
    async eventPrices(actor) {
      const { body } = await call2(`${APIFY_BASE}/actors/${actorPath(actor)}`, {
        method: "GET",
        headers: headers2(false)
      });
      const d = recordOrNull3(recordOrNull3(body)?.data);
      const infos = Array.isArray(d?.pricingInfos) ? d.pricingInfos : [];
      const events = recordOrNull3(recordOrNull3(recordOrNull3(infos[infos.length - 1])?.pricingPerEvent)?.actorChargeEvents) ?? {};
      const out = {};
      for (const [name, e] of Object.entries(events)) {
        const price = finiteOrNull2(
          recordOrNull3(recordOrNull3(recordOrNull3(e)?.eventTieredPricingUsd)?.BRONZE)?.tieredEventPriceUsd
        ) ?? finiteOrNull2(recordOrNull3(e)?.eventPriceUsd);
        if (price !== null) out[name] = price;
      }
      return out;
    }
  };
}

// src/leads/lead-judge.ts
import { createHash as createHash2 } from "crypto";
import {
  MODEL_ROUTES,
  JUDGE_OUTPUT_SCHEMA,
  judgeSystemPrompt,
  judgeUserContent,
  parseJudgeAnswer
} from "../../contracts/dist/index.js";
var LEAD_JUDGE_MAX_TOKENS = MODEL_ROUTES.lead_judge.maxTokens;
var LEAD_JUDGE_FALLBACK_BETA = "server-side-fallback-2026-07-01";
var LEAD_JUDGE_DEFAULT_MODEL = MODEL_ROUTES.lead_judge.model;
function betaRejected(e) {
  const err = e;
  return err?.status === 400 && /fallback|beta|output_config|json_schema|format/i.test(err.message ?? "");
}
function leadJudge(client, model, fallbacks) {
  return {
    async judge(plan, places, tenantId, roundId) {
      const system = judgeSystemPrompt(plan);
      const user = judgeUserContent(places);
      const requestHash = createHash2("sha256").update(`${system}
${user}`).digest("hex");
      const base = {
        model,
        max_tokens: LEAD_JUDGE_MAX_TOKENS,
        system,
        messages: [{ role: "user", content: user }],
        output_config: { effort: "low", format: { type: "json_schema", schema: JUDGE_OUTPUT_SCHEMA } }
      };
      let res;
      try {
        res = await client.beta.messages.create(
          fallbacks ? { ...base, betas: [LEAD_JUDGE_FALLBACK_BETA], fallbacks: "default" } : base,
          { tenantId, roundId }
        );
      } catch (e) {
        if (!(fallbacks && betaRejected(e))) throw e;
        res = await client.beta.messages.create(base, { tenantId, roundId });
      }
      const tokens = (res.usage?.input_tokens ?? 0) + (res.usage?.output_tokens ?? 0);
      if (res.stop_reason === "refusal") return { refused: true, why: "the judge refused" };
      if (res.stop_reason === "max_tokens") return { refused: true, why: "max_tokens" };
      const text = (res.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
      let raw;
      try {
        raw = JSON.parse(text);
      } catch {
        return { refused: true, why: "not JSON" };
      }
      const parsed2 = parseJudgeAnswer(raw, plan, places);
      if (!parsed2.ok) return { refused: true, why: parsed2.why };
      return { answers: parsed2.answers, model: res.model ?? model, tokens, raw, requestHash };
    }
  };
}
export {
  A2P_POLICIES,
  A2P_STEPS,
  APIFY_BASE,
  APIFY_RUN_END_EVENTS,
  APIFY_TIMEOUT_MS,
  ApifyRefused,
  ApifyRetryable,
  CALLER_UNKNOWN,
  CALL_ANALYSIS_FIELDS,
  EDGE_TOKEN_TTL_MS,
  ELEVENLABS_SIGNATURE_HEADER,
  ELEVENLABS_WEBHOOK_TOLERANCE_S,
  EMPTY_A2P_STATE,
  FACTS_UNAVAILABLE,
  FRESH_SLACK_MS,
  GBP_ACCOUNTS_URL,
  GBP_INFO_BASE,
  GBP_LOCATIONS_READ_MASK,
  GBP_REPLY_MAX,
  GBP_REVIEWS_MAX_PAGES,
  GBP_REVIEWS_PAGE,
  GBP_V4_BASE,
  GOOGLE_AUTH_URL,
  GOOGLE_REVOKE_URL,
  GOOGLE_TOKEN_URL,
  GREETING_DEFAULT,
  HANDOFF_VAR,
  LEAD_JUDGE_DEFAULT_MODEL,
  LEAD_JUDGE_FALLBACK_BETA,
  LEAD_JUDGE_MAX_TOKENS,
  LINE_COSTS,
  LINE_STEPS,
  LOW_VOLUME_USECASE,
  MESSAGING2 as MESSAGING,
  NotPublicError,
  PLACES_BASE,
  PLACES_DETAILS_MASK,
  PLACES_SEARCH_LIMIT,
  PLACES_SEARCH_MASK,
  PLACES_TIMEOUT_MS,
  PLACE_ID,
  PROFILE_SCOPES,
  PlacesError,
  REQUEST_ID_HEADER,
  RESEND_API,
  RETELL_ORIGINATION,
  REVIEW_BELL_MAX,
  SEND_DEADLINE_MS,
  SEND_MIN_MS,
  SEND_TIMEOUT_MS2 as SEND_TIMEOUT_MS,
  SMS_FOOTER,
  SMS_HELD_DETAILS,
  SMS_HELD_REASON,
  SMS_MAX_CHARS,
  SMS_OPTED_OUT_CODE,
  STATE_TTL_MS,
  SYSTEM_ONE_URL,
  TRUSTHUB,
  TwilioError,
  UNSUBSCRIBE_PATH,
  VOICE_AGENT_DEFAULTS,
  VOICE_LLM_DEFAULTS,
  VOICE_NUMBER_DEFAULTS,
  VOICE_SHELL_BEGIN,
  VOICE_SHELL_PROMPT,
  VOICE_WEBHOOK_EVENTS,
  VOICE_WEBHOOK_TIMEOUT_MS,
  WEBHOOK_TOLERANCE_S,
  a2pProfileEndUserRequest,
  a2pProfileRequest,
  accountsRequest,
  addressOf,
  addressRequest,
  agentSettingsDrift,
  answerObject,
  apifyClient,
  askModel,
  askSystemOne,
  assignRequest,
  authorizeUrl,
  availabilityUrl,
  b64url,
  brandRequest,
  brandTypeFor,
  breakerOf,
  breakerStates,
  buildEmailRequest,
  businessAttributes,
  businessEndUserRequest,
  callSummaryLine,
  campaignRequest,
  campaignsIdentity,
  carrierConsent,
  chooseLineProvider,
  classifyReceived,
  cleanReply,
  createAgent,
  createAgentVersion,
  createMailDomain,
  createPhoneNumber,
  createRetellLlm,
  customerProfileRequest,
  deleteCampaignRequest,
  deleteConversation,
  deletePhoneNumber,
  deleteReplyRequest,
  desiredVoiceShell,
  dmarcOf,
  dryProvider,
  edgeBodyMatches,
  elevenLabsWebhookSignature,
  emailHtml,
  emailPlainText,
  emailReceiptEffect,
  emailReceiptFrom,
  emailReceivedEventFrom,
  encodeForm,
  errField,
  evaluateRequest,
  evaluateTrustProductRequest,
  fetchMailDomains,
  fetchMediaBytes,
  fetchReceivedEmail,
  fetchRecording,
  fetchTwilio,
  findMailDomain,
  formatRejected,
  getAgent,
  getAgentRaw,
  getCall,
  getMailDomain,
  getPhoneNumber,
  getPlace,
  getRetellLlm,
  grantHasScope,
  graphThrottled,
  greetingFor,
  hostedAddress,
  hostedIdentity,
  idTokenClaims,
  importPhoneNumber,
  isAreaCode,
  isBrandNotReady,
  isEmailRequest,
  isPublicAddress,
  isValidSipPassword,
  keywordsFor,
  leadJudge,
  lineCodesFrom,
  listAccounts,
  listCalls,
  listLocations,
  listReviews,
  liveTurns,
  locationsRequest,
  logger,
  mailDomainsFrom,
  mailboxHeader,
  mergeConsent,
  messageIdHeader,
  messageIdsIn,
  mintConversationToken,
  newNonce,
  nextA2PStep,
  nextLineStep,
  normalizeCall,
  normalizeInbound,
  noteTenant,
  oneTimeCodeOf,
  ownDomainIdentity,
  parseAccounts,
  parseLocations,
  parsePlaceDetails,
  parsePlacesSearch,
  parseReviewsPage,
  parseTokenResponse,
  parseTranscriptText,
  placesDetailsRequest,
  placesFetch,
  placesSearchRequest,
  planAgentSettings,
  planListingCheck,
  planProfileSync,
  planVoiceConvergence,
  planVoiceProvision,
  platformRecipient,
  providerDomainFrom,
  providerFetch,
  publicFetch,
  publicFetcher,
  publicLookup,
  publishAgentVersion,
  receivedEmailFrom,
  referencesFor,
  refusalWords,
  registrationVerdict,
  removeMailDomain,
  replyRequest,
  replyRouteAddress,
  replySubject,
  replyToReview,
  representativeAttributes,
  representativeEndUserRequest,
  requestId,
  requestIdOf,
  requestIdShaped,
  requestLeavesAs,
  requestTenant,
  resendLimitOf,
  resendRequest,
  resendWebhookSignature,
  resetBreakers,
  retellImportBody,
  reviewBells,
  reviewIdOf,
  reviewParent,
  reviewsRequest,
  revokeRequest,
  runA2PSaga,
  runLineSaga,
  sameSignature,
  searchPlaces,
  sendEmail,
  sendTemplate,
  sendText,
  senderAuthenticated,
  sendsAs,
  sendsAsCampaigns,
  sendsAsOwnDomain,
  setPublicFetch,
  signEdgeToken,
  signState,
  signUnsubscribeToken,
  sipPassword,
  sipUsername,
  smsAsWaMessage,
  smsBody,
  smsInboundFrom,
  smsInboundUrl,
  smsKeywordConsent,
  smsRefusalOf,
  smsStateFor,
  smsStatusFrom,
  smsStatusToRow,
  smsStatusUrl,
  soleProprietorEndUserRequest,
  soleProprietorProfileRequest,
  speakText,
  starRatingNumber,
  starterAttributes,
  starterEndUserRequest,
  starterProfileRequest,
  stopCall,
  streamModel,
  stripKey,
  subaccountName,
  submitProfileRequest,
  submitTrustProductRequest,
  supportingDocumentRequest,
  tokenExchangeRequest,
  tokenRefreshRequest,
  trunkDomain,
  trustProductAssignRequest,
  twilioProvider,
  twilioRequest,
  twilioSignature,
  twilioSignedString,
  twilioUrls,
  unb64url,
  unsubscribeUrl,
  updateAgent,
  updateCampaignRequest,
  updateEndUserRequest,
  updateLiveCall,
  updatePhoneNumber,
  verifyEdgeToken,
  verifyElevenLabsWebhook,
  verifyMailDomain,
  verifyResendWebhook,
  verifyRetellSignature,
  verifyState,
  verifyTwilioSignature,
  verifyUnsubscribeToken,
  voiceAgentCreateBody,
  voiceEndpoints,
  voiceLlmCreateBody,
  voiceNumberBindBody,
  voiceNumberBinding,
  voiceNumberCreateBody,
  voiceShellDrift,
  voiceShellTools,
  waPricingOf,
  waStoppedMarketing,
  withCarrierConsent,
  withKey,
  withRequestId
};
