/**
 * The words an example's ad opens with (page-only, the sample's): its headline, text, chat, reply and thank-you,
 * drafted from one Service and the business, in no one trade's words. The example's ads and the drawer's Edit read
 * it; a real ad's words are the ad writer's (the server's ask/skills/ad).
 */
import { appointmentWords } from "@chanlytics/contracts";
import type { AdCopy, AdDoor, AdsRead, AppointmentWord } from "@chanlytics/contracts";
import { PREVIEW } from "./drawer/words";

/**
 * Every word an ad says of itself: its headline, text, chat, reply and thank-you, drafted from one Service and the
 * business.
 * screen-word: an ad's own words are the business's, which says "us" and "we"; the app's voice never does.
 */
export function starterCopy(options: {
  service: string;
  price: string;
  business: Pick<AdsRead["business"], "name" | "address" | "site" | "hours">;
  door: AdDoor;
  word: AppointmentWord;
}): AdCopy {
  const { service, price, business, door } = options;
  const words = appointmentWords(options.word);
  // A Service with no price note says its name alone.
  const priced = price ? `${service}, ${price}` : service;
  const text: Record<AdDoor, string> = {
    whatsapp: `Book your first ${words.one} at ${business.name}. Message us on WhatsApp and we'll send you open times.`,
    call: `Call ${business.name} and we'll go through the open times.`,
    form: `Leave your number and ${business.name} will call you back with open times.`,
  };
  return {
    headline: priced,
    text: text[door],
    headlines: [priced, business.name, "Call to book"],
    lines: [
      `${service} at ${business.name}. Call and we'll go through the open times.`,
      `Open ${business.hours}. ${business.address}.`,
    ],
    path: `${business.site} â€º book`,
    greeting: `Hi! Thanks for getting in touch with ${business.name}. How can we help?`,
    ready: `Hi, I'd like to know more about ${service}`,
    questions: ["What is open this week?", `How much is ${service}?`, "Where are you?"],
    startWith: "ready",
    reply: `Hi, thanks for writing. First ${words.many} are open this week. Would Thursday or Friday suit you?`,
    thanks: PREVIEW.thanksOn,
  };
}
