import { ROLE_PERMS, ROLES } from "../config/workspace-config/role-perms.js";
export const NEEDS_TITLE = {
  owner: "Owner only",
  operator: "Not for viewers"
};
const TITLES = /* @__PURE__ */ new Map([
  ["unauthorized", "Signed out"],
  ["forbidden", "Not allowed"],
  ["not_found", "Not found"],
  ["validation", "Check the details"],
  ["choose_workspace", "Choose a workspace"],
  ["mfa_required", "Two-step sign-in"],
  ["conflict", "Not possible right now"],
  ["rate_limited", "Too many at once"],
  ["payment_required", "Needs a subscription"],
  ["window_closed", "WhatsApp's 24 hours have passed"],
  ["upstream_meta", "WhatsApp didn't accept it"],
  ["upstream_retell", "The phone line didn't answer"],
  ["upstream_anthropic", "The assistant didn't answer"],
  ["upstream_email", "The email didn't go"],
  ["upstream_auth", "Couldn't check your sign-in"],
  ["internal", "Something went wrong"],
  ["network", "No connection"],
  ["timeout", "No answer in time"],
  ["client", "Not sent"]
]);
const SAID = /* @__PURE__ */ new Map([
  ["forbidden", "Your role can't do this."],
  ["not_found", "That isn't here any more."],
  ["validation", "Something in this form wasn't accepted."],
  ["choose_workspace", "Choose which workspace first."],
  ["mfa_required", "Enter the code from your authenticator app first."],
  ["conflict", "That isn't possible right now."],
  ["payment_required", "This needs a subscription \u2014 see Billing."],
  ["window_closed", "WhatsApp's 24 hours have passed \u2014 send an approved message instead."],
  ["upstream_meta", "WhatsApp didn't accept it \u2014 try again in a moment."],
  ["upstream_retell", "The phone line didn't answer \u2014 try again in a moment."],
  ["upstream_anthropic", "The assistant didn't answer \u2014 try again in a moment."],
  ["upstream_email", "The email didn't go \u2014 try again in a moment."],
  ["upstream_auth", "Couldn't check your sign-in just now \u2014 try again."],
  ["client", "Not sent."]
]);
const SERVER_CATCH_ALL = "Something went wrong.";
const NETWORK_WRITE = "Network error \u2014 nothing was changed.";
const NETWORK_READ = "Chanlytics could not be reached.";
const TIMEOUT_WRITE = "Chanlytics took too long to answer \u2014 this may still go through, so check before trying again.";
const TIMEOUT_READ = "Chanlytics took too long to answer \u2014 try again in a moment.";
const NO_ANSWER_WRITE = "Chanlytics didn't answer properly, so this may or may not have gone through \u2014 check before trying again.";
const UNCONFIRMED_WRITE = "Chanlytics hit a problem and couldn't confirm this \u2014 check whether it went through before trying again.";
const READ_AGAIN = "Chanlytics couldn't read this just now \u2014 try again in a moment.";
const OUT_OF_DATE = "This page is out of date \u2014 reload it and try again.";
export function waitWords(seconds) {
  if (seconds < 60) return `${seconds} second${seconds === 1 ? "" : "s"}`;
  const m = Math.ceil(seconds / 60);
  return `${m} minute${m === 1 ? "" : "s"}`;
}
function retryAfterOf(details, header, nowMs) {
  const counted = details && typeof details === "object" ? details.retry_after_s : void 0;
  if (typeof counted === "number" && Number.isFinite(counted) && counted >= 0) return Math.max(1, Math.ceil(counted));
  const h = typeof header === "string" ? header.trim() : "";
  if (!h) return null;
  if (/^[0-9]+$/.test(h)) return Math.max(1, Number(h));
  const at = Date.parse(h);
  if (!Number.isFinite(at)) return null;
  const s = Math.ceil((at - nowMs) / 1e3);
  return s > 0 ? s : null;
}
function fieldsOf(details) {
  const f = details && typeof details === "object" ? details.fields : void 0;
  if (!f || typeof f !== "object" || Array.isArray(f)) return null;
  const out = {};
  for (const [name, said] of Object.entries(f)) {
    if (name && typeof said === "string" && said.trim()) out[name] = said;
  }
  return Object.keys(out).length ? out : null;
}
function confirmEmailToOf(details) {
  const to = details && typeof details === "object" ? details.confirm_email_to : void 0;
  return typeof to === "string" && to.trim() ? to.trim() : null;
}
export const SESSION_ENDED = { session_ended: true };
export function combinedInto(keptId) {
  return { moved_to: keptId };
}
function movedToOf(details) {
  const to = details && typeof details === "object" ? details.moved_to : void 0;
  return typeof to === "string" && /^[0-9a-f-]{36}$/i.test(to) ? to : null;
}
function asideOf(details, status) {
  const confirmEmailTo = confirmEmailToOf(details);
  const movedTo = status === 404 ? movedToOf(details) : null;
  return { ...confirmEmailTo ? { confirmEmailTo } : {}, ...movedTo ? { movedTo } : {} };
}
export function sessionEnded(details) {
  return !!details && typeof details === "object" && details.session_ended === true;
}
export function refusalOf(input) {
  const status = Number.isFinite(input.status) ? input.status : 0;
  const said = typeof input.message === "string" ? input.message.trim() : "";
  const retryAfterS = retryAfterOf(input.details, input.retryAfter, input.nowMs ?? Date.now());
  const fields = fieldsOf(input.details);
  const code = typeof input.code === "string" && input.code ? input.code : null;
  const aside = asideOf(input.details, status);
  const refusal = (c, title, message) => ({
    code: c,
    status,
    title,
    message,
    retryAfterS,
    fields,
    ...aside
  });
  if (!code) {
    if (status === 0) return refusal("network", "No connection", input.write ? NETWORK_WRITE : NETWORK_READ);
    if (status >= 500) return refusal("internal", "No answer", input.write ? NO_ANSWER_WRITE : READ_AGAIN);
    if (status === 413) return refusal("internal", "Too large", "That was too large to send.");
    return refusal("internal", "Out of date", OUT_OF_DATE);
  }
  switch (code) {
    case "unauthorized":
      return refusal(code, "Signed out", "Signed out.");
    case "network":
      return refusal(code, "No connection", input.write ? NETWORK_WRITE : NETWORK_READ);
    case "timeout":
      return refusal(code, "No answer in time", input.write ? TIMEOUT_WRITE : TIMEOUT_READ);
    case "internal":
      return refusal(
        code,
        "Something went wrong",
        said && said !== SERVER_CATCH_ALL ? said : input.write ? UNCONFIRMED_WRITE : READ_AGAIN
      );
    case "rate_limited":
      return refusal(
        code,
        "Too many at once",
        said || `Too many at once \u2014 try again in ${retryAfterS ? waitWords(retryAfterS) : "a moment"}.`
      );
    case "forbidden": {
      const needs = input.details && typeof input.details === "object" ? input.details.needs : void 0;
      return refusal(
        code,
        needs === "owner" || needs === "operator" ? NEEDS_TITLE[needs] : "Not allowed",
        said || SAID.get(code)
      );
    }
    default:
      return refusal(code, TITLES.get(code) ?? "Not done", said || SAID.get(code) || "That didn't go through.");
  }
}
export const PERM_DOING = {
  approve: "approve or send",
  autonomy: "change what the receptionist may do on its own",
  disconnect: "disconnect a channel",
  billing: "change billing",
  team: "manage the team",
  settings: "change the business details",
  export: "export the customer list",
  find: "find businesses for you"
};
export function roleGate(role, perm, doing) {
  const who = ROLES.includes(role ?? "") ? role : "viewer";
  if (ROLE_PERMS[who]?.[perm]) return null;
  const needs = ROLE_PERMS.operator?.[perm] ? "operator" : "owner";
  const what = doing?.trim() || PERM_DOING[perm] || "do this";
  return {
    needs,
    title: NEEDS_TITLE[needs],
    reason: needs === "owner" ? `Only an owner can ${what}.` : `Only an owner or operator can ${what}.`
  };
}
