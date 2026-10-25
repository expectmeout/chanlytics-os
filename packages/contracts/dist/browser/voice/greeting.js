export function greetingFor(name, assistant = null) {
  return `${opening(name)} ${iAm(assistant)}, and calls are recorded. How can I help?`;
}
function iAm(assistant) {
  const n = (assistant ?? "").replace(/\s+/g, " ").trim();
  return n ? `I'm ${n}, the automated assistant` : "I'm the automated assistant";
}
function opening(name) {
  return name ? `Hi, ${name}.` : "Hi, thanks for calling.";
}
export function pausedGreetingFor(name, assistant = null) {
  return `${opening(name)} ${iAm(assistant)}, and calls are recorded. Today I can only take a message for the team.`;
}
export const GREETING_DEFAULT = /* @__PURE__ */ greetingFor(null);
