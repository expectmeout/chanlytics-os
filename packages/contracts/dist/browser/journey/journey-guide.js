import { triggerOf, triggerWords } from "../playbooks/playbook-triggers.js";
import { journeyOf } from "./journey.js";
const STAGE_SENDS = {
  first_contact: "your receptionist's answers, which ask once on WhatsApp for the yes to offers, the yes an offer on WhatsApp needs",
  before: "a reminder",
  after: "a thank-you and how it went, with a review ask where your Google listing keeps a review link",
  proposal: "one follow-up with its link",
  quiet: "a win-back"
};
const MONTHS_OFFER = {
  stage: null,
  moment: "everyone_monthly",
  sends: "every month, one offer on the channels it goes by: on WhatsApp to those who said yes to offers, and by email to those who said yes by email or have dealt with you, unless they said no"
};
export function journeyGuide(input) {
  const stages = journeyOf({ ...input, held: /* @__PURE__ */ new Set() }).filter((s) => s.unmet === null);
  return [
    ...stages.map((s) => {
      const t = s.trigger === null ? void 0 : triggerOf(s.trigger);
      return {
        stage: s.id,
        moment: t?.id ?? null,
        sends: t ? `${triggerWords(t, input.word).hint.toLowerCase()}: ${STAGE_SENDS[s.id]}` : STAGE_SENDS[s.id]
      };
    }),
    { ...MONTHS_OFFER }
  ];
}
