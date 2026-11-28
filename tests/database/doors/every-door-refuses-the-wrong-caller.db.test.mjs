/**
 * Every door a signed-in person may call, called as the wrong person, on the stack (decision 0150).
 *
 * `_walk.mjs` says what the walk does and what each call is held to. It is one statement through the CLI, as the
 * catalog suites are: a block that seeds two workspaces, calls every function the session role may execute as nobody, a
 * session with no person, another workspace's owner, a viewer, an operator, a partner with and without the second
 * factor and the owner, and ends by raising what it found, so everything it wrote is rolled back. The list of doors is
 * the database's own, so a door a migration adds is walked by the pull request that adds it.
 *
 * Proved first on PGlite (dev-tools/db-without-docker example-doors-refuse.mjs runs the same statement).
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import {
  ANSWERS_NO_PERSON_IN_WORDS,
  A_PASSWORD_ALONE_MAY,
  A_VIEWER_WRITES,
  REFUSES_IN_WORDS,
  SAME_FOR_EVERYONE,
} from "./_lists.mjs";
import { noLocalStack, reportOf, saidBy, walkSql } from "./_walk.mjs";

const skip = noLocalStack();

let report;
before(() => {
  if (skip) return;
  const said = saidBy(walkSql());
  report = reportOf(said);
  assert.ok(report, `the walk itself broke, before it could say what it found:\n${said.slice(-2000)}`);
});

/** A list of the walk's held to the names beside it, both ways. */
function heldBothWays(found, named, missing, spare) {
  assert.deepEqual(
    found.filter((door) => !(door in named)),
    [],
    missing,
  );
  assert.deepEqual(
    Object.keys(named).filter((door) => !found.includes(door)),
    [],
    spare,
  );
}

test(
  "the walk has a row for every table that names a workspace and for every id a door takes, so no door is called with nothing",
  { skip },
  () => {
    assert.deepEqual(
      report.unseeded,
      {},
      "a table the walk could not seed (a new one with a rule the catalog cannot say): give its row what it must hold in SEED_VALUES",
    );
    assert.deepEqual(
      report.unresolved,
      {},
      "an id a door takes that the walk has no row for: name its table in ARG_ROWS, or for that door alone in DOOR_ARGS",
    );
    assert.ok(report.doors > 300, `every door is walked (${report.doors})`);
    assert.ok(report.calls > report.doors * 10, `each as every caller (${report.calls} calls)`);
  },
);

test(
  "every door refuses the wrong caller: nobody signed in is refused; who is not a member changes nothing of the workspace's, writes nothing at a door that names it, and is answered as for rows that exist nowhere; a member's seat passes only a check the door makes",
  { skip },
  () => {
    assert.deepEqual(
      report.offences.map((o) => `${o.door}: ${o.what}\n  got ${JSON.stringify(o.got)}`),
      [],
      "a door answered or wrote for a caller it should refuse: ask who is calling first, in the house's form " +
        "(is_acting_member, caller_has_permission or may_read_workspace with the workspace's own id; a session with no " +
        "person in it refused with 28000), and name every row by its workspace",
    );
  },
);

test(
  "a door that answers a stranger exactly as it answers the owner has not been asked anything: it is given arguments that reach its question, or named with why",
  { skip },
  () => {
    // A door that runs as its caller reads what the caller's own row rules give, which database/tenancy/ proves: only
    // the doors that run as their owner are held to the list.
    const same = report.same_for_everyone.filter((d) => d.definer).map((d) => d.door);
    heldBothWays(
      same,
      SAME_FOR_EVERYONE,
      "a door that runs as its owner and answers everyone the same: give it arguments it takes in DOOR_ARGS, so the call reaches where it asks who is calling, or name it in SAME_FOR_EVERYONE with why",
      "named as answering everyone the same, but the walk now tells its callers apart (or it is gone): take it off the list",
    );
  },
);

test(
  "a viewer writes nothing through a door, but their own marks: where a door's text makes no check the walk knows, each door a viewer writes through is named",
  { skip },
  () => {
    heldBothWays(
      report.no_check_known.filter((d) => d.viewer_wrote).map((d) => d.door),
      A_VIEWER_WRITES,
      "a viewer wrote through this door: viewers read only (is_acting_member), or name it in A_VIEWER_WRITES with what of their own it writes",
      "named as a door a viewer writes through, but the walk saw no write (or it is gone): take it off the list",
    );
  },
);

test(
  "a partner on a password alone is nobody's member (decision 0013): they write nothing and are answered as a stranger is, but at the doors named",
  { skip },
  () => {
    heldBothWays(
      report.password_alone.map((d) => d.door),
      A_PASSWORD_ALONE_MAY,
      "a partner's password alone opened this door: a partner's seat counts only once session_shows_second_factor() (00261, 00280), or name it in A_PASSWORD_ALONE_MAY with why",
      "named as open to a partner's password alone, but the walk saw it refuse (or it is gone): take it off the list",
    );
  },
);

test(
  "a seat that passes none of a door's own checks is refused; a door that says so in words and not by raising is named",
  { skip },
  () => {
    const found = report.seat_answered.map((d) => `${d.door} · ${d.who}`);
    const named = Object.entries(REFUSES_IN_WORDS).flatMap(([door, seats]) =>
      Object.keys(seats).map((who) => `${door} · ${who}`),
    );
    assert.deepEqual(
      report.seat_answered.filter((d) => d.as_owner).map((d) => `${d.door} · ${d.who}`),
      [],
      "a seat that passes none of the door's checks was answered exactly as the owner was",
    );
    assert.deepEqual(
      found.filter((x) => !named.includes(x)),
      [],
      "a seat the door's own text gives no pass was answered, and not as a stranger is: refuse it, or name the door and the seat in REFUSES_IN_WORDS with why the answer is a refusal",
    );
    assert.deepEqual(
      named.filter((x) => !found.includes(x)),
      [],
      "named as refusing in words, but the walk saw it raise or answer as to a stranger (or it is gone): take it off the list",
    );
  },
);

test(
  "a session with no person in it is refused at a door that names a workspace or a row; one that answers no, nothing or not found is named",
  { skip },
  () => {
    assert.deepEqual(
      report.no_person_answered.filter((d) => Object.keys(d.wrote).length > 0).map((d) => d.door),
      [],
      "a session with no person in it wrote through this door",
    );
    heldBothWays(
      report.no_person_answered.map((d) => d.door),
      ANSWERS_NO_PERSON_IN_WORDS,
      "a door answered a session with no person in it: refuse it (28000) as decision 0150 says, or, where the answer is no, nothing or not found, name it in ANSWERS_NO_PERSON_IN_WORDS",
      "named as answering a session with no person in words, but the walk saw it raise (or it is gone): take it off the list",
    );
  },
);
