/**
 * What the edge holds to keep and hear a business's videos (decision 0099, stage B): Stream's account, its token and its
 * signing key, and the ear's key, each read from the environment here and never logged. Without Stream's, no video is taken;
 * without the ear's, a video is seen and not heard, and says so.
 */
import { videoEarModelOf, videoWordsShapeOf, type VideoWordsShape } from "@chanlytics/contracts";
import type { StreamAccount, StreamSigning } from "@chanlytics/channels/files";
import { env } from "../shared/env.js";

/** Stream's account and token, or null where either is unset. */
export function streamAccount(): StreamAccount | null {
  const accountId = env.CLOUDFLARE_ACCOUNT_ID;
  const token = env.CLOUDFLARE_STREAM_API_TOKEN;
  return accountId && token ? { accountId, token } : null;
}

/**
 * Everything a video needs at Stream: the account (an upload, its sound) and what signs a video's tokens and names its playback
 * host (its frames, its player); null where any of it is unset.
 */
export function streamKeys(): { account: StreamAccount; signing: StreamSigning } | null {
  const account = streamAccount();
  const keyId = env.CLOUDFLARE_STREAM_KEY_ID;
  const jwk = env.CLOUDFLARE_STREAM_KEY_JWK;
  const customerCode = env.CLOUDFLARE_STREAM_CUSTOMER_CODE;
  return account && keyId && jwk && customerCode ? { account, signing: { keyId, jwk, customerCode } } : null;
}

/** Who writes down what is said, and the ear's model, as the switches say. */
export function hearingSetup(): {
  words: VideoWordsShape;
  ear: string;
  geminiKey: string | null;
  scribeKey: string | null;
} {
  return {
    words: videoWordsShapeOf(env.VIDEO_WORDS_MODEL),
    ear: videoEarModelOf(env.VIDEO_EAR_MODEL),
    geminiKey: env.GEMINI_API_KEY ?? null,
    scribeKey: env.ELEVENLABS_API_KEY ?? null,
  };
}
