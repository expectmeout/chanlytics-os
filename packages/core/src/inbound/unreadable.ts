/**
 * A message the receptionist will not read, and a photo it will. seeingOf decides whether it looks
 * (features.vision, the mode in force, the moment) and makes the one way to acknowledge and hand over what it
 * will not read; unreadableGate says so for anything that is not words; wordsOf is the message as words from
 * then on; and photoOf fetches the bytes, once every gate has agreed there will be a reply.
 */
import { isVisionMime, toBase64, VISION_MAX_BYTES } from "./vision";
import { GO, type Answering } from "./context";

/** Whether the receptionist will look at this photo, and how it says what it will not read. */
export function seeingOf(at: Answering) {
  const { n, rt, brainCfg, replyMode, thread, send, fallbacks, personMode, pauseMs, sink, raw, tell, pauseHours, L } =
    at;
  // WILL the receptionist look at this photo (features.vision, off by
  // default)? Decided from the message, the workspace and the mode in force —
  // no bytes needed — so the routing below can be decided here while the
  // download itself waits until the gates have agreed there will be a reply at
  // all. The fetch used to run on this line: an 8s metadata call, up to 25MB
  // with a 15s timeout, a storage upload and a base64 of the whole buffer,
  // paid in full and then thrown away by a workspace at its reply cap, over
  // its token budget, or paused for billing.
  const maySee =
    n.type === "media" &&
    !!n.media &&
    !!rt?.features?.vision &&
    isVisionMime(n.media.mime_type) &&
    !!brainCfg &&
    (replyMode === "auto" || replyMode === "veto") &&
    Date.now() > thread.pausedUntil;

  /**
   * Say the unreadable thing: a voice note, a sticker, a photo nobody may look
   * at — or one the receptionist meant to look at and could not fetch.
   * Acknowledge it where the mode in force allows, and hand the thread over.
   *
   * A closure because there are two ways in now: the routing decision above,
   * and a vision fetch that fails below the gates. While the fetch sat above
   * them the second case fell into the first by accident, through `!photo`;
   * once the fetch moved it needed saying out loud, because a photo that
   * cannot be read must not quietly become a question answered without it.
   *
   * Resolves to the moment the receptionist is out of the thread until, or 0
   * when it never spoke — the pause itself is written to Postgres by
   * sink.pause below, and a courtesy that did not reach the customer earns no
   * pause.
   */
  const sayUnreadable = async (pausedUntilNow: number): Promise<number> => {
    if (Date.now() <= pausedUntilNow) return 0;
    // The acknowledgement is the receptionist speaking, so it obeys the
    // same rule as every reply: only when the mode in force lets it speak.
    // A workspace on Ask, or a person set to Never, gets no canned text —
    // the message still escalates so a human sees it. No persona -> no ack.
    const mayAck = !!brainCfg && (replyMode === "auto" || replyMode === "veto");
    // WHETHER IT LANDED decides everything after it. The outcome used to be
    // discarded, so expired credentials or a refusal at the wire still paused
    // the thread for a day and still told the owner "(auto-acknowledged, bot
    // paused)": the customer had heard nothing, the receptionist was muted
    // until tomorrow, and the one person who could fix it had been told the
    // opposite. Every other send in this file branches on this.
    const acked = mayAck
      ? // A courtesy, not an answer: marked so it does not spend the daily cap.
        (await send(fallbacks!.non_text, { ack: true })).outcome === "sent"
      : false;
    const pausedUntil = acked ? Date.now() + pauseMs : 0;
    const why = acked
      ? "auto-acknowledged, bot paused"
      : mayAck
        ? "the acknowledgement could not be sent — the customer has heard nothing back"
        : !brainCfg
          ? "no auto-reply configured"
          : personMode
            ? `no acknowledgement — this person is set to '${replyMode}'`
            : `no acknowledgement — reply mode is '${replyMode}'`;
    await Promise.all([
      ...(pausedUntil ? [sink.pause(new Date(pausedUntil).toISOString())] : []),
      sink.escalate("non_text", `Customer sent a ${raw.type} message — ${why}.`),
      tell(`[${raw.type} message]`, `(${why})`, "non-text message", pausedUntil ? pauseHours : null),
    ]);
    L.info("wa_nontext", { acked, may_ack: mayAck, mode: replyMode, person_mode: personMode });
    return pausedUntil;
  };
  return { maySee, sayUnreadable };
}

type Seen = ReturnType<typeof seeingOf>;

/** Anything that is not words, and not a photo the receptionist will look at: acknowledged where it may be, and handed over. */
export async function unreadableGate(at: Answering, seen: Seen): Promise<typeof GO | undefined> {
  const { n, sink, thread } = at;
  const { maySee, sayUnreadable } = seen;
  if (!maySee && (n.type !== "text" || !n.body)) {
    // sink.media() downloads the attachment from Meta and uploads it to
    // storage. That ran above the acknowledgement — so someone who sent a voice
    // note waited through two Graph round trips and a multi-megabyte upload, as
    // much as ~23s of pure timeout, before being told we had seen it. Nothing
    // in the ack depends on those bytes, so it joins the work at the end.
    const media = sink.media(n);
    await sayUnreadable(thread.pausedUntil);
    await Promise.all([media, sink.processed()]);
    return;
  }
  return GO;
}

/** The customer's message as words, from here on. */
export function wordsOf(at: Answering, seen: Seen): string {
  const { n } = at;
  const { maySee } = seen;
  // Past the gate above, this is the customer's message as words — typed, or
  // the label of what they tapped. Everything downstream reads it from here so
  // no branch can reach back to raw.text and miss the tapped case.
  //
  // Named bodyText, not text: `text` is the HTTP helper imported at the top of
  // this file, and shadowing it here would make a later `return text(200, …)`
  // inside this function fail in a thoroughly confusing way.
  //
  // For a photo the receptionist looks at, the words on record are the
  // caption, or the fact of the photo; what the MODEL is told is built beside
  // the image, in vision.ts, and never lands in an alert or the memory.
  const bodyText: string = maySee ? n.media?.caption?.trim() || "[photo]" : (n.body ?? "");
  return bodyText;
}

/** The photo's bytes, now that every gate has agreed there will be a reply; nothing when it could not be used. */
export async function photoOf(
  at: Answering,
  seen: Seen,
): Promise<{ photo: { mime: string; base64: string } | null } | undefined> {
  const { sink, n, L, thread } = at;
  const { maySee, sayUnreadable } = seen;
  // THE BYTES, now that everything above has agreed there will be a reply.
  // Every gate between here and the routing decision — the daily cap, the
  // token budget, the billing pause, the mode in force — discards whatever the
  // model would have been shown, so none of them should have paid for it.
  let photo: { mime: string; base64: string } | null = null;
  if (maySee) {
    const got = await sink.media(n);
    if (got && isVisionMime(got.mime) && got.bytes.byteLength <= VISION_MAX_BYTES) {
      photo = { mime: got.mime, base64: toBase64(got.bytes) };
      L.info("wa_photo_seen", { bytes: got.bytes.byteLength, mime: got.mime });
    } else {
      // Nothing to look at after all, and a caption is not an answer to a
      // picture nobody saw: the same handoff the routing above would have given
      // it, rather than a confident reply composed from the words alone.
      L.info("wa_photo_not_seen", { fetched: !!got, bytes: got?.bytes.byteLength ?? null, mime: got?.mime ?? null });
      await sayUnreadable(thread.pausedUntil);
      await sink.processed();
      return;
    }
  }
  return { photo };
}
