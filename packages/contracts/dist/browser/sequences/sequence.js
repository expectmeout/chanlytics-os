import { PLAYBOOK_VETO_DELAY_WORDS } from "../playbooks/playbook-triggers.js";
export const SEQUENCE_STARTS = ["moment", "list", "leads", "date"];
export const SEQUENCE_STATES = ["draft", "on", "paused", "ended"];
export const SEQUENCE_MODES = ["auto", "veto", "ask"];
export const isSequenceMode = (m) => typeof m === "string" && SEQUENCE_MODES.includes(m);
export const SEQUENCE_MODE_WORDS = {
  auto: { line: "sends on its own", choice: "Send it", does: "each batch goes on its own" },
  veto: {
    line: "holds each batch for you to stop",
    choice: `Hold it ${PLAYBOOK_VETO_DELAY_WORDS} so I can stop it`,
    does: `each batch waits ${PLAYBOOK_VETO_DELAY_WORDS} for you to stop it, then goes`
  },
  ask: { line: "asks you before each batch", choice: "Ask me", does: "each batch waits for your OK" }
};
export const SEQUENCE_MODE_LABEL = "Before each batch";
export const SEQUENCE_NEW_WORDS_ASK = "A batch of new words waits for your OK first, whatever this says.";
export function sequenceModesFor(starts) {
  return starts === "leads" ? ["veto", "ask"] : SEQUENCE_MODES;
}
export function newSequenceMode(classMode, starts) {
  return isSequenceMode(classMode) && sequenceModesFor(starts).includes(classMode) ? classMode : "ask";
}
export function batchModeOf(s) {
  if (!s.words_ok_at) return "ask";
  return isSequenceMode(s.mode) ? s.mode : "ask";
}
