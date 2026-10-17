export function greetingFor(name) {
  return `${opening(name)} I'm the automated assistant, and calls are recorded. How can I help?`;
}
function opening(name) {
  return name ? `Hi, ${name}.` : "Hi, thanks for calling.";
}
export function pausedGreetingFor(name) {
  return `${opening(name)} I'm the automated assistant, and calls are recorded. Today I can only take a message for the team.`;
}
export const GREETING_DEFAULT = /* @__PURE__ */ greetingFor(null);
