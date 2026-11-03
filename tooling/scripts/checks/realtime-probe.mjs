/**
 * After a deploy: an anonymous caller is refused the workspaces' topics (decision 0019; the page-open PRD of 3 Nov 2026,
 * L6). Realtime admits a member to their workspace's private topic under one policy (00265); nothing else may join it.
 * And once Realtime's "Allow public access" is off (S1, Ruben's switch), nobody joins a public channel at all, which the
 * dashboard never uses. Read the way a stranger would: the project's public key, Realtime's own websocket, no session.
 *
 *   node tooling/scripts/checks/realtime-probe.mjs [--allow-public]       SUPABASE_URL and SUPABASE_ANON_KEY from the env
 *
 * Exit 0 when both joins were refused (a public join admitted passes with --allow-public, until S1), or when the env names
 * no project (said, and skipped); 1 when a join was admitted, or Realtime did not answer; 2 when the command was wrong.
 */
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";

/** How long a join may take to be answered. */
const WAIT_MS = 10_000;

/** A join's answer, judged: "refused", "admitted", or why it is neither. */
export function judgeJoin(reply) {
  if (!reply || reply.event !== "phx_reply" || !reply.payload) return "unanswered";
  if (reply.payload.status === "ok") return "admitted";
  if (reply.payload.status === "error") return "refused";
  return `answered ${JSON.stringify(reply.payload).slice(0, 120)}`;
}

/** The websocket address of a project's Realtime, for a key. */
export function socketOf(url, key) {
  const u = new URL(url);
  u.protocol = u.protocol === "http:" ? "ws:" : "wss:";
  u.pathname = "/realtime/v1/websocket";
  u.search = new URLSearchParams({ apikey: key, vsn: "1.0.0" }).toString();
  return u.toString();
}

/** Join `topic` as the key alone, and answer how Realtime judged it. */
export function join(socket, key, topic, { private: priv }) {
  return new Promise((resolve) => {
    const ws = new WebSocket(socket);
    const done = (verdict) => {
      clearTimeout(timer);
      try {
        ws.close();
      } catch {
        /* closing a socket that never opened */
      }
      resolve(verdict);
    };
    const timer = setTimeout(() => done("unanswered"), WAIT_MS);
    ws.addEventListener("open", () =>
      ws.send(
        JSON.stringify({
          topic: `realtime:${topic}`,
          event: "phx_join",
          payload: {
            config: {
              broadcast: { ack: false, self: false },
              presence: { key: "" },
              postgres_changes: [],
              private: priv,
            },
            access_token: key,
          },
          ref: "1",
          join_ref: "1",
        }),
      ),
    );
    ws.addEventListener("message", (e) => {
      let reply = null;
      try {
        reply = JSON.parse(String(e.data));
      } catch {
        return;
      }
      if (reply?.ref === "1") done(judgeJoin(reply));
    });
    ws.addEventListener("error", () => done("unanswered"));
  });
}

async function main(argv, env) {
  const allowPublic = argv.includes("--allow-public");
  const unknown = argv.filter((a) => a !== "--allow-public");
  if (unknown.length) {
    console.error(`unknown argument ${unknown[0]}: node tooling/scripts/checks/realtime-probe.mjs [--allow-public]`);
    return 2;
  }
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.log("skipped: SUPABASE_URL and SUPABASE_ANON_KEY name no project here");
    return 0;
  }
  const socket = socketOf(url, key);
  const workspace = await join(socket, key, `workspace:${randomUUID()}:changes`, { private: true });
  const open = await join(socket, key, `probe-${randomUUID()}`, { private: false });
  console.log(`a workspace's private topic, joined anonymously: ${workspace}`);
  console.log(
    `a public channel, joined anonymously: ${open}${allowPublic ? " (allowed until public access is off)" : ""}`,
  );
  if (workspace !== "refused") return 1;
  if (open === "refused") return 0;
  return allowPublic && open === "admitted" ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href)
  main(process.argv.slice(2), process.env).then((code) => process.exit(code));
