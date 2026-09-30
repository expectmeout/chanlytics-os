/**
 * Conversations' rules, said once and pure (moved from pages/conversations.jsx, decision 0015, step 3): which tab a row is
 * in, the glyph of each wire, and the two spellings of the address (`conversations/<tab>:<row>`). The page reads them, and
 * so do the frame's crumbs and Ask (which took `CV_ROUTE` and `CV_IN_CHANNEL` off the window: the app publishes those two
 * names from here). No React, so it stays light for whoever imports it.
 */

// Keyed on what the view model says (writtenChannelOf): "email", not "mail".
// The map carried "mail" while nothing ever sent it, so the day a real email
// conversation arrived it would have fallen through to the default glyph.
export const CV_ICON: Record<string, string> = {
  phone: "phone",
  sms: "chat",
  whatsapp: "chat",
  instagram: "instagram",
  email: "mail",
};

// ONE rule for "is this row in that tab", read by the filter AND the counts, so
// a tab can never show a number it does not then list. `chats` is the mockup's
// grouped tab; a real workspace gets one tab per wire (legacy-bridge
// surface-data.ts). "mail" is the seed's spelling of what the view model calls
// "email" — the filter carried only the seed's, so the Email tab was empty on
// the mockup and matched nothing at all on a real workspace.
const CV_TAB_KEYS: Record<string, string[]> = {
  chats: ["instagram", "sms", "whatsapp"],
  email: ["email", "mail"],
  mail: ["email", "mail"],
};

/** Whether a row is in a tab: `all` holds every row, a grouped tab its wires, any other tab its own wire. */
export const inChannel = (c: { channel: string }, id: string): boolean =>
  id === "all" || (CV_TAB_KEYS[id] || [id]).includes(c.channel);

// ONE rule for the word after "conversations/", which the shell asks: a tab either kind of workspace draws -- a wire a
// row can be on, in the view model's words (CV_ICON's keys; a real workspace draws one tab per wire, surface-data.ts
// conversationTabs), or one of the mockup's grouped tabs -- or a row's id, a conversation's or a call's (cv-) -- or
// both, `<tab>:<id>`: the tab in view and the row open on it, which is what the page writes as a row opens (cvAddress),
// so a refresh opens the same row on the same tab. Replaced on a desktop, where Back leaves the page; pushed on a
// phone, where the row is the screen and Back closes it to its list (ConversationsPage openRow).
// The shell knew only the mockup's three tabs, so on a real workspace WhatsApp and Email were read as the ids of
// conversations nobody could find: the list stayed on All, and the pane said the conversation wasn't shown. And the
// address held a tab OR a row, so the row a person had open was nobody's after a refresh.
const cvOwn = (map: Record<string, unknown>, key: string): boolean => Object.prototype.hasOwnProperty.call(map, key);
const cvIsTab = (word: string): boolean => word === "all" || cvOwn(CV_ICON, word) || cvOwn(CV_TAB_KEYS, word);

/** What the word after "conversations/" names: the tab in view and the row open on it. */
export const cvRoute = (word: string | null | undefined): { channel: string; id: string | null } => {
  if (!word || word === "all") return { channel: "all", id: null };
  const at = word.indexOf(":");
  if (at < 0) return cvIsTab(word) ? { channel: word, id: null } : { channel: "all", id: word };
  const tab = word.slice(0, at);
  const id = word.slice(at + 1) || null;
  return cvIsTab(tab) ? { channel: tab, id } : { channel: "all", id: word };
};

// The one spelling of the other direction: a tab alone, a row alone (on All), or a row on its tab.
export const cvAddress = (channel: string | null | undefined, id: string | null | undefined): string => {
  const tab = !channel || channel === "all" ? null : channel;
  if (!tab) return id ? `conversations/${id}` : "conversations";
  return id ? `conversations/${tab}:${id}` : `conversations/${tab}`;
};
