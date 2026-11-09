/**
 * An edge door reads its body through the door contracts declares for it (decision 0109): the body it always read,
 * whether its schema holds it or not, and one line naming the fields a body breaks, never what they held. The door
 * refuses at the schema once production has sent nothing the schema refuses; until then its op refuses in its own words.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "../../_source.mjs";
import { fieldsOf, linesOf } from "../../_log-lines.mjs";

const { readBody } = await importSrc("apps/edge/lib/shared/admin-door.ts");
const { LINES_DOOR } = await importSrc("packages/contracts/src/lines/edge-doors.ts");
const { DRAFT_DOOR } = await importSrc("packages/contracts/src/conversations/edge-doors.ts");

const said = (lines) => lines.filter((l) => l.event === "door_body_unexpected");

test("a body its door holds is read as it was sent, and nothing is said", async () => {
  const sent = { op: "search", area_code: 305 };
  const { result, lines } = await linesOf(() => readBody(JSON.stringify(sent), LINES_DOOR));
  assert.deepEqual(result, sent);
  assert.deepEqual(said(lines), []);
});

test("a body its door does not hold is still read as it was sent, and its fields are said without their values", async () => {
  const sent = { op: "search", area_code: true, tenant_id: "not-a-workspace" };
  const { result, lines } = await linesOf(() => readBody(JSON.stringify(sent), LINES_DOOR));
  assert.deepEqual(result, sent, "the op still decides, in its own words");
  const [line, ...more] = said(lines);
  assert.equal(more.length, 0);
  assert.deepEqual(fieldsOf(line), { door: "/api/admin/lines", fields: ["area_code", "tenant_id"] });
  assert.ok(!JSON.stringify(line).includes("not-a-workspace"), "a field's value never reaches the log");
});

test("a field the door needs, missing, is said by its name", async () => {
  const { result, lines } = await linesOf(() => readBody(JSON.stringify({ kind: "reply" }), DRAFT_DOOR));
  assert.deepEqual(result, { kind: "reply" });
  assert.deepEqual(fieldsOf(said(lines)[0]).fields, ["conversation_id"]);
});

test("what is not a JSON object is an empty body, as it always was", async () => {
  for (const text of ["[1, 2]", "null", "7", '"op"', "op=search", ""]) {
    const { result } = await linesOf(() => readBody(text, LINES_DOOR));
    assert.deepEqual(result, {}, JSON.stringify(text));
  }
});

test("a request is read once, as text, as the door read it before", async () => {
  const request = new Request("https://edge.example.com/api/admin/lines", {
    method: "POST",
    body: JSON.stringify({ op: "status" }),
  });
  const { result } = await linesOf(() => readBody(request, LINES_DOOR));
  assert.deepEqual(result, { op: "status" });
  assert.equal(request.bodyUsed, true);
});
