export const WHY_FROM_MAPS = "I found your business on Google Maps.";
const WHY_FROM_DIRECTORY = "I found your company in a business directory.";
export function whyFrom(source) {
  if (source === "maps" || source === "local_businesses") return WHY_FROM_MAPS;
  if (source === "people_at_companies") return WHY_FROM_DIRECTORY;
  return "I came across your business online.";
}
export const CAMPAIGN_EMAIL_TAG = "cl_campaign";
export function isCampaignEmail(request) {
  const r = request;
  const v = r?.headers?.["List-Unsubscribe"];
  if (typeof v === "string" && v.trim() !== "") return true;
  return Array.isArray(r?.tags) && r.tags.some((t) => !!t && typeof t === "object" && t.name === CAMPAIGN_EMAIL_TAG);
}
export const UNSUBSCRIBE_PAGE_HEADER = "x-unsubscribe-page";
function eitherPageWords(v) {
  const b = v.business?.trim() || null;
  const foot = `${b ?? "This business"} sends its email with Chanlytics.`;
  return v.kind === "ask_either" ? {
    title: "Unsubscribe",
    lead: "Stop these emails?",
    body: `Press the button and ${b ?? "this business"} won't send you emails like this one again. If you write to them, they can still answer you.`,
    button: "Unsubscribe",
    foot
  } : {
    title: "Unsubscribed",
    lead: "You're unsubscribed from these emails.",
    body: `${b ?? "This business"} won't send you emails like this one again.`,
    button: null,
    foot
  };
}
export function unsubscribePageWords(v) {
  switch (v.kind) {
    case "ask": {
      const b = v.business?.trim() || null;
      const like = v.sender?.trim() ? `the one from ${v.sender.trim()}` : "that one";
      return {
        title: "Unsubscribe",
        lead: b ? `Stop emails from ${b}?` : "Stop these emails?",
        body: `Press the button and ${b ?? "this business"} won't send you emails like ${like} again. If you write to them, they can still answer you.`,
        button: "Unsubscribe",
        foot: `${b ?? "This business"} sends its email with Chanlytics.`
      };
    }
    case "done": {
      const b = v.business?.trim() || null;
      const sender = v.sender?.trim() || null;
      return {
        title: "Unsubscribed",
        lead: sender ? `You're unsubscribed from emails from ${sender}.` : "You're unsubscribed.",
        body: `${b ?? "This business"} won't send you emails like ${sender ? `the one from ${sender}` : "that one"} again.`,
        button: null,
        foot: `${b ?? "This business"} sends its email with Chanlytics.`
      };
    }
    case "ask_either":
    case "done_either":
      return eitherPageWords(v);
    case "bad_link":
      return {
        title: "Unsubscribe",
        lead: "This link doesn't work.",
        body: "It may have been cut short when it was copied. Open the Unsubscribe link in the email itself, or reply to the email and ask them to stop.",
        button: null,
        foot: null
      };
    case "unavailable":
      return {
        title: "Unsubscribe",
        lead: "That didn't go through.",
        body: v.retry ? "We couldn't record it just now. Press Try again. Or reply to the email and ask them to stop." : "We couldn't record it just now. Try the link again in a minute. Or reply to the email and ask them to stop.",
        button: v.retry ? "Try again" : null,
        foot: null
      };
  }
}
