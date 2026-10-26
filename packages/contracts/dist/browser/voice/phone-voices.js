export const PHONE_VOICE_SAMPLES_ORIGIN = "https://retell-utils-public.s3.us-west-2.amazonaws.com";
const voice = (id, name, says, file) => ({
  id,
  name,
  says,
  sample: `${PHONE_VOICE_SAMPLES_ORIGIN}/${file}`
});
export const PHONE_VOICES = [
  voice("minimax-Tamsin", "Tamsin", "Woman \xB7 American", "minimax-Tamsin.mp3"),
  voice("minimax-Grace", "Grace", "Woman \xB7 American", "minimax_grace.mp3"),
  voice("minimax-Nia", "Nia", "Woman \xB7 American, younger", "minimax_nia.mp3"),
  voice("minimax-Willa", "Willa", "Woman \xB7 British", "minimax-Willa.mp3"),
  voice("minimax-Claudia", "Claudia", "Woman \xB7 Mexican", "minimax-Claudia.mp3"),
  voice("minimax-Nico", "Nico", "Man \xB7 American", "minimax_nico.mp3"),
  voice("minimax-Jack", "Jack", "Man \xB7 American", "jack.mp3"),
  voice("minimax-Alejandro", "Alejandro", "Man \xB7 Mexican, younger", "minimax-Alejandro.mp3")
];
export const PHONE_VOICES_NATIVE_TO = {
  Spanish: ["minimax-Claudia", "minimax-Alejandro"]
};
export const PHONE_VOICE_DEFAULT = "minimax-Tamsin";
export function phoneVoiceOf(id) {
  return typeof id === "string" ? PHONE_VOICES.find((v) => v.id === id) ?? null : null;
}
export function phoneVoiceShown(id) {
  return phoneVoiceOf(id) ?? phoneVoiceOf(PHONE_VOICE_DEFAULT);
}
export const PHONE_VOICE_WORDS = {
  label: "Voice",
  gate: "change the voice callers hear",
  listen: (name) => `Hear ${name}`,
  stop: "Stop",
  unlisted: "Choose one of the voices on the list.",
  saved: (name) => `Callers hear ${name} from their next call.`
};
