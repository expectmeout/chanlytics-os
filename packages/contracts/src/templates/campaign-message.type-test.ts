/**
 * What a campaign message is keyed by, proved where the compiler reads it (campaign-message.ts): its versions are the
 * three channels a message is written on and the three a yes covers, which are one set; WhatsApp's carries Meta's
 * status from the closed set and an email's or a text's carries an id and nothing more; and what it holds is a yes or a no
 * for every channel a campaign ticks. A channel added to either set without the other, or a status the set does not
 * know, fails here.
 *
 * A type test, as identity.type-test.ts is: the positives are `Holds<Exactly<…>>`, and each line under `@ts-expect-error`
 * must not compile. Nothing imports this file, so no build reaches it.
 */
import type { AskedPurpose } from "../consent/consent";
import type { ConsentChannel } from "../consent/consent-channels";
import type { TemplateStatus } from "../shared/enums";
import type { Exactly, Holds } from "../shared/schema-sets";
import type { CampaignMessage, campaignMessageOf, campaignMessagesOf, messageHolds } from "./campaign-message";
import type { VersionChannel } from "./message-versions";

type Versions = CampaignMessage["versions"];

type _CampaignMessage = [
  // The channels a message is written on are the channels a yes covers: one is read through the other.
  Holds<Exactly<VersionChannel, ConsentChannel>>,
  Holds<Exactly<keyof Versions, VersionChannel>>,
  Holds<Exactly<CampaignMessage["anchor"]["channel"], VersionChannel>>,
  // What a message holds is an answer for every channel a campaign ticks, and no other.
  Holds<Exactly<ReturnType<typeof messageHolds>, Record<ConsentChannel, boolean>>>,
  // WhatsApp's version says Meta's status; an own version says its id, since it is approved the moment it is saved.
  Holds<Exactly<NonNullable<Versions["whatsapp"]>["status"], TemplateStatus>>,
  Holds<Exactly<NonNullable<Versions["email"]>, { id: string }>>,
  Holds<Exactly<NonNullable<Versions["sms"]>, { id: string }>>,
  // What the message is for is what a send judges a yes by.
  Holds<Exactly<CampaignMessage["purpose"], AskedPurpose>>,
  // The readers answer a message or none, and a list of them.
  Holds<Exactly<ReturnType<typeof campaignMessageOf>, CampaignMessage | null>>,
  Holds<Exactly<ReturnType<typeof campaignMessagesOf>, CampaignMessage[]>>,
  // @ts-expect-error a call or a picture is no channel a message has a version on: the set is WhatsApp, email and text
  Holds<Exactly<keyof Versions, VersionChannel | "voice">>,
  // @ts-expect-error a status the closed set does not hold is not a WhatsApp version's
  Holds<Exactly<NonNullable<Versions["whatsapp"]>["status"], TemplateStatus | "draft">>,
  // @ts-expect-error an email version has no status of Meta's: it exists or it does not
  Holds<Exactly<NonNullable<Versions["email"]>, { id: string; status: TemplateStatus }>>,
];
