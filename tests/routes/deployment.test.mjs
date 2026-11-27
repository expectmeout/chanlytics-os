/**
 * One deployment configuration says what this deployment may do. Production
 * reaches the real providers; a preview or a laptop only when it says so
 * with EDGE_PROVIDERS=live; an unset VERCEL_ENV is a laptop, never
 * production. EDGE_PROVIDERS=model opens the model alone (Ask's turns, its
 * warm, the drafts), so a change to Ask can be measured on a laptop before it
 * lands with every provider door still shut
 * (tests/ask/gateway/a-laptop-reaches-the-model-alone.test.mjs runs it).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const { deploymentFrom } = await import(pathToFileURL(path.join(ROOT, "apps/dashboard/src/server/shared/env.ts")).href);

test("production is live; a preview or a laptop is not, unless it says so", () => {
  assert.deepEqual(deploymentFrom({ VERCEL_ENV: "production" }), {
    env: "production",
    providersLive: true,
    modelLive: true,
  });
  assert.deepEqual(deploymentFrom({ VERCEL_ENV: "preview" }), {
    env: "preview",
    providersLive: false,
    modelLive: false,
  });
  assert.deepEqual(deploymentFrom({ VERCEL_ENV: "development" }), {
    env: "development",
    providersLive: false,
    modelLive: false,
  });
  assert.deepEqual(deploymentFrom({ VERCEL_ENV: "preview", EDGE_PROVIDERS: "live" }), {
    env: "preview",
    providersLive: true,
    modelLive: true,
  });
  assert.deepEqual(deploymentFrom({ EDGE_PROVIDERS: "live" }), {
    env: "development",
    providersLive: true,
    modelLive: true,
  });
});

test("EDGE_PROVIDERS=model opens the model and no provider, on a laptop or a preview", () => {
  assert.deepEqual(deploymentFrom({ EDGE_PROVIDERS: "model" }), {
    env: "development",
    providersLive: false,
    modelLive: true,
  });
  assert.deepEqual(deploymentFrom({ VERCEL_ENV: "preview", EDGE_PROVIDERS: "model" }), {
    env: "preview",
    providersLive: false,
    modelLive: true,
  });
  assert.deepEqual(
    deploymentFrom({ VERCEL_ENV: "production", EDGE_PROVIDERS: "model" }),
    { env: "production", providersLive: true, modelLive: true },
    "production reaches everything whatever the word",
  );
});

test("an unset or unknown VERCEL_ENV is a laptop, never production", () => {
  assert.deepEqual(deploymentFrom({}), { env: "development", providersLive: false, modelLive: false });
  assert.deepEqual(deploymentFrom({ VERCEL_ENV: "" }), { env: "development", providersLive: false, modelLive: false });
  assert.deepEqual(deploymentFrom({ VERCEL_ENV: "Production" }), {
    env: "development",
    providersLive: false,
    modelLive: false,
  });
  assert.equal(
    deploymentFrom({ EDGE_PROVIDERS: "yes" }).providersLive,
    false,
    "only the word live opens the providers",
  );
  for (const word of ["yes", "Model", "models", "ask", "on"])
    assert.deepEqual(
      deploymentFrom({ EDGE_PROVIDERS: word }),
      { env: "development", providersLive: false, modelLive: false },
      `${word}: only the words live and model open anything`,
    );
});

test("F42: on a laptop every door to a live provider answers 'not here' and asks nothing of the edge", async () => {
  // The fifteen doors that were service.ts, now by domain, run as a laptop runs them: an unset VERCEL_ENV and no
  // EDGE_PROVIDERS, an edge that would answer if it were asked. Each says "preview" and nothing leaves; the pause mirror
  // was a sixteenth, gone with the store it mirrored into.
  const kept = Object.fromEntries(["EDGE_URL", "EDGE_CALL_SECRET"].map((k) => [k, process.env[k]]));
  const realFetch = globalThis.fetch;
  const asked = [];
  Object.assign(process.env, { EDGE_URL: "https://edge.example.com", EDGE_CALL_SECRET: "edge-secret" });
  globalThis.fetch = async (input) => {
    asked.push(String(input instanceof Request ? input.url : input));
    return Response.json({ ok: true });
  };
  try {
    const at = (p) => import(pathToFileURL(path.join(ROOT, `apps/dashboard/src/server/${p}`)).href);
    const { deployment } = await at("shared/env.ts");
    assert.equal(deployment.providersLive, false, "this process is a laptop: no VERCEL_ENV, no EDGE_PROVIDERS");
    const live = await at("conversations/live-call.ts");
    const control = await at("conversations/thread-control.ts");
    const whatsapp = await at("connections/whatsapp.ts");
    const templates = await at("campaigns/meta-templates.ts");
    const playbooks = await at("campaigns/playbook-run.ts");
    const reachOuts = await at("campaigns/reach-outs/reach-outs.ts");
    const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const asker = { workspace: T, user: "u1" };
    const words = { name: "hello", language: "en_US", components: [], body: "Hi", examples: [], labels: [] };
    const doors = {
      whisper: () => live.whisperLiveCall("call_1", { text: "Ask about Friday", trigger: false }, asker),
      "the end of a call": () => live.stopLiveCall("call_1", asker),
      "the hand-over of a call": () => live.handOverLiveCall("call_1", "+13055550142", asker),
      "a thread's draft": () =>
        control.draftAtTheEdge({ conversationId: "c1", kind: "reply", instruction: null }, asker),
      steer: () => control.steerDraft("m1", "Shorter, please", asker),
      "the sign-up config": () => whatsapp.getWhatsappSignupConfig(asker),
      "the number connection": () => whatsapp.connectWhatsApp(T, "u1", { code: "code-1" }),
      "what Meta holds about the number": () => whatsapp.checkWhatsAppStanding(T, "u1"),
      "the template sync": () => templates.syncTemplates(T, "u1"),
      "a template's create": () => templates.createTemplate(T, "u1", { ...words, category: "UTILITY" }),
      "its edit": () => templates.editTemplateWords(T, "u1", { ...words, id: "tpl1", before: null }),
      "its delete": () => templates.deleteTemplate(T, "tpl1", "u1"),
      "the playbook run": () => playbooks.runPlaybookNow(T, "pb1", "u1"),
      "the offer of a freed hour": () => playbooks.offerFreedNow(T, "u1", "ap1"),
      "a reach-out's preview": () => reachOuts.previewReachOut(T, "u1", {}),
    };
    for (const [door, run] of Object.entries(doors)) {
      const out = await run();
      assert.equal(out.reason, "preview", `${door}: not here`);
      assert.notEqual(out.ok, true, door);
    }
    assert.deepEqual(asked, [], "and nothing reached the edge");
  } finally {
    globalThis.fetch = realFetch;
    for (const [k, v] of Object.entries(kept))
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
  }
});
