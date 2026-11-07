/** What the WhatsApp connect door says for each refusal. */

export const REASON_WORDS: Record<string, string> = {
  preview: "Connecting only works on the production dashboard.",
  number_taken: "That number is already connected to another workspace.",
  channel_read_failed:
    "Chanlytics could not check whether that number is already connected, so nothing was changed. Try again in a moment.",
  exchange_failed: "Meta did not accept the sign-up code. Start the connection again.",
  grant_unreadable: "Meta did not say which WhatsApp account the sign-up granted. Start the connection again.",
  waba_not_granted:
    "The sign-up granted Chanlytics no WhatsApp Business Account. Start it again and share the account when Meta asks.",
  number_missing: "The account has no phone number yet. Start the sign-up again and add the number when Meta asks.",
  number_ambiguous:
    "The account has several numbers and the sign-up window did not say which. Start it again and pick the number to connect.",
  number_unreadable:
    "Meta did not let Chanlytics read that number. Check that the number was selected in the sign-up window.",
  waba_unreadable:
    "Meta did not let Chanlytics read the WhatsApp Business Account. Check that it was shared in the sign-up window.",
  subscribe_failed: "Chanlytics could not subscribe to the account's messages. Try again in a moment.",
  register_failed:
    "The number could not be registered for messaging. If it is still in use by the WhatsApp app on a phone, remove it there first.",
  pin_required:
    "This number has two-step verification on, and Chanlytics cannot register it without that PIN. Turn two-step verification off in WhatsApp Manager, connect again, then turn it back on.",
  credentials_failed: "The connection could not be saved safely, so it was not kept. Try again.",
  channel_write_failed: "The connection could not be saved. Try again.",
  no_app_credentials: "Chanlytics is not set up to connect numbers yet.",
};
