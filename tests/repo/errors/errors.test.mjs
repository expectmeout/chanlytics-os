/**
 * A failure keeps what it knows on its way up (decision 0114). Each of `_errors.mjs`'s readings is kept honest on a source
 * written for it, then the backend is held to it. A reading at zero is a line nobody may add, with no `Debt:` to argue it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import {
  across,
  droppedCausesIn,
  droppedCodesIn,
  quietCatchesIn,
  replyTextAnsweredIn,
  textHandedOverIn,
} from "./_errors.mjs";

const source = (...lines) => ts.createSourceFile("probe.ts", lines.join("\n"), ts.ScriptTarget.Latest, true);
const lines = (measure, ...text) => measure(source(...text));

test("droppedCodesIn: a reply's failure raised by hand, in every shape, and nothing else", () => {
  assert.deepEqual(lines(droppedCodesIn, "if (error) throw new Error(error.message);"), [1]);
  assert.deepEqual(lines(droppedCodesIn, "if (r.error) throw new Error(`label: ${r.error.message}`);"), [1]);
  assert.deepEqual(lines(droppedCodesIn, 'if (!x) throw new Error(error?.message ?? "no row");'), [1]);
  assert.deepEqual(
    lines(droppedCodesIn, "if (error) throw Object.assign(new Error(error.message), { code: error.code });"),
    [1],
  );
  assert.deepEqual(lines(droppedCodesIn, "function f(error) { return new Error(error.message); }"), [1]);
  assert.deepEqual(lines(droppedCodesIn, "if (error) throw error;"), [1], "the client's reply object, as it is");
  assert.deepEqual(lines(droppedCodesIn, "if (cfg.error) throw cfg.error;"), [1]);
  // What keeps it, and what was never a reply's.
  assert.deepEqual(lines(droppedCodesIn, 'if (error) throw new DbFailure(error, "label");'), []);
  assert.deepEqual(lines(droppedCodesIn, 'throw new Error("no such thing");'), []);
  assert.deepEqual(lines(droppedCodesIn, "if (halt.stopped) throw halt.error;"), [], "held from a catch");
  // A caught failure's own wrap is droppedCausesIn's.
  assert.deepEqual(lines(droppedCodesIn, "try { f(); } catch (error) { throw new Error(error.message); }"), []);
  assert.deepEqual(lines(droppedCodesIn, "p.catch((error) => { throw new Error(error.message); });"), []);
});

test("quietCatchesIn: a catch that does nothing and says nothing", () => {
  assert.deepEqual(lines(quietCatchesIn, "try { f(); } catch {}"), [1], "empty");
  assert.deepEqual(lines(quietCatchesIn, "try { f(); } catch { return null; }"), [1], "a value stands in");
  assert.deepEqual(lines(quietCatchesIn, "try { f(); } catch { x = []; }"), [1]);
  assert.deepEqual(lines(quietCatchesIn, "p.catch(() => {});"), [1]);
  assert.deepEqual(lines(quietCatchesIn, "const v = await p.catch(() => null);"), [1]);
  assert.deepEqual(lines(quietCatchesIn, "p.then(ok, () => null);"), [1]);
  // A reason, a record, an act or a re-raise.
  assert.deepEqual(lines(quietCatchesIn, "try { f(); } catch { /* the feed is optional */ }"), []);
  assert.deepEqual(
    lines(quietCatchesIn, "try { f(); } catch {", "  // not JSON: a plain string, as sent", "  return null;", "}"),
    [],
  );
  assert.deepEqual(lines(quietCatchesIn, "// A copy: losing one costs nothing.", "p.catch(() => {});"), []);
  assert.deepEqual(lines(quietCatchesIn, "p.catch(() => {}); // a copy"), []);
  assert.deepEqual(lines(quietCatchesIn, "try { f(); } catch (e) { log.warn('x', { error: e }); }"), []);
  assert.deepEqual(lines(quietCatchesIn, "try { f(); } catch (e) { throw e; }"), []);
  assert.deepEqual(lines(quietCatchesIn, "p.catch((e) => answer(e));"), []);
});

