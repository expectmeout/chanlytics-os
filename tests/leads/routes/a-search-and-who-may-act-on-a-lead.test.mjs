/**
 * The finder's routes: they declare their policy; a search estimated from the card's prices; who is refused before any
 * door; keep, exclude, put back and undo; a stage change; a draft; Check again and bulk Keep; the month read only for a
 * role that may find.
 *
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "../../_fake-db.mjs";
import {
  ROLE_PERMS,
  estimateRoundUsd,
  placesToAsk,
  whyCannotSpend,
  LEAD_ASKED_NOT_WRITTEN,
  LEAD_NO_ADDRESS,
  LEAD_PROBE_PLACES,
  SPEND_LEADS,
} from "@chanlytics/contracts";
import { PLAN } from "../../_lead-fixtures.mjs";
import {
  A,
  COUNTS,
  L1,
  LEAD,
  NAME,
  O1,
  OP,
  R1,
  S1,
  SEARCH,
  USER,
  answerRoute,
  bulk,
  calls,
  checkAgain,
  ctxFor,
  ctxOf,
  doors,
  draft,
  erase,
  exclude,
  exportRoute,
  get,
  inA,
  keep,
  leads,
  member,
  modelCalls,
  more,
  pageRow,
  putBack,
  refused,
  req,
  rpcCalls,
  search,
  searchUndo,
  searches,
  send,
  setServiceClient,
  stage,
  stop,
  suggestions,
  undo,
  world,
} from "./_routes.mjs";

test("release A's routes declare their policy (one search's GET went: no page called it, the closed-loop audit's J): the reads open to every member; a search, a top-up and what counts a lead the owner's or the partner's (0012), spending where money leaves; a stop the operator's", () => {
  const open = { kind: "read", role: null, rate: null, spend: false, scope: "workspace" };
  assert.deepEqual(searches.GET.policy, open);
  assert.deepEqual(leads.GET.policy, open);
  assert.deepEqual(searches.POST.policy, {
    kind: "write",
    scope: "workspace",
    role: "partner",
    rate: "lead_search",
    spend: true,
  });
  assert.deepEqual(more.POST.policy, {
    kind: "write",
    scope: "workspace",
    role: "partner",
    rate: "lead_search",
    spend: true,
  });
  assert.deepEqual(answerRoute.POST.policy, {
    kind: "write",
    scope: "workspace",
    role: "partner",
    rate: "lead_answer",
    spend: false,
  });
  assert.deepEqual(stop.POST.policy, {
    kind: "write",
    scope: "workspace",
    role: "operator",
    rate: "lead_answer",
    spend: false,
  });
  for (const r of [keep, exclude, putBack])
    assert.deepEqual(r.POST.policy, {
      kind: "write",
      scope: "workspace",
      role: "partner",
      rate: "lead_member",
      spend: false,
    });
  // An undo is the operator's since 00426: the door says whose act it is to take back (its maker's add, later, stage or
  // bulk; keep, exclude and put back find's alone), so the route opens at the lowest rung any of them needs.
  assert.deepEqual(undo.POST.policy, {
    kind: "write",
    scope: "workspace",
    role: "operator",
    rate: "lead_member",
    spend: false,
  });
});

test("the permission `find` and the routes agree: the roles that may find are the ones at or above the rung the counting routes name", () => {
  assert.deepEqual(
    [ROLE_PERMS.owner.find, ROLE_PERMS.partner.find, ROLE_PERMS.operator.find, ROLE_PERMS.viewer.find],
    [true, true, false, false],
  );
  const may = Object.entries(ROLE_PERMS)
    .filter(([, p]) => p.find)
    .map(([r]) => r)
    .sort();
  // The ladder requireRole climbs (with-route.ts ROLE_RANK): a route names its lowest rung.
  const ladder = ["viewer", "operator", "partner", "owner"];
  for (const r of [searches.POST, more.POST, keep.POST, putBack.POST])
    assert.deepEqual(
      ladder.slice(ladder.indexOf(r.policy.role)).sort(),
      may,
      "the door checks `find`; the route spells the rung: the roles at or above it must be the roles that may",
    );
});

test("REGRESSION (the live run of 14 Nov 2026): asked for more than the month has left, a search finds what is left now, and says how many were asked and when the rest can follow", async () => {
  const seen = [];
  const rpcs = {
    lead_allowance: () => 500,
    lead_month_used: () => ({ allowance: { used: 433, reserved: 0 }, budget: { used: 1, reserved: 0 } }),
    lead_search_create: (a) => {
      seen.push(a);
      return { search_id: S1, round_id: R1 };
    },
  };
  const many = { ...PLAN, count: 300 };
  const out = await searches.POST.run(send(many), ctxFor("owner", rpcs));
  assert.equal(seen[0].p_plan.count, 67, "the 67 left, never the door's question");
  assert.equal(out.count, 67);
  assert.equal(out.asked, 300);
  assert.match(out.renews_on, /\w+ \d+/);
  // Room for all of it: the plan's own count, and nothing about the rest.
  const roomy = await searches.POST.run(send({ ...PLAN, count: 20 }), ctxFor("owner", rpcs));
  assert.deepEqual(roomy, { search_id: S1, round_id: R1, count: 20 });
});

test("a search: the route computes the estimate from the card's prices and hands the plan and how it came to the door; the door's word comes back as a sentence", async () => {
  const seen = [];
  const rpcs = {
    lead_search_create: (a) => {
      seen.push(a);
      return { search_id: S1, round_id: R1 };
    },
  };
  const out = await searches.POST.run(send(PLAN), ctxFor("owner", rpcs));
  assert.deepEqual(out, { search_id: S1, round_id: R1, count: PLAN.count });
  const expected =
    Math.round(
      (estimateRoundUsd(PLAN, "probe", LEAD_PROBE_PLACES) +
        estimateRoundUsd(PLAN, "main", placesToAsk(PLAN, PLAN.count, 0.5).total)) *
        100,
    ) / 100;
  assert.deepEqual(seen, [{ p_tenant_id: A, p_plan: PLAN, p_via: "people", p_estimate_usd: expected }]);
  assert.ok(expected > 0.1 && expected < 2, `a twenty-lead search costs cents: ${expected}`);
  const viaAsk = { ...ctxFor("owner", rpcs), via: "ask" };
  await searches.POST.run(send(PLAN), viaAsk);
  assert.equal(seen[1].p_via, "ask");
  // A plan changed on a card before the search existed (planVersionOf counts each change) starts it at its first
  // version, the only one the door starts a search at: Find failed on a changed card (23 Oct 2026).
  await searches.POST.run(send({ ...PLAN, version: 3 }), ctxFor("owner", rpcs));
  assert.equal(seen[2].p_plan.version, 1);
  await refused(
    searches.POST.run(send(PLAN), ctxFor("owner", { lead_search_create: () => ({ error: "paused" }) })),
    "conflict",
    409,
  );
  await assert.rejects(
    searches.POST.run(send(PLAN), ctxFor("owner", { lead_search_create: () => ({ error: "paused" }) })),
    /Searching is paused for now\. Nothing was started\./,
  );
  await assert.rejects(
    searches.POST.run(
      send(PLAN),
      ctxFor("owner", { lead_search_create: () => ({ error: "month_leads_used", left: 3 }) }),
    ),
    /This month covers 3 more leads/,
  );
  await assert.rejects(
    searches.POST.run(
      send(PLAN),
      ctxFor("owner", { lead_search_create: () => ({ error: "month_leads_used", left: 0 }) }),
    ),
    /This month's leads are used up/,
    "the 501st, refused in a sentence",
  );
  await assert.rejects(
    searches.POST.run(send(PLAN), ctxFor("owner", { lead_search_create: () => ({ error: "budget_used" }) })),
    /searching budget is used/,
  );
  await assert.rejects(
    searches.POST.run(
      send(PLAN),
      ctxFor("owner", {
        lead_search_create: () => ({
          error: "month_leads_used",
          left: 0,
          sentence: "You have found this month's 500 leads. Your leads renew on Oct 1.",
        }),
      }),
    ),
    /You have found this month's 500 leads\. Your leads renew on Oct 1\./,
    "the door's own sentence, said as it is",
  );
  await refused(searches.POST.run(send({ ...PLAN, count: 5000 }), ctxFor("owner", rpcs)), "validation", 400);
});

test("a plan that lapsed between the route's billing check and the door's own (00364) is a 402 in the door's words", async () => {
  // Another owner, so the hour's count of searches is theirs alone.
  const OTHER = "u-lapsed";
  const ctx = {
    ...ctxFor(
      "owner",
      {
        lead_search_create: () => ({
          error: "payment_required",
          sentence: "Your last payment did not go through. Update the card in Billing, then try again.",
        }),
      },
      {},
      { memberships: [{ ...member("owner")[0], user_id: OTHER }] },
    ),
    userId: OTHER,
  };
  await assert.rejects(searches.POST.run(send(PLAN), ctx), (e) => {
    assert.deepEqual(
      [e.code, e.status, e.message],
      ["payment_required", 402, "Your last payment did not go through. Update the card in Billing, then try again."],
    );
    return true;
  });
});

test("a search from an Ask card names the thread it was planned in to the door, and the plan the door stores never carries it; a thread that is not an id is dropped, never a refusal", async () => {
  const THREAD = "77777777-7777-4777-8777-777777777771";
  const seen = [];
  const rpcs = {
    lead_search_create: (a) => {
      seen.push(a);
      return { search_id: S1, round_id: R1 };
    },
  };
  const viaAsk = () => ({ ...ctxFor("owner", rpcs), via: "ask" });
  assert.deepEqual(await searches.POST.run(send({ ...PLAN, thread_id: THREAD }), viaAsk()), {
    search_id: S1,
    round_id: R1,
    count: PLAN.count,
  });
  assert.equal(seen[0].p_thread_id, THREAD, "the door is handed the thread; it keeps it only when it is the caller's");
  assert.deepEqual(seen[0].p_plan, PLAN, "the stored plan is the plan alone");
  await searches.POST.run(send({ ...PLAN, thread_id: "not-a-thread" }), viaAsk());
  await searches.POST.run(send({ ...PLAN, thread_id: null }), viaAsk());
  await searches.POST.run(send(PLAN), ctxFor("owner", rpcs));
  assert.deepEqual(
    seen.slice(1).map((a) => ["p_thread_id" in a, a.p_plan]),
    [
      [false, PLAN],
      [false, PLAN],
      [false, PLAN],
    ],
    "no thread, or one that is not an id: the door is called as it always was",
  );
});

test("who is refused before any door: a viewer cannot search or undo, an operator cannot search, keep or put back, a workspace that cannot spend is refused before the rate is counted", async () => {
  const never = {
    lead_search_create: () => {
      throw new Error("must not be reached");
    },
    lead_member_keep: () => {
      throw new Error("must not be reached");
    },
    lead_member_put_back: () => {
      throw new Error("must not be reached");
    },
    lead_undo: () => {
      throw new Error("must not be reached");
    },
  };
  await refused(searches.POST.run(send(PLAN), ctxFor("viewer", never)), "forbidden", 403);
  await refused(searches.POST.run(send(PLAN), ctxFor("operator", never)), "forbidden", 403);
  await refused(keep.POST.run(send({ search_id: S1 }), ctxFor("operator", never, { id: L1 })), "forbidden", 403);
  await refused(putBack.POST.run(send({ search_id: S1 }), ctxFor("operator", never, { id: L1 })), "forbidden", 403);
  await refused(undo.POST.run(send({ version: 2 }), ctxFor("viewer", never, { id: O1 })), "forbidden", 403);
  await refused(exclude.POST.run(send({ search_id: S1 }), ctxFor("viewer", never, { id: L1 })), "forbidden", 403);
  const unpaid = {
    supabase: fakeDb(
      { memberships: member("owner"), billing_accounts: [{ tenant_id: A, mode: "stripe", status: "past_due" }] },
      {},
      never,
    ),
    userId: USER,
    email: "ada@example.com",
    params: {},
  };
  await refused(searches.POST.run(send(PLAN), unpaid), "payment_required", 402);
});

test("the answer takes the search's latest round: keep and stop as words, include with its amended plan; an operator may stop", async () => {
  const seen = [];
  const rpcs = {
    lead_round_answer: (a) => {
      seen.push(a);
      return { ok: true };
    },
    lead_round_stop: (a) => {
      seen.push(a);
      return { ok: true };
    },
  };
  assert.deepEqual(await answerRoute.POST.run(send({ answer: "keep" }), ctxFor("owner", rpcs, { id: S1 })), {
    round_id: R1,
    answered: "keep",
  });
  await refused(
    answerRoute.POST.run(send({ answer: "include" }), ctxFor("owner", rpcs, { id: S1 })),
    "validation",
    400,
  );
  await answerRoute.POST.run(
    send({ answer: "include", plan: { ...PLAN, version: 7, count: 500, exclusions: [] } }),
    ctxFor("owner", rpcs, { id: S1 }),
  );
  assert.deepEqual(
    seen.map((a) => [a.p_round_id, a.p_answer, a.p_plan?.version]),
    [
      [R1, "keep", undefined],
      [R1, "include", 2],
    ],
    "the route sets the version (the round's + 1); what the client sent is not trusted",
  );
  assert.equal(seen[1].p_plan.count, PLAN.count, "the route sets the count (the round's reservation), not the client");
  assert.deepEqual(seen[1].p_plan.exclusions, [], "the rest of the plan is the client's, as sent");
  await refused(answerRoute.POST.run(send({ answer: "keep" }), ctxFor("operator", rpcs, { id: S1 })), "forbidden", 403);
  assert.deepEqual(await stop.POST.run(send(undefined), ctxFor("operator", rpcs, { id: S1 })), {
    search_id: S1,
    stopping: true,
  });
  assert.deepEqual(seen.at(-1), { p_search_id: S1 });
  await assert.rejects(
    answerRoute.POST.run(
      send({ answer: "keep" }),
      ctxFor("owner", { lead_round_answer: () => ({ error: "state", state: "running" }) }, { id: S1 }),
    ),
    /not waiting for an answer/,
  );
});

test("the leads page is keyset-paged by the door under the caller's RLS: the search, the class as a filter, the sort key, the cursor and the size", async () => {
  // Release B widened this route's query (the rail's list, six sorts, a
  // direction and the {key, id} cursor), so A's arguments are now B's nine
  // with the rest at their defaults. The values changed; the point did not.
  const seen = [];
  const rpcs = {
    leads_page: (a) => {
      seen.push(a);
      return [];
    },
    lead_list_counts: () => ({ all: 0, ready: 0, nurture: 0, converted: 0, said_no: 0, not_a_fit: 0 }),
  };
  await leads.GET.run(get(`${inA}&search=${S1}`), ctxFor("viewer", rpcs, {}, { lead_searches: [] }));
  await leads.GET.run(
    get(`${inA}&search=${S1}&class=review&sort=distance&after_key=k9&after_id=${L1}&limit=50`),
    ctxFor("viewer", rpcs, {}, { lead_searches: [] }),
  );
  assert.deepEqual(seen, [
    {
      p_tenant_id: A,
      p_search_id: S1,
      p_class: null,
      p_sort: "fit",
      p_after_key: null,
      p_limit: 500,
      p_list: "all",
      p_dir: "asc",
      p_after_id: null,
    },
    {
      p_tenant_id: A,
      p_search_id: S1,
      p_class: "review",
      p_sort: "distance",
      p_after_key: "k9",
      p_limit: 50,
      p_list: "all",
      p_dir: "asc",
      p_after_id: L1,
    },
  ]);
  await refused(
    leads.GET.run(get(`${inA}&sort=nonsense`), ctxFor("viewer", rpcs, {}, { lead_searches: [] })),
    "validation",
    400,
  );
});

test("keep, exclude, put back and undo reach their doors with the ids and the version; a hidden place and a changed record are refused in sentences", async () => {
  const seen = [];
  // The ledger is written as the service role (a session may not insert into events): stood in, and read below.
  const ledger = { events: [] };
  setServiceClient(fakeDb(ledger));

  const rpcs = {
    lead_member_keep: (a) => {
      seen.push(["keep", a]);
      return { op_id: O1, version: 3 };
    },
    lead_member_exclude: (a) => {
      seen.push(["exclude", a]);
      return { op_id: O1, version: 4 };
    },
    lead_member_put_back: () => ({ error: "hidden" }),
    lead_undo: (a) => {
      seen.push(["undo", a]);
      return { error: "changed" };
    },
  };
  assert.deepEqual(await keep.POST.run(send({ search_id: S1 }), ctxFor("owner", rpcs, { id: L1 })), {
    lead_id: L1,
    op_id: O1,
    version: 3,
  });
  assert.deepEqual(await exclude.POST.run(send({ search_id: S1 }), ctxFor("owner", rpcs, { id: L1 })), {
    lead_id: L1,
    op_id: O1,
    version: 4,
  });
  await assert.rejects(
    putBack.POST.run(send({ search_id: S1 }), ctxFor("owner", rpcs, { id: L1 })),
    /hidden: it is already a customer, or was erased/,
  );
  await assert.rejects(
    undo.POST.run(send({ version: 3 }), ctxFor("owner", rpcs, { id: O1 })),
    /Someone changed this since you saw it/,
  );
  assert.deepEqual(seen, [
    ["keep", { p_search_id: S1, p_lead_id: L1 }],
    ["exclude", { p_search_id: S1, p_lead_id: L1 }],
    ["undo", { p_op_id: O1, p_version: 3 }],
  ]);
  await refused(keep.POST.run(send({ search_id: S1 }), ctxFor("owner", rpcs, { id: "nope" })), "not_found", 404);
  setServiceClient(null);
  assert.deepEqual(
    ledger.events.map((e) => [e.kind, e.subject_type, e.subject_id, e.data]),
    [
      ["lead.kept", "lead", L1, { by: USER, search_id: S1 }],
      ["lead.excluded", "lead", L1, { by: USER, search_id: S1 }],
    ],
    "REGRESSION: a place kept (it counts against the month) or left out was on no ledger; a refused put-back says nothing",
  );
});

test("release B's ten declare their policy: working a lead is the operator's, erasing and exporting the owner's, removing and giving leads back the owner's or the partner's (0012), and none of them spends", () => {
  assert.deepEqual(search.PATCH.policy, {
    kind: "write",
    scope: "row",
    role: "operator",
    rate: "lead_member",
    spend: false,
  });
  assert.deepEqual(search.DELETE.policy, {
    kind: "write",
    scope: "row",
    role: "partner",
    rate: "lead_member",
    spend: false,
  });
  assert.deepEqual(searchUndo.POST.policy, {
    kind: "write",
    scope: "row",
    role: "partner",
    rate: "lead_member",
    spend: false,
  });
  assert.deepEqual(stage.POST.policy, {
    kind: "write",
    scope: "row",
    role: "operator",
    rate: "lead_member",
    spend: false,
  });
  assert.deepEqual(draft.POST.policy, {
    kind: "write",
    scope: "row",
    role: "operator",
    rate: "lead_draft",
    spend: false,
  });
  assert.deepEqual(erase.DELETE.policy, {
    kind: "write",
    fresh: true,
    scope: "row",
    role: "owner",
    rate: "erase",
    spend: false,
  });
  assert.deepEqual(bulk.POST.policy, {
    kind: "write",
    scope: "workspace",
    role: "operator",
    rate: "lead_bulk",
    spend: false,
  });
  assert.deepEqual(checkAgain.POST.policy, {
    kind: "write",
    scope: "workspace",
    role: "partner",
    rate: "lead_bulk",
    spend: true,
  });
  assert.equal(exportRoute.GET, undefined, "a copy that marks leads is no GET (decision 0047, lane 6)");
  assert.deepEqual(exportRoute.POST.policy, {
    kind: "write",
    fresh: true,
    scope: "workspace",
    role: "owner",
    rate: "export",
    spend: false,
  });
  assert.deepEqual(suggestions.GET.policy, {
    kind: "read",
    scope: "workspace",
    role: null,
    rate: "lead_ideas_read",
    spend: false,
  });
  assert.deepEqual(suggestions.PUT.policy, {
    kind: "write",
    scope: "workspace",
    role: "partner",
    rate: "lead_line",
    spend: false,
  });
  // The money: a search, more of one, and a mailbox check asked again (D3) are the only places `spend` is true.
  assert.deepEqual(
    [searches.POST.policy.spend, more.POST.policy.spend, checkAgain.POST.policy.spend],
    [true, true, true],
  );
});

test("a refusal to spend on a search says what the money was for, and the lines door keeps saying its own", () => {
  assert.equal(
    whyCannotSpend("stripe", "none", SPEND_LEADS),
    "Start your free trial from Billing before finding leads.",
  );
  assert.equal(whyCannotSpend("stripe", "none"), "Start your free trial from Billing before buying a number.");
  // A free trial finds leads, up to the trial's own (decision 0090: the trial covers everything; lead_reserve holds the
  // trial's count).
  assert.equal(whyCannotSpend("stripe", "trialing", SPEND_LEADS), null);
  assert.equal(
    whyCannotSpend("stripe", "unpaid", SPEND_LEADS),
    "Billing needs attention before this workspace can find leads. Open Billing to sort it out.",
  );
  for (const status of ["none", "trialing", "paused", "unpaid"]) {
    assert.equal(/buying a number|buy a number/.test(whyCannotSpend("stripe", status, SPEND_LEADS)), false, status);
  }
});

test("a stage change goes through the door with the page's words made its arguments, and a click to Talking says the lead is still a lead", async () => {
  const rpcs = doors();
  const click = await stage.POST.run(
    req("POST", { kind: "stage", stage: "converted" }),
    ctxOf(world({ role: "operator" }), { id: LEAD }, rpcs),
  );
  assert.deepEqual(rpcCalls("lead_set_stage")[0], {
    p_lead_id: LEAD,
    p_stage: "converted",
    p_reason: null,
    p_fit_reason: null,
    p_outcome: null,
    p_note: null,
    p_spoke_with: null,
  });
  assert.equal(click.toast, "Marked talking. They join People when they write or call in, or when a call goes well.");
  assert.deepEqual([click.converted, click.contact_id, click.undo], [false, null, { op_id: OP, version: 4 }]);
  const call = await stage.POST.run(
    req("POST", { kind: "outcome", outcome: "interested", note: "Tuesday", spoke_with: "  Priya Nair " }),
    ctxOf(world({ role: "operator" }), { id: LEAD }, rpcs),
  );
  assert.equal(call.toast, "Travis Heights Coaching Co. is in People now, with this call on their page.");
  assert.equal(call.undo, null, "a person made is not undone from a toast");
  assert.deepEqual(rpcCalls("lead_set_stage")[1], {
    p_lead_id: LEAD,
    p_stage: "converted",
    p_reason: null,
    p_fit_reason: null,
    p_outcome: "interested",
    p_note: "Tuesday",
    // Who they spoke with (0052): the person the call makes, named as typed.
    p_spoke_with: "Priya Nair",
  });
});

test("every other act on one lead says what it did, and Already a customer says the place is hidden", async () => {
  const rpcs = doors();
  const said = async (body) =>
    (await stage.POST.run(req("POST", body), ctxOf(world({ role: "operator" }), { id: LEAD }, rpcs))).toast;
  assert.deepEqual(
    await Promise.all([
      said({ kind: "emailed" }),
      said({ kind: "said_no" }),
      said({ kind: "not_a_fit", why: "chain" }),
      said({ kind: "not_a_fit", why: "customer" }),
      said({ kind: "outcome", outcome: "voicemail" }),
      said({ kind: "outcome", outcome: "not_interested" }),
      said({ kind: "outcome", outcome: "wrong_number" }),
    ]),
    [
      "Marked contacted.",
      "Marked as said no.",
      "Not a fit.",
      "Hidden from every future search.",
      "Marked contacted.",
      "Marked as said no.",
      "That number is marked wrong.",
    ],
  );
  assert.deepEqual(rpcCalls("lead_set_stage")[3], {
    p_lead_id: LEAD,
    p_stage: "archived",
    p_reason: "customer",
    p_fit_reason: "customer",
    p_outcome: null,
    p_note: null,
    p_spoke_with: null,
  });
  await refused(
    stage.POST.run(
      req("POST", { kind: "stage", stage: "archived" }),
      ctxOf(world({ role: "operator" }), { id: LEAD }, rpcs),
    ),
    "validation",
    400,
  );
});

test("a viewer is refused every write; an operator may work leads but not erase, export or remove a search", async () => {
  const never = () => {
    throw new Error("must not be reached");
  };
  const rpcs = doors({
    lead_set_stage: never,
    lead_erase: never,
    leads_page: never,
    lead_export_mark: never,
    lead_search_remove: never,
  });
  for (const [route, method, body, params, role] of [
    [stage, "POST", { kind: "said_no" }, { id: LEAD }, "viewer"],
    [erase, "DELETE", undefined, { id: LEAD }, "operator"],
    [exportRoute, "POST", { list: "all", sort: "fit", dir: "asc" }, {}, "operator"],
    [search, "DELETE", undefined, { id: SEARCH }, "operator"],
    [searchUndo, "POST", undefined, { id: SEARCH }, "operator"],
    [suggestions, "PUT", { business_line: "a personal training studio" }, {}, "operator"],
    [bulk, "POST", { by: "ids", action: "contacted", ids: [LEAD] }, {}, "viewer"],
    [checkAgain, "POST", { ids: [LEAD] }, {}, "operator"],
  ])
    await refused(route[method].run(req(method, body), ctxOf(world({ role }), params, rpcs)), "forbidden", 403);
  assert.deepEqual(calls, [], "not one door was reached");
});

test("a draft needs the business's address, its foot is code's, and the model is asked once with the lead's facts quoted", async () => {
  await assert.rejects(
    draft.POST.run(req("POST", {}), ctxOf(world({ role: "operator", address: null }), { id: LEAD }, doors())),
    (e) => e.message === LEAD_NO_ADDRESS,
  );
  assert.equal(modelCalls.length, 0, "no model call without an address");
  const out = await draft.POST.run(req("POST", {}), ctxOf(world({ role: "operator" }), { id: LEAD }, doors()));
  assert.ok(out.body.endsWith('Not interested? Reply "no thanks" and I won\'t write again.'), out.body);
  assert.ok(out.body.includes("Zilker Strength · 1 Main St, Austin, TX 78704"), "the postal address the law asks for");
  assert.equal("mailto" in out, false, "no mail app's road: a mailbox sends it (decision 0116)");
  assert.deepEqual(
    [modelCalls.length, modelCalls[0].purpose, modelCalls[0].request.max_tokens],
    [1, "lead_draft", 600],
  );
  assert.equal(modelCalls[0].request.output_config.format.type, "json_schema");
  const asked = JSON.stringify(modelCalls[0].request.messages);
  for (const fact of [
    NAME,
    "Austin, TX",
    "travisheightscoaching.example",
    "4.9 from 61 reviews",
    "small-group training",
  ]) {
    assert.ok(asked.includes(fact), `the model is given ${fact}`);
  }
  assert.equal(
    /apify|compass|bounceverify/i.test(asked + modelCalls[0].request.system),
    false,
    "no vendor is named to the model or the owner",
  );
  await assert.rejects(
    draft.POST.run(req("POST", {}), ctxOf(world({ role: "operator", emailState: "invalid" }), { id: LEAD }, doors())),
    (e) => e.message === "This lead has no address that reaches them. Call instead.",
  );
});

test("a draft to an address on the never-again list is refused before the model is asked, and a list that can't be read is no yes", async () => {
  const before = modelCalls.length;
  const asked = [];
  const held = (a) => {
    asked.push(a);
    return ["hello@travisheightscoaching.example"];
  };
  await assert.rejects(
    draft.POST.run(
      req("POST", {}),
      ctxOf(world({ role: "operator" }), { id: LEAD }, doors({ lead_addresses_suppressed: held })),
    ),
    (e) => e.message === LEAD_ASKED_NOT_WRITTEN && e.status === 409,
  );
  assert.deepEqual(asked, [{ p_tenant_id: A, p_addresses: ["hello@travisheightscoaching.example"] }]);
  const unread = () => {
    throw Object.assign(new Error("no answer"), { code: "XX000" });
  };
  await assert.rejects(
    draft.POST.run(
      req("POST", {}),
      ctxOf(world({ role: "operator" }), { id: LEAD }, doors({ lead_addresses_suppressed: unread })),
    ),
  );
  assert.equal(modelCalls.length, before, "not one model call, either way");
});

test("bulk acts on the ids, or on the view for Select all that match; the door gets one or the other", async () => {
  const rpcs = doors();
  await bulk.POST.run(
    req("POST", { by: "ids", action: "contacted", ids: [LEAD] }),
    ctxOf(world({ role: "operator" }), {}, rpcs),
  );
  const out = await bulk.POST.run(
    req("POST", { by: "view", action: "not_a_fit", view: { list: "ready", sort: "fit", dir: "asc" } }),
    ctxOf(world({ role: "operator" }), {}, rpcs),
  );
  assert.deepEqual(
    rpcCalls("lead_bulk").map((a) => [a.p_action, a.p_ids, a.p_view?.list]),
    [
      ["contacted", [LEAD], undefined],
      ["not_a_fit", null, "ready"],
    ],
  );
  assert.deepEqual([out.done, out.toast], [2, "Not a fit."]);
  await refused(
    bulk.POST.run(
      req("POST", { by: "ids", action: "contacted", ids: [] }),
      ctxOf(world({ role: "operator" }), {}, rpcs),
    ),
    "validation",
    400,
  );
  await refused(
    bulk.POST.run(
      req("POST", { by: "view", action: "erase", view: { list: "ready" } }),
      ctxOf(world({ role: "operator" }), {}, rpcs),
    ),
    "validation",
    400,
  );
});

test("Check again goes through its door with the ids and says how many it took; bulk Keep names the search the pile is read in, and says what stopped it", async () => {
  const rpcs = doors({
    lead_bulk: (a) =>
      a.p_action === "keep"
        ? {
            done: 1,
            skipped: 0,
            op_id: null,
            version: 1,
            error: "month_leads_used",
            left: 0,
            sentence: "You have found this month's 500 leads.",
          }
        : { done: 2, op_id: OP, version: 1 },
  });
  const out = await checkAgain.POST.run(req("POST", { ids: [LEAD] }), ctxOf(world({ role: "owner" }), {}, rpcs));
  assert.deepEqual(
    rpcCalls("lead_check_again").map((a) => a.p_lead_ids),
    [[LEAD]],
  );
  assert.deepEqual([out.scheduled, out.skipped], [2, 1]);
  assert.match(out.toast, /^Checking 2 again\. Their answer lands here in a few minutes\. 1 was left as it is/);
  const kept = await bulk.POST.run(
    req("POST", { by: "ids", action: "keep", ids: [LEAD], search_id: SEARCH }),
    ctxOf(world({ role: "owner" }), {}, rpcs),
  );
  assert.deepEqual(
    rpcCalls("lead_bulk").map((a) => [a.p_action, a.p_ids, a.p_search_id]),
    [["keep", [LEAD], SEARCH]],
  );
  assert.deepEqual(
    [kept.done, kept.op_id, kept.toast],
    [1, null, "Kept 1. It counts as a lead this month. You have found this month's 500 leads."],
    "what was kept stays kept, and the month's sentence rides the toast",
  );
  await refused(
    checkAgain.POST.run(
      req("POST", { ids: [LEAD] }),
      ctxOf(world({ role: "owner" }), {}, doors({ lead_check_again: () => ({ scheduled: 0, skipped: 1 }) })),
    ),
    "conflict",
    409,
  );
  await refused(
    bulk.POST.run(
      req("POST", { by: "view", action: "keep", view: { list: "ready" } }),
      ctxOf(world({ role: "owner" }), {}, rpcs),
    ),
    "validation",
    400,
  );
});

test("the export is a POST, the owner's, on the ledger like contacts/export, and marks what it took; the file is the answer's, for the page to save", async () => {
  const tables = world({ role: "owner" });
  const rpcs = doors();
  const out = await exportRoute.POST.run(req("POST", { list: "ready" }), ctxOf(tables, {}, rpcs));
  assert.match(out.file, /^leads-Zilker-Strength-\d{8}\.csv$/);
  assert.equal(out.rows, 1);
  assert.equal(rpcCalls("lead_export_mark").length, 1);
  assert.deepEqual(rpcCalls("lead_export_mark")[0], { p_tenant_id: A, p_ids: [LEAD] });
  assert.deepEqual(
    tables.decisions.map((d) => [d.verb, d.subject_type, d.payload.what, d.payload.rows]),
    [["export", "workspace", "leads", 1]],
  );
  const csv = out.csv;
  assert.equal(
    csv.startsWith("﻿"),
    false,
    "no byte-order mark: the page that saves the file adds one (kit downloadCsv)",
  );
  assert.equal(
    csv.split("\r\n")[0],
    "Business,What they do,Street,City,State,ZIP,Phone,Email,Mailbox,Website,About,Facebook,LinkedIn,Google Maps,Rating,Reviews,Stage,Why,Search,Found,Phone checked,Campaign,Last contacted,Last outcome,Last note,Contact,Contact title,Company size,Claimed listing,Instagram,TikTok,Fit,Distance,Source,Exported",
  );
  assert.ok(csv.includes("Travis Heights Coaching Co."));
  assert.equal(
    /apify|compass|bounceverify|qualified/i.test(csv),
    false,
    "the file says what the owner would say, not what the database stores",
  );
});

test("GET leads pages by the key the database answered, with the list, the class and the sort in SQL", async () => {
  const rpcs = doors();
  await leads.GET.run(
    get(`${inA}&list=ready&class=review&sort=rating&dir=desc&after_key=4.8&after_id=${LEAD}`),
    ctxOf(world({ role: "viewer" }), {}, rpcs),
  );
  assert.deepEqual(rpcCalls("leads_page")[0], {
    p_tenant_id: A,
    p_search_id: null,
    p_class: "review",
    p_sort: "rating",
    p_after_key: "4.8",
    p_limit: 500,
    p_list: "ready",
    p_dir: "desc",
    p_after_id: LEAD,
  });
  assert.equal(rpcCalls("lead_list_counts").length, 0, "a later page does not re-count the rail");
  const first = await leads.GET.run(get(`${inA}&search=${SEARCH}&limit=1`), ctxOf(world({ role: "viewer" }), {}, rpcs));
  assert.deepEqual(rpcCalls("leads_page")[1].p_search_id, SEARCH);
  assert.deepEqual(first.counts, COUNTS, "the first page brings the rail's numbers with it");
  assert.deepEqual(first.next, { key: "0000123456", id: "m-1" }, "a full page hands back where the database got to");
  assert.equal(first.rows.length, 1);
});

test("GET leads reads the month only for a role that may find: an operator's or a viewer's first page is its rows, never a 500", async () => {
  // lead_month_used (00143) refuses anyone has_permission('find') refuses, as the database does: the owner and the
  // partner may. Seen in the real app (27 Sep 2026): a viewer's Leads said "Can't reach your workspace".
  const monthDoor = (role) => () => {
    if (!ROLE_PERMS[role].find)
      throw Object.assign(new Error("Only an owner can find businesses for you."), { code: "42501" });
    return { allowance: { used: 3, reserved: 0 }, budget: { used: 0, reserved: 0 } };
  };
  for (const role of ["owner", "partner", "operator", "viewer"]) {
    const rpcs = { ...doors(), lead_month_used: monthDoor(role) };
    const first = await leads.GET.run(get(inA), ctxOf(world({ role }), {}, rpcs));
    assert.equal(first.rows.length, 1, `${role}: the rows`);
    assert.deepEqual(first.counts, COUNTS, `${role}: the rail's numbers`);
    assert.equal("month" in first, ROLE_PERMS[role].find, `${role}: the month only for a role that may find`);
  }
});

test("a row says what was seen and what Claude read, and wears the name of the search that found it", async () => {
  const rpcs = doors();
  const out = await leads.GET.run(get(inA), ctxOf(world({ role: "viewer" }), {}, rpcs));
  const r = out.rows[0];
  assert.deepEqual(
    [r.id, r.search_name, r.postal_code, r.phone_agrees, r.website, r.member.class, r.member.fit],
    [LEAD, "Trainers", "78704", true, "travisheightscoaching.example", "qualified", "strong"],
  );
  assert.deepEqual(r.member.other_emails, [{ email: "careers@travisheightscoaching.example", why: "for job seekers" }]);
  assert.deepEqual(
    r.member.reasons,
    ["fit"],
    "the class rule's own reason tokens ride the row, for the Needs review queue (D3)",
  );
  assert.deepEqual(
    [r.neighborhood, r.lat, r.lng],
    [null, 30.24, -97.75],
    "D5: the neighbourhood and the coordinates ride the row",
  );
  const checks = Object.fromEntries(r.member.checks.map((c) => [c.key, [c.how, c.answer]]));
  assert.deepEqual(checks.on_maps, ["seen", "yes"]);
  assert.deepEqual(checks.mailbox, ["seen", "yes"]);
  assert.deepEqual(checks.phone_two_sources, ["seen", "yes"]);
  assert.deepEqual(checks.independent, ["read", "yes"], "the plan asked for it, so the judge's answer is quoted");
  assert.equal(checks.right_kind, undefined, "nobody asked, so nothing is claimed");
  assert.equal(r.member.checks.find((c) => c.key === "independent").reason, "one address, no brand in the name");
  const one = await leads.GET.run(
    get(inA),
    ctxOf(
      world({ role: "viewer" }),
      {},
      doors({ leads_page: () => [pageRow({ phone_sources: 1, email_state: "catch_all" })] }),
    ),
  );
  const seen = Object.fromEntries(one.rows[0].member.checks.map((c) => [c.key, c.answer]));
  assert.deepEqual(
    [seen.phone_two_sources, seen.mailbox],
    ["unknown", "unknown"],
    "one source and a catch-all server cannot tell, and say so",
  );
});
