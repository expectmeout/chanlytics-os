import type { NewDraftDto } from "../../packages/contracts/src/index";

/**
 * New's one-off as Ask would answer it, for a spec on a real workspace (decision 0065): POST sequences/draft is answered
 * with it (new-draft.ts, beside this), so a nightly asks no model, and everything else New draws is the workspace's own (its
 * lists, its counts, its channels). This one reaches nobody: a once to everyone, now, by WhatsApp, of a message Ask wrote,
 * which a yes to offers hears -- the nightly's workspace has nobody with that yes (tooling/scripts/ops/e2e-workspace.mjs).
 *
 * A module of its own, with no Playwright in it, so the harness's node test draws New over the very draft the spec gives
 * (tooling/scripts/tests/e2e/e2e-harness-campaigns.test.mjs).
 */
export const NOBODY_ONCE: NewDraftDto = {
  said: "Tell everyone we're closed on Thursday",
  business: "",
  kind: "once",
  audience: "people",
  name: "Closed on Thursday",
  who: { kind: "everyone", label: "everyone who said yes to offers" },
  run_hour: 10,
  at: null,
  channels: ["whatsapp"],
  mailbox: null,
  adds_new: false,
  steps: [
    {
      name: "Closed on Thursday",
      after_days: null,
      only_if: [],
      does: "message",
      message: {
        template_id: null,
        title: "Closed on Thursday",
        body: "Hi {{1}}, we're closed this Thursday.",
        channels: ["whatsapp"],
        params: [{ kind: "first_name" }],
        offer: true,
        written: {
          name: "closed_on_thursday",
          category: "marketing",
          versions: { whatsapp: { body: "Hi {{1}}, we're closed this Thursday." } },
          slots: [{ position: 1, label: "First name", example: "Dani", kind: "first_name" }],
        },
      },
      email: null,
      hand: "",
    },
  ],
  policy_class: "campaign",
  mode: null,
  reach: { can: 0, of: 3, left: "3 never said yes" },
  checks: [],
  twin: null,
  cannot: null,
};
