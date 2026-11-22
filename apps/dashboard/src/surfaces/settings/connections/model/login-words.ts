/**
 * What the Instagram row says for what a sign-in came back with, through Instagram's own sign-in or Meta's (the Meta
 * link): one sentence for each reason either way back can carry, in an owner's words, and a plain one for a reason nobody
 * named. Never the reason's own word: that is the log's (the callbacks log it), and an owner can do nothing with it.
 */
import type { CameBack } from "./came-back";

/** The sign-in a return came from, by the name its row says. */
type SignIn = "Instagram" | "Meta";

/** What a sentence may name: a workspace of this person's by its address's word, and the account connected here. */
export interface SignInNames {
  /** The name of one of this person's own workspaces, by its slug; null for one they are not in, or not read yet. */
  workspace: (slug: string) => string | null;
  /** The handle of the account this workspace has connected, if it has one. */
  handle: string | null;
}

/** Ours did not answer: nothing was written, and trying again is the whole of what to do. */
const NOT_ANSWERING_WORDS =
  "Chanlytics couldn't finish connecting just now, so nothing was changed. Try again in a minute.";

/** The reasons that are our own records or servers not answering, beside every `edge_<status>` the callback makes. */
const NOT_ANSWERING: ReadonlySet<string> = new Set(["channel_read_failed", "no_database"]);

/** What both logins say alike, by the reason. */
const SAID_ALIKE: Readonly<Record<string, string>> = {
  someone_else: "That connection was started by a different account. Start it again from here.",
  no_workspace: "The workspace the connection was started for is not one of yours.",
  credentials_failed: "The connection couldn't be saved safely, so it was not kept. Try again.",
  channel_write_failed: "The connection couldn't be saved. Try again.",
  preview: "Connecting only works on the production dashboard.",
};

/** What each sign-in says in its own name, by the outcome or its reason: `{name}` is Instagram or Meta. */
const SAID_BY_NAME: Readonly<Record<string, string>> = {
  declined: "{name} did not connect: the sign-in was declined.",
  state_expired: "The way back from {name} took too long. Start the connection again.",
  state_signature: "The way back from {name} couldn't be verified. Start the connection again.",
  state_missing: "The way back from {name} was incomplete. Start the connection again.",
  state_malformed: "The way back from {name} was incomplete. Start the connection again.",
  not_owner: "Only an owner or a manager can connect {name}.",
  no_code: "{name} sent nothing back. Start the connection again.",
  exchange_failed: "{name} did not accept the sign-in. Start the connection again.",
  not_available: "Connecting {name} is not available here yet.",
  no_edge_credential: "Connecting {name} is not available here yet.",
  no_app_credentials: "Connecting {name} is not available here yet.",
};

/** What only one sign-in says, or says in words of its own. */
const SAID_BY_SIGN_IN: Readonly<Record<SignIn, Readonly<Record<string, string>>>> = {
  Instagram: {
    connected: "Instagram is connected · AI answers its DMs now.",
    instagram_messages_not_granted:
      "Instagram connected without its messages. Start again and allow Chanlytics to manage them.",
    instagram_account_unreadable:
      "Instagram did not say which account signed in. Use your professional (business or creator) account and try again.",
    instagram_accounts_several:
      "That sign-in shared several Instagram accounts. Start again and choose only this workspace's account.",
    subscribe_failed: "Chanlytics couldn't subscribe to the account's DMs. Try again in a moment.",
    meta_off: "Connecting Meta is not offered in this workspace yet.",
  },
  Meta: {
    connected: "Meta is connected · AI answers the account's DMs through it now.",
    instagram_messages_not_granted:
      "Meta connected without the account's messages. Start again and allow Chanlytics to manage them.",
    instagram_account_unreadable:
      "Meta did not say which Instagram account was shared. Start again and choose your professional account.",
    instagram_accounts_several:
      "That sign-in shared several Instagram accounts. Start again and choose only this workspace's account.",
    subscribe_failed: "Chanlytics couldn't subscribe to the account's messages. Try again in a moment.",
    meta_off: "Connecting Meta is not offered in this workspace yet.",
  },
};

const THEN_HERE = "Disconnect it there first, then connect it here.";

/** An account another workspace has connected: that workspace named only where the address says it is this person's. */
function takenSentence(at: string | null, names: SignInNames): string {
  if (!at) return `That Instagram account is connected to another Chanlytics workspace. ${THEN_HERE}`;
  const name = names.workspace(at);
  return name
    ? `That Instagram account is connected to your workspace ${name}. ${THEN_HERE}`
    : `That Instagram account is connected to another workspace of yours. ${THEN_HERE}`;
}

/** A workspace that has an account connected, asked to connect a second one. */
function anotherSentence(handle: string | null): string {
  const has = handle ? `@${handle}` : "an Instagram account";
  return `This workspace already has ${has} connected. Disconnect it first, then connect the other account.`;
}

/** The sentence a table holds for a reason, or undefined: never a word inherited from the table's own shape. */
const sentenceIn = (table: Readonly<Record<string, string>>, reason: string): string | undefined =>
  Object.hasOwn(table, reason) ? table[reason] : undefined;

/**
 * The row's sentence for what a sign-in came back with: the outcome's, or its reason's. Every reason is said in words,
 * and one nobody named is said plainly, with what was changed (nothing) and what to do.
 */
export function loginSentence(signIn: SignIn, returned: CameBack, names: SignInNames): string {
  const own = SAID_BY_SIGN_IN[signIn];
  if (returned.outcome === "connected") return own.connected ?? `${signIn} is connected.`;
  const reason = returned.why ?? "";
  if (reason === "instagram_account_taken") return takenSentence(returned.at, names);
  if (reason === "instagram_another_connected") return anotherSentence(names.handle);
  if (NOT_ANSWERING.has(reason) || reason.startsWith("edge_")) return NOT_ANSWERING_WORDS;
  const sentence = sentenceIn(own, reason) ?? sentenceIn(SAID_ALIKE, reason);
  if (sentence) return sentence;
  const byName = sentenceIn(SAID_BY_NAME, reason);
  if (byName) return byName.replace("{name}", signIn);
  return `${signIn} didn't connect, and nothing was changed. Try again, or report a problem if it keeps happening.`;
}
