/**
 * "Not a person" in Delete person's sheet (surfaces/settings/connections/left-senders.tsx, 00483), drawn on the stub
 * React: each switch's words are drawn beside it and name it, so the owner reads what the switch does. On production
 * (27 Oct 2026) the words were the switch's accessible name alone and the sheet showed a bare switch.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { installLegacyReact, fresh, again, find, byTestId, textOf } from "../../_legacy-react.mjs";

installLegacyReact();
const { NotAPersonSwitches } =
  await import("../../../../../apps/dashboard/src/surfaces/settings/connections/left-senders.tsx");
const { MAILBOX_SENDERS_WORDS: W } = await import("../../../../../packages/contracts/src/email/mailbox-senders.ts");

const draw = (email, del) => {
  fresh();
  return again(() => globalThis.React.createElement(NotAPersonSwitches, { email, del, setDel() {} }));
};
const said = (n) => textOf(n).replace(/\s+/g, " ").trim();
/** The words a switch is named by: drawn in the tree, under the id it points at. */
const wordsOf = (tree, testid) => {
  const sw = byTestId(tree, testid);
  assert.ok(sw, `${testid} is drawn`);
  assert.equal(sw.props.label, undefined, `${testid}: named by the words beside it, not by an unseen label`);
  const id = sw.props.labelledBy;
  assert.ok(id, `${testid} points at its words`);
  const words = find(tree, (n) => n.props?.id === id && n !== sw);
  assert.ok(words, `${testid}: its words are drawn`);
  return said(words);
};

test("the switch's words are drawn beside it and name it", () => {
  const tree = draw("account-update@amazon.com", { typed: "", busy: false, error: null, bot: false, domain: false });
  assert.equal(wordsOf(tree, "delete-not-a-person"), W.notAPerson);
  assert.equal(byTestId(tree, "delete-not-a-person-domain"), null, "the domain waits for the first switch");
});

test("on, the whole domain is offered with its own words", () => {
  const tree = draw("account-update@amazon.com", { typed: "", busy: false, error: null, bot: true, domain: false });
  assert.equal(wordsOf(tree, "delete-not-a-person"), W.notAPerson);
  assert.equal(wordsOf(tree, "delete-not-a-person-domain"), W.wholeDomain("amazon.com"));
});

test("a free-mail address is offered alone, and a person with no address is offered nothing", () => {
  const gmail = draw("someone@gmail.com", { typed: "", busy: false, error: null, bot: true, domain: false });
  assert.equal(wordsOf(gmail, "delete-not-a-person"), W.notAPerson);
  assert.equal(byTestId(gmail, "delete-not-a-person-domain"), null);
  const none = draw(null, { typed: "", busy: false, error: null, bot: false, domain: false });
  assert.equal(byTestId(none, "delete-not-a-person"), null);
});
