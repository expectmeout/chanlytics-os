/**
 * An edge door reads its body through the door contracts declares for it (decision 0109): a body its schema holds is
 * handed to the op as it was sent; one it does not hold is refused at the door, 400 `bad_request`, naming the fields a
 * body breaks and never what they held, and said in one log line the same way. The op never runs on it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "../../_source.mjs";
import { fieldsOf, linesOf } from "../../_log-lines.mjs";

const { readBody } = await importSrc("apps/edge/lib/shared/admin-door.ts");
const { LINES_DOOR } = await importSrc("packages/contracts/src/lines/edge-doors.ts");
const { DRAFT_DOOR } = await importSrc("packages/contracts/src/conversations/edge-doors.ts");
const { INTAKE_REPLAY_DOOR } = await importSrc("packages/contracts/src/console/edge-doors.ts");

const lineSaid = (lines) => lines.filter((l) => l.event === "door_body_unexpected");

test("a body its door holds is handed on as it was sent, and nothing is said", async () => {
  const sent = { op: "search", area_code: 305 };
  const { result, lines } = await linesOf(() => readBody(JSON.stringify(sent), LINES_DOOR));
  assert.deepEqual(result, { ok: true, body: sent });
  assert.deepEqual(lineSaid(lines), []);
});

test("a body its door does not hold is refused, 400 bad_request, its fields named in the log and their values never", async () => {
  const sent = { op: "search", area_code: true, tenant_id: "not-a-workspace" };
  const { result, lines } = await linesOf(() => readBody(JSON.stringify(sent), LINES_DOOR));
  assert.equal(result.ok, false, "the op never runs on it");
  assert.equal(result.response.status, 400);
  const answer = await result.response.json();
  assert.equal(answer.error, "bad_request");
  assert.equal(answer.detail, undefined, "the fields are the log's, never the answer's");
  assert.ok(!JSON.stringify(answer).includes("not-a-workspace"), "a field's value never reaches the answer");
  const [line, ...more] = lineSaid(lines);
  assert.equal(more.length, 0);
  assert.deepEqual(fieldsOf(line), { door: "/api/admin/lines", fields: ["area_code", "tenant_id"] });
  assert.ok(!JSON.stringify(line).includes("not-a-workspace"), "a field's value never reaches the log");
});

test("a field the door needs, missing, is refused by its name", async () => {
  const { result, lines } = await linesOf(() => readBody(JSON.stringify({ kind: "reply" }), DRAFT_DOOR));
  assert.equal(result.ok, false);
  assert.equal((await result.response.json()).error, "bad_request");
  assert.deepEqual(fieldsOf(lineSaid(lines)[0]).fields, ["conversation_id"]);
});

test("what is not a JSON object is an empty body, held to the schema like any other", async () => {
  for (const text of ["[1, 2]", "null", "7", '"op"', "op=search", ""]) {
    const { result } = await linesOf(() => readBody(text, INTAKE_REPLAY_DOOR));
    assert.deepEqual(result, { ok: true, body: {} }, JSON.stringify(text));
    const { result: needing } = await linesOf(() => readBody(text, LINES_DOOR));
    assert.equal(needing.ok, false, "an empty body a door needs a field of is refused like a wrong one");
  }
});

test("a request is read once, as text, as the door read it before", async () => {
  const request = new Request("https://edge.example.com/api/admin/lines", {
    method: "POST",
    body: JSON.stringify({ op: "status" }),
  });
  const { result } = await linesOf(() => readBody(request, LINES_DOOR));
  assert.deepEqual(result, { ok: true, body: { op: "status" } });
  assert.equal(request.bodyUsed, true);
});