test("droppedCausesIn: a new error from a catch that leaves the caught one behind", () => {
  assert.deepEqual(lines(droppedCausesIn, 'try { f(); } catch { throw new Error("no"); }'), [1]);
  assert.deepEqual(
    lines(droppedCausesIn, 'try { f(); } catch (e) { throw new AppError("internal", "no", 503); }'),
    [1],
  );
  assert.deepEqual(lines(droppedCausesIn, 'p.catch(() => { throw new Error("no"); });'), [1]);
  // What keeps it.
  assert.deepEqual(lines(droppedCausesIn, 'try { f(); } catch (e) { throw new Error("no", { cause: e }); }'), []);
  assert.deepEqual(
    lines(
      droppedCausesIn,
      'try { f(); } catch (e) { throw new AppError("internal", "no", 503, undefined, { cause: e }); }',
    ),
    [],
  );
  assert.deepEqual(lines(droppedCausesIn, "try { f(); } catch (e) { throw dbRefusal(e); }"), []);
  assert.deepEqual(lines(droppedCausesIn, "try { f(); } catch (e) { throw e; }"), []);
});

test("textHandedOverIn: a caught failure's own text answered to whoever asked", () => {
  assert.deepEqual(lines(textHandedOverIn, "try { f(); } catch (e) { return refuse(e.message); }"), [1]);
  assert.deepEqual(
    lines(
      textHandedOverIn,
      'try { f(); } catch (e) { return refuse(503, "read_failed", e instanceof Error ? e.message : String(e)); }',
    ),
    [1],
  );
  assert.deepEqual(lines(textHandedOverIn, "p.catch((e) => json(500, { ok: false, detail: String(e) }));"), [1]);
  assert.deepEqual(
    lines(textHandedOverIn, 'try { f(); } catch (e) { return refuse(503, "read_failed", errField(e)); }'),
    [1],
  );
  // An AppError's sentence was written for a person; a log line is no answer.
  assert.deepEqual(
    lines(textHandedOverIn, "try { f(); } catch (e) { if (e instanceof AppError) return refuse(e.message); throw e; }"),
    [],
  );
  assert.deepEqual(
    lines(
      textHandedOverIn,
      'try { f(); } catch (e) { log.error("x", { error: e.message }); return refuse(500, "read_failed"); }',
    ),
    [],
  );
});

test("replyTextAnsweredIn: a reply's failure quoted in an answer, and only that", () => {
  assert.deepEqual(lines(replyTextAnsweredIn, 'if (error) return refuse(503, "read_failed", error.message);'), [1]);
  assert.deepEqual(
    lines(replyTextAnsweredIn, 'return { ok: false, error: "write_failed", detail: r.error.message };'),
    [1],
  );
  assert.deepEqual(
    lines(replyTextAnsweredIn, 'return { ok: false, code: "listing_read_failed", detail: String(e) };'),
    [1],
  );
  // Its own words; what a provider said; a line in the log.
  assert.deepEqual(lines(replyTextAnsweredIn, 'return refuseFailure(503, "read_failed", error);'), []);
  assert.deepEqual(lines(replyTextAnsweredIn, 'return { ok: false, error: "stripe_refused", detail: e.message };'), []);
  assert.deepEqual(lines(replyTextAnsweredIn, 'log.error("x", { error: error.message });'), []);
});

/** `{ file: [lines] }`, said so a failure names each place. */
const none = (found, advice) => assert.deepEqual(found, {}, advice);

test("a failure's text stays in the log: no answer quotes a caught failure or a reply's, unless written for a person", () => {
  none(
    across(textHandedOverIn),
    "Answer the code and plain words (refuseFailure on the edge, refuseThrown in Ask's tools), and log the text.",
  );
  none(
    across(replyTextAnsweredIn),
    "Answer the code and plain words (refuseFailure, logFailure on the edge), and log the text.",
  );
});

test("no reply's failure is raised without its code", () => {
  none(
    across(droppedCodesIn),
    'Raise it as new DbFailure(error, "what was being done"): the same sentence, with the code kept.',
  );
});
