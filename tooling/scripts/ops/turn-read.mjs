/**
 * What the receptionist was told when it wrote a reply (decision 0039).
 *
 * A reply's row names the turn it was written in (messages.meta.turn_id). The turn is kept for thirty days as the
 * model read it (model_turns, 00359): the clock, who the person was, an owner's steer, the thread, and what the model
 * answered before anything replaced it; the text of the prompt it read is kept under its hash (model_prompts). This
 * prints one turn, by the reply, by the turn, or the turns of a conversation to pick from. Read-only; the service role,
 * because no session reads these tables. What it shows as the answer is the record the platform read (which the reply
 * was made from); where the model's own words said more, it says so, and --json has them whole. Asked by the reply,
 * it also says the settings the reply was written under (meta.config_version, kept by 00360 for 400 days after they
 * were replaced), and --json has those whole too.
 *
 *   NEXT_PUBLIC_SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node tooling/scripts/ops/turn-read.mjs --message <uuid>
 *   … node tooling/scripts/ops/turn-read.mjs --turn <uuid> [--no-prompt] [--json]
 *   … node tooling/scripts/ops/turn-read.mjs --conversation <uuid>
 *
 * It prints a customer's words and the team's notes about them: run it where you would read the Inbox, and keep its
 * output out of a ticket or a chat. A holding reply has no record and so names no turn; ask for its conversation and
 * read the turn at its time. Exits 1 when there is nothing to print, 2 when it could not read.
 */
import { pathToFileURL } from "node:url";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One line of a conversation's list: when, which turn, the model, and what it made of the message. */
export function turnLine(turn) {
  const said = turn.response?.record
    ? `${turn.response.record.intent}, ${Math.round((turn.response.record.confidence ?? 0) * 100)}% sure${turn.response.record.escalate ? ", handed to a person" : ""}`
    : turn.response
      ? `no record (${turn.response.stop_reason ?? "no stop reason"})`
      : "no answer came";
  return `${turn.created_at}  ${turn.id}  ${turn.model ?? "no model"}  ${said}`;
}

/** The settings a reply was written under, in a line: their version, when they came into force, and until when. */
export function settingsLine(version, kept) {
  if (!kept)
    return `Settings: version ${version}, no longer kept (replaced more than 400 days ago, or from before they were kept).`;
  const until = kept.replaced_at ? `replaced ${kept.replaced_at}` : "still in force";
  return `Settings: version ${version}, in force from ${kept.changed_at}, ${until}; --json has them whole.`;
}

/**
 * Whether the model's words hold more than the record read from them: the platform caps a reason and the facts, holds
 * a confidence to 0..1 and makes an intent or language it does not know "other" (contracts parseBrainOutput).
 */
function wroteMore(response) {
  try {
    const wrote = JSON.parse(response.text);
    return Object.keys(response.record).some((k) => JSON.stringify(wrote?.[k]) !== JSON.stringify(response.record[k]));
  } catch {
    // Words cut at the turn's cap are not a document any more; the record is what was read from the whole of them.
    return false;
  }
}

/** A turn as an operator reads it: what it was told, block by block as the model was sent it, then what it answered. */
export function turnText(turn, prompt, { withPrompt = true } = {}) {
  const request = turn.request ?? {};
  const response = turn.response;
  const out = [
    `Turn ${turn.id}`,
    `  conversation ${turn.conversation_id}`,
    `  at ${turn.created_at}, ${turn.model ?? "no model answered"}${turn.latency_ms === null || turn.latency_ms === undefined ? "" : `, ${turn.latency_ms} ms`}`,
    `  prompt ${turn.prompt_hash}${prompt ? `, first given ${prompt.first_seen_at}, last read ${prompt.last_seen_at}` : ": its text is no longer kept"}`,
    "",
  ];
  const block = (title, text) => out.push(`--- ${title}`, text === null || text === undefined ? "(none)" : text, "");
  if (withPrompt) block("The prompt", prompt?.text);
  block("The clock, and what was open", request.now);
  block("Who it was speaking with", request.who);
  if (request.steer) block("The owner's steer", request.steer);
  out.push("--- The thread, as it was sent");
  for (const m of request.messages ?? [])
    out.push(`[${m.role === "assistant" ? "receptionist" : "customer"}] ${m.content}`);
  if (request.photo) out.push(`(a photo went before the last message's words: ${request.photo}, not kept)`);
  out.push("", "--- What it answered");
  if (!response)
    out.push("No answer came: the model could not be reached or refused the request (ai_usage says which).");
  else if (response.record) {
    const r = response.record;
    out.push(
      r.reply,
      "",
      `  intent ${r.intent}, ${Math.round((r.confidence ?? 0) * 100)}% sure, in ${r.language}${r.escalate ? ", handed to a person" : ""}`,
      `  why: ${r.reason || "(it gave none)"}`,
      `  facts it leaned on: ${(r.facts_used ?? []).join(", ") || "(none named)"}`,
    );
    if (wroteMore(response))
      out.push("  (the model's own words said more than the record kept: read them with --json)");
  } else
    out.push(`No record could be read (${response.stop_reason ?? "no stop reason"}). Its words:`, response.text ?? "");
  return out.join("\n");
}

