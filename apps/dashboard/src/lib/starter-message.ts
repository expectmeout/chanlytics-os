/**
 * A ready-made starter as a step's message (the clean list, 14 Nov 2026; the review of 15 Nov 2026): the language it goes
 * in for a business (starterLanguageOf), and the one making of it in that language (starterMessageOf), which New's message
 * sheet draws and picks, the step editor offers, and the AI's drafter is offered by key (server drafts/known-starters.ts),
 * so the starter a draft names is the one New shows, in the words Keep, Start and Save file (server
 * campaigns/starter-templates.ts). Pure, and safe in the browser.
 */
import {
  defaultParamSpecs,
  messageLanguageCode,
  messageLanguagesOf,
  slotLabels,
  starterText,
  type NewMessage,
  type StarterTemplate,
} from "@chanlytics/contracts";

/** What a business's profile says of the languages it answers customers in, as Settings' read and the server hold it. */
interface ProfileRead {
  brain?: { profile?: { languages?: readonly string[] | undefined } | undefined } | undefined;
}

/** The languages the profile names, in its order; none where the profile is not read. */
export const profileLanguagesOf = (config: ProfileRead | null | undefined): readonly string[] =>
  config?.brain?.profile?.languages ?? [];

/**
 * The language a ready-made starter goes in for a business, the code it is filed under: the first of `languages` (what
 * its profile says it answers customers in, profileLanguagesOf) that Chanlytics writes (contracts messageLanguagesOf),
 * where the set writes the starter in it; else English (the review of 15 Nov 2026: a starter was filed in English for a
 * Spanish-speaking business too).
 */
export function starterLanguageOf(starter: Pick<StarterTemplate, "texts">, languages: readonly string[]): string {
  const wanted = messageLanguageCode(messageLanguagesOf(languages)[0] ?? "en");
  return starter.texts[wanted] ? wanted : "en_US";
}

/**
 * The starter as a step's message, in `language` (starterLanguageOf): its words and values as the set writes them there,
 * the channels the set writes it for in that language exactly (as its filing writes them: no English stand-in), and its
 * key, by which Keep or Start files it (drafts/sequence-new.ts templateOf). Nothing of it is filed yet.
 */
export function starterMessageOf(starter: StarterTemplate, language: string): NewMessage {
  const named = { name: starter.name, language, variables: [] };
  const writes = { whatsapp: true, email: !!starter.email?.[language], sms: !!starter.sms?.[language] };
  return {
    template_id: null,
    starter: starter.key,
    title: starter.title,
    body: starterText(starter, language).body,
    channels: (["whatsapp", "email", "sms"] as const).filter((channel) => writes[channel]),
    params: defaultParamSpecs(named),
    offer: starter.category === "marketing",
    written: null,
    labels: slotLabels(named),
  };
}
