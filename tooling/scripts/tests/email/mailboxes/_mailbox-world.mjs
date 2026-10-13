/**
 * A connected mailbox's world, for the suites in this folder (decision 0056): its token in a vault in memory (00423's
 * three Vault doors, as fakeDb's rpcs), the deployment's switches for both providers, and the providers answered by
 * the test (a fetch that records each call and answers by what it asked). The row itself is _rows.mjs's
 * (rows.mailboxConnection).
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 */
import { Resolver } from "node:dns/promises";

/** The switches a deployment that offers both providers holds, and the unsubscribe's seal a reach-out needs. */
export const MAILBOX_ENV = {
  GOOGLE_MAIL_CLIENT_ID: "google-mail-client.apps.example",
  GOOGLE_MAIL_CLIENT_SECRET: "google-mail-secret",
  MICROSOFT_MAIL_CLIENT_ID: "00000000-0000-4000-8000-00000000c11e",
  MICROSOFT_MAIL_CLIENT_SECRET: "microsoft-mail-secret",
  MAILBOX_OAUTH_REDIRECT: "https://app.example.com/api/v1/mailbox-connections/callback",
  UNSUBSCRIBE_SECRET: "unsubscribe-secret-made-up-for-the-tests",
};

/** Set these variables for a test; the function it answers puts back what was there. */
export function withEnv(vars) {
  const was = {};
  for (const [k, v] of Object.entries(vars)) {
    was[k] = process.env[k];
    if (v === null || v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return () => {
    for (const [k, v] of Object.entries(was)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  };
}

/** A token that lasts the hour: what a mailbox's Vault entry holds after a connect. */
export const liveCredentials = (access = "ya29.live-token", refresh = "1//refresh-token") => ({
  refresh_token: refresh,
  access_token: access,
  expires_at: Date.now() + 3_600_000,
  scope:
    "openid email profile https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly",
});

/**
 * 00423's Vault doors over a map: get answers the secret or null; put keeps it, refusing with 40001 when it names a
 * refresh token that is no longer the one kept (a reconnect stored meanwhile); drop forgets it.
 */
export function vault(seed = {}) {
  const secrets = new Map(Object.entries(seed));
  return {
    secrets,
    rpcs: {
      get_mailbox_credentials: ({ p_connection_id }) => secrets.get(p_connection_id) ?? null,
      put_mailbox_credentials: ({ p_connection_id, p_secret, p_if_refresh_token }) => {
        const was = secrets.get(p_connection_id);
        if (p_if_refresh_token && was && was.refresh_token !== p_if_refresh_token)
          throw Object.assign(new Error("the token changed since it was read"), { code: "40001" });
        secrets.set(p_connection_id, p_secret);
        return null;
      },
      drop_mailbox_credentials: ({ p_connection_id }) => secrets.delete(p_connection_id),
    },
  };
}

/**
 * The providers, answered by `answer(call)`: each call is `{ url, method, headers, body }`, and the answer is a
 * Response, or `{ status, json }`, or `{ status, text }`. Every call is kept, in order.
 */
export function providers(answer) {
  const calls = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const headers = init.headers instanceof Headers ? Object.fromEntries(init.headers) : { ...(init.headers ?? {}) };
    const call = { url: String(url), method: init.method ?? "GET", headers, body: init.body ?? null };
    calls.push(call);
    const a = await answer(call);
    if (a instanceof Response) return a;
    const status = a?.status ?? 200;
    if (a && "text" in a) return new Response(a.text, { status });
    return new Response(JSON.stringify(a?.json ?? {}), { status, headers: { "content-type": "application/json" } });
  };
  return {
    calls,
    restore: () => {
      globalThis.fetch = real;
    },
  };
}

/** A base64url string of text, as Gmail and Pub/Sub carry bodies. */
export const b64url = (text) => Buffer.from(text, "utf8").toString("base64url");

/** An email a mailbox sent, as its reader sees it: its headers (unfolded, by lower-case name) and its plain text. */
export function readMime(raw) {
  const mime = Buffer.from(raw, "base64url").toString("utf8");
  const [head, ...rest] = mime.split("\r\n\r\n");
  const headers = {};
  for (const line of head.replace(/\r\n[ \t]+/g, " ").split("\r\n")) {
    const i = line.indexOf(":");
    headers[line.slice(0, i).toLowerCase()] = line.slice(i + 1).trim();
  }
  let body = rest.join("\r\n\r\n");
  const boundary = /boundary="([^"]+)"/.exec(headers["content-type"] ?? "")?.[1];
  if (boundary) body = body.split(`--${boundary}`)[1].split("\r\n\r\n").slice(1).join("\r\n\r\n");
  // Quoted-printable: soft breaks joined, each =XX a byte, the bytes UTF-8.
  const qp = body.replace(/=\r\n/g, "").replace(/=([0-9A-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  return { headers, text: Buffer.from(qp, "latin1").toString("utf8").trimEnd() };
}

/**
 * A message as Gmail's users.messages.get (format=full) answers it: its headers, and either its text or its parts.
 * `headers` adds to From, To, Subject and Message-ID, which are always there.
 */
export function gmailReceived({ id, threadId, from, to, subject, messageId, text = "", headers = {}, parts }) {
  return {
    id,
    threadId,
    internalDate: String(Date.now()),
    payload: {
      mimeType: parts ? "multipart/report" : "text/plain",
      headers: [
        { name: "From", value: from },
        { name: "To", value: to },
        { name: "Subject", value: subject },
        { name: "Message-ID", value: messageId },
        ...Object.entries(headers).map(([name, value]) => ({ name, value })),
      ],
      ...(parts ? { parts } : { body: { data: b64url(text) } }),
    },
  };
}

/**
 * Gmail, as it answers the connected mailboxes of a suite over the real database: a send kept as the bytes it was
 * (`sent`, each read by readMime, with its id, its thread and the Authorization it came with), in the thread it names
 * or a new one, its Message-ID kept as sent; the thread a Message-ID is in, among what was sent and received; and what
 * the mailboxes received since a cursor (history ids from 100: one each), as the suite puts it in `received`.
 * `other(url, init)` answers any other call, or returns undefined to let it pass; a call to a mail provider that
 * neither answers fails the suite, and anything else reaches the network (the local stack).
 */
export function gmailFake({ address = "sam@getharbor.example", other = async () => undefined } = {}) {
  const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";
  const sent = [];
  const received = [];
  const real = globalThis.fetch;
  const header = (m, name) =>
    m.headers?.[name] ?? m.payload?.headers?.find((h) => h.name.toLowerCase() === name)?.value;
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    if (!u.startsWith(GMAIL)) {
      const answered = await other(u, init);
      if (answered) return answered;
      if (/googleapis\.com|microsoft\.com|resend\.com/.test(u)) throw new Error(`the suite does not answer ${u}`);
      return real(url, init);
    }
    const h = init.headers instanceof Headers ? Object.fromEntries(init.headers) : { ...(init.headers ?? {}) };
    const authorization = Object.entries(h).find(([k]) => k.toLowerCase() === "authorization")?.[1];
    const q = new URL(u);
    if (q.pathname.endsWith("/messages/send") && init.method === "POST") {
      const body = JSON.parse(init.body);
      const id = `gm-${sent.length + 1}`;
      const mail = { id, threadId: body.threadId ?? `gt-${sent.length + 1}`, authorization, ...readMime(body.raw) };
      sent.push(mail);
      return Response.json({ id, threadId: mail.threadId, labelIds: ["SENT"] });
    }
    if (q.pathname.endsWith("/messages") && q.searchParams.get("q")?.startsWith("rfc822msgid:")) {
      const want = `<${q.searchParams.get("q").slice("rfc822msgid:".length)}>`;
      const m = [...sent, ...received].find((x) => header(x, "message-id") === want);
      return Response.json(m ? { messages: [{ id: m.id, threadId: m.threadId }] } : { resultSizeEstimate: 0 });
    }
    const one = /\/messages\/([^/]+)$/.exec(q.pathname)?.[1];
    if (one && q.searchParams.get("format") === "metadata") {
      const m = sent.find((x) => x.id === one);
      if (!m) return Response.json({}, { status: 404 });
      return Response.json({
        id: m.id,
        threadId: m.threadId,
        payload: { headers: [{ name: "Message-ID", value: m.headers["message-id"] }] },
      });
    }
    if (one && q.searchParams.get("format") === "full") {
      const m = received.find((x) => x.id === one);
      return m ? Response.json(m) : Response.json({}, { status: 404 });
    }
    if (q.pathname.endsWith("/history")) {
      const from = Math.max(Number(q.searchParams.get("startHistoryId")) - 100, 0);
      return Response.json({
        history: received
          .slice(from)
          .map((m) => ({ messagesAdded: [{ message: { id: m.id, threadId: m.threadId } }] })),
        historyId: String(100 + received.length),
      });
    }
    if (q.pathname.endsWith("/profile"))
      return Response.json({ emailAddress: address, historyId: String(100 + received.length) });
    throw new Error(`the suite does not answer ${init.method ?? "GET"} ${u}`);
  };
  return {
    sent,
    received,
    restore: () => {
      globalThis.fetch = real;
    },
  };
}

/**
 * DNS, answered by the test: every Resolver the edge makes reads these (the prototype's resolveTxt and resolveMx), so
 * the edge's own readMailboxDns runs over them. The function it answers puts the system's back.
 */
export function dnsAnswers({ txt, mx }) {
  const was = { txt: Resolver.prototype.resolveTxt, mx: Resolver.prototype.resolveMx };
  if (txt) Resolver.prototype.resolveTxt = (name) => txt(name);
  if (mx) Resolver.prototype.resolveMx = (name) => mx(name);
  return () => {
    Resolver.prototype.resolveTxt = was.txt;
    Resolver.prototype.resolveMx = was.mx;
  };
}
