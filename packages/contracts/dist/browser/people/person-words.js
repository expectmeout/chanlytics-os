export const REPLY_VIA = {
  whatsapp: "WhatsApp",
  sms: "Text",
  email: "Email",
  instagram: "Instagram"
};
export const REPLY_WIRE = {
  WhatsApp: "whatsapp",
  Text: "sms",
  Email: "email",
  Instagram: "instagram"
};
export const PERSON_CHANNEL_WORDS = {
  whatsapp: "WhatsApp",
  sms: "Text",
  voice: "Phone",
  email: "Email",
  instagram: "Instagram"
};
export const PERSON_CAME_FROM_WORDS = {
  whatsapp: REPLY_VIA.whatsapp,
  sms: REPLY_VIA.sms,
  email: REPLY_VIA.email,
  instagram: REPLY_VIA.instagram,
  call: PERSON_CHANNEL_WORDS.voice,
  calendar: "Your calendar",
  manual: "Added by hand",
  import: "Imported",
  lead: "A lead you found",
  ad: "An ad",
  website: "Your website"
};
export const PERSON_AD_ON = {
  meta: "Facebook and Instagram",
  google: "Google",
  tiktok: "TikTok"
};
export const fromAdWords = (name) => name ? `From an ad \xB7 ${name}` : "From an ad";
