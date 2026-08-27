interface WaConfig {
    phoneId: string;
    accessToken: string;
}
interface WaRawMessage {
    from: string;
    id: string;
    type: string;
    timestamp?: string;
    text?: {
        body?: string;
    };
    image?: {
        id?: string;
        mime_type?: string;
        caption?: string;
    };
    audio?: {
        id?: string;
        mime_type?: string;
    };
    video?: {
        id?: string;
        mime_type?: string;
        caption?: string;
    };
    document?: {
        id?: string;
        mime_type?: string;
        caption?: string;
        filename?: string;
    };
    sticker?: {
        id?: string;
        mime_type?: string;
    };
}
interface WaChangeValue {
    metadata?: {
        phone_number_id?: string;
        display_phone_number?: string;
    };
    contacts?: Array<{
        wa_id?: string;
        profile?: {
            name?: string;
        };
    }>;
    messages?: WaRawMessage[];
    statuses?: Array<{
        id?: string;
        status?: string;
        recipient_id?: string;
        errors?: unknown;
    }>;
    message_echoes?: Array<{
        to?: string;
        id?: string;
        text?: {
            body?: string;
        };
    }>;
}
interface WaMediaRef {
    provider_media_id: string;
    mime_type: string | null;
    caption: string | null;
    filename: string | null;
    fetch_state: "pending" | "stored" | "failed";
    storage_path?: string;
}
/** Canonical view of one inbound customer message. */
interface NormalizedInbound {
    waId: string;
    phoneDigits: string;
    profileName: string | null;
    messageId: string;
    type: "text" | "media";
    rawType: string;
    body: string | null;
    channelTsIso: string | null;
    media: WaMediaRef | null;
    optOut: boolean;
}
declare function normalizeInbound(m: WaRawMessage, value: WaChangeValue): NormalizedInbound;
interface SendResult {
    ok: boolean;
    wamid: string | null;
    status: number;
    errorBody?: string;
}
declare function sendText(cfg: WaConfig, to: string, body: string): Promise<SendResult>;
/**
 * Meta media URLs expire in minutes — fetch at ingest. Returns the bytes and
 * mime so the caller can store them (Supabase Storage via the service client).
 */
declare function fetchMediaBytes(cfg: WaConfig, providerMediaId: string): Promise<{
    bytes: ArrayBuffer;
    mime: string | null;
} | null>;

export { type NormalizedInbound, type SendResult, type WaChangeValue, type WaConfig, type WaMediaRef, type WaRawMessage, fetchMediaBytes, normalizeInbound, sendText };
