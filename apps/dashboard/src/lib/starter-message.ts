/**
 * A ready-made starter as a step's message (the clean list, 14 Nov 2026; the review of 15 Nov 2026): the one making of
 * it, which New's message sheet draws and picks, and the AI's drafter is offered by key (server drafts/known-starters.ts),
 * so the starter a draft names is the one New shows. Its words and values in the language it goes in here (contracts
 * starterLanguageOf), the channels the set writes it for in that language exactly (as its filing writes them: no English
 * stand-in), and its key, by which Keep or Start files it (drafts/sequence-new.ts templateOf). Pure, and safe in the
 * browser.
 */
import {
  defaultParamSpecs,
  slotLabels,
  starterText,
  type NewMessage,
  type StarterTemplate,
} from "@chanlytics/contracts";

/** The starter as a step's message, in `language` (contracts starterLanguageOf). Nothing of it is filed yet. */
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
