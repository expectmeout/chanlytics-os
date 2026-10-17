export function callerSentence(g) {
  return `${g.gets.charAt(0).toUpperCase()}${g.gets.slice(1)}.`;
}
export const PHONE_LINE_OFF = {
  state: "line_off",
  tone: "warn",
  gets: "calls are picked up without your facts and are not recorded"
};
export const PAUSED_CALL = "calls are answered only to take a message";
export const WORKSPACE_ENDED_WORDS = `its receptionist stops replying to messages and ${PAUSED_CALL}, its plan is cancelled, and its public pages go offline`;
export const WORKSPACE_PAUSED = {
  state: "workspace_paused",
  tone: "danger",
  gets: `${PAUSED_CALL}, and new messages wait in the Inbox for you to answer`
};
export function lineOffGets(kind, noun) {
  return kind === "voice" ? PHONE_LINE_OFF : { state: "line_off", tone: "warn", gets: `${noun}s to it are neither answered nor recorded` };
}
