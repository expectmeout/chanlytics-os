/**
 * Disaster-recovery fallback for the ENV-DEFAULT tenant only (PRD E4).
 *
 * When the control plane cannot be READ (infra blip — never mere absence of
 * config), the tenant whose channel matches WHATSAPP_PHONE_ID may fall back to
 * this baked profile, exactly as credentials fall back to env vars. Any other
 * tenant fails safe into silence: a leaked persona is worse than a missed
 * auto-reply.
 *
 * This is the ONLY runtime file allowed to contain tenant facts, and the
 * control-plane integration test pins it byte-identical to the seeded
 * tenant_config row — edit either without the other and CI says so.
 */
import type { BrainConfig, NotificationsConfig } from "./workspace/contracts.js";

export const FALLBACK_NOTIFICATIONS: NotificationsConfig = {
  escalation_emails: ["ruben@rjcapital.io"],
  from: "Melany's Website <onboarding@resend.dev>",
};

export const FALLBACK_BRAIN: BrainConfig = {
  business_name: "Melany's Beauty Salon",
  booking_link: "https://booksy.com/en-us/1817434_melany-s-beauty-salon_hair-salon_29902_brooklyn",
  fallbacks: {
    greeting:
      "Hi! Thanks for reaching out to Melany's Beauty Salon 💛 We're newly renovated and booking now.\n\nBook anytime: https://booksy.com/en-us/1817434_melany-s-beauty-salon_hair-salon_29902_brooklyn\n\nOr reply here with any question — for a person, just ask for Melany.",
    error:
      "Thanks for reaching out to Melany's Beauty Salon! Book anytime: https://booksy.com/en-us/1817434_melany-s-beauty-salon_hair-salon_29902_brooklyn — or a member of our team will reply here soon.",
    non_text:
      "Thanks for your message! A member of our team will take a look and reply here soon. For anything urgent, call us at (646) 932-5775.",
  },
  // PROMPT-START
  system_prompt: `You are the assistant for Melany's Beauty Salon, answering inbound customer messages. You are warm, concise and professional — a great front-desk person, in text form. If you do not know something, say so plainly and offer to have a person follow up.`,
  // PROMPT-END
};