async function main() {
  const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const arg = (name) => {
    const at = process.argv.indexOf(name);
    return at < 0 ? null : (process.argv[at + 1] ?? "");
  };
  const asked = { message: arg("--message"), turn: arg("--turn"), conversation: arg("--conversation") };
  const [[by, id] = []] = Object.entries(asked).filter(([, v]) => v !== null);
  const fail = (code, why) => {
    console.error(why);
    process.exit(code);
  };
  if (!URL_ || !KEY) fail(2, "NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY are required");
  if (!by || !UUID.test(id))
    fail(2, "usage: --message <uuid> | --turn <uuid> [--no-prompt] [--json] | --conversation <uuid>");

  const rest = async (path) => {
    const res = await fetch(`${URL_}/rest/v1/${path}`, { headers: { apikey: KEY, authorization: `Bearer ${KEY}` } });
    if (!res.ok) fail(2, `${path.split("?")[0]} ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return res.json();
  };
  // By the workspace first, the key the table is indexed by, and without the requests: a list needs one line a turn.
  const turnsOf = (tenant, conversation) =>
    rest(
      `model_turns?tenant_id=eq.${tenant}&conversation_id=eq.${conversation}` +
        "&select=id,created_at,model,response&order=created_at.desc&limit=50",
    );
  const list = async (tenant, conversation, why) => {
    const turns = await turnsOf(tenant, conversation);
    if (!turns.length)
      fail(1, `${why}No turn is kept for conversation ${conversation}: none was taken, or its thirty days are up.`);
    console.log(`${why}The turns kept for conversation ${conversation}, newest first:\n`);
    for (const t of turns) console.log(turnLine(t));
    console.log("\nRead one with --turn <uuid>.");
  };

  let turnId = by === "turn" ? id : null;
  /** The settings' version the reply's row names, when the turn was asked for by its reply. */
  let settingsVersion = null;
  if (by === "conversation") {
    const [c] = await rest(`conversations?id=eq.${id}&select=tenant_id`);
    if (!c) fail(1, `No conversation ${id}.`);
    return list(c.tenant_id, id, "");
  }
  if (by === "message") {
    const [m] = await rest(`messages?id=eq.${id}&select=id,tenant_id,conversation_id,sender,created_at,meta`);
    if (!m) fail(1, `No message ${id}.`);
    turnId = typeof m.meta?.turn_id === "string" ? m.meta.turn_id : null;
    settingsVersion = Number.isInteger(m.meta?.config_version) ? m.meta.config_version : null;
    if (!turnId)
      return list(
        m.tenant_id,
        m.conversation_id,
        `Message ${id} (${m.sender}, ${m.created_at}) names no turn: a holding reply, a person's own message, or a row from before turns were kept.\n`,
      );
  }
  const [turn] = await rest(`model_turns?id=eq.${turnId}`);
  if (!turn) fail(1, `Turn ${turnId} is not kept: its thirty days are up, or its conversation was erased.`);
  const [prompt] = await rest(`model_prompts?tenant_id=eq.${turn.tenant_id}&prompt_hash=eq.${turn.prompt_hash}`);
  const [settings] =
    settingsVersion === null
      ? []
      : await rest(`tenant_config_versions?tenant_id=eq.${turn.tenant_id}&version=eq.${settingsVersion}`);
  if (process.argv.includes("--json"))
    console.log(JSON.stringify({ turn, prompt: prompt ?? null, settings: settings ?? null }, null, 2));
  else {
    console.log(turnText(turn, prompt ?? null, { withPrompt: !process.argv.includes("--no-prompt") }));
    if (settingsVersion !== null) console.log(`\n${settingsLine(settingsVersion, settings ?? null)}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
