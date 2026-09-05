/**
 * A photo the receptionist may look at.
 *
 * Off by default (tenant_config.features.vision). On, a customer's photo over
 * WhatsApp is fetched before the reply instead of after the acknowledgement,
 * handed to the model beside the words below, and answered like a message —
 * under every rule the system prompt already carries. Off, or for anything
 * that is not a small image, the photo is acknowledged and handed to a person
 * exactly as before.
 *
 * Pure: the handler decides WHEN, this file says WHAT.
 */

/** The API's own limit is 10 MB base64; a phone photo is well under this, and
 *  anything bigger is not worth the seconds it would cost the reply. */
export const VISION_MAX_BYTES = 4 * 1024 * 1024;

/** What the API accepts as an image block. */
export const VISION_MIMES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

export function isVisionMime(mime: string | null | undefined): mime is string {
  if (!mime) return false;
  return VISION_MIMES.has(mime.toLowerCase().split(";")[0].trim());
}

/**
 * The words that go beside the image. The customer's caption is quoted as
 * theirs; the rest tells the receptionist how to treat a picture, and says
 * out loud that the standing rules still hold — a photo is the easiest way to
 * be asked "how much would this be?".
 */
export function photoUserText(caption: string | null | undefined): string {
  const said = (caption ?? "").trim();
  return [
    said ? `The customer sent this photo with the message: "${said}"` : "The customer sent this photo, with no words.",
    "Answer as the receptionist would to a customer who has just shown you a picture: say what you notice that matters for the salon — the style, colour, length or condition, or the product — and what the next step is. Every rule you were given still holds: no price, no promised result, no health or skin advice, and never a confirmed appointment. If the picture is not something the salon can help with, say so kindly.",
  ].join("\n\n");
}

export function toBase64(bytes: ArrayBuffer): string {
  return Buffer.from(bytes).toString("base64");
}
