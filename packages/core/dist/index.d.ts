import { SupabaseClient } from '@supabase/supabase-js';
import { SendResult, WaConfig } from '@chanlytics/channels';
import { SendPurpose } from '@chanlytics/contracts';
import { Database, Json } from '@chanlytics/db';

/**
 * deliver(): the one door a message leaves through.
 *
 * Four sequences used to put words on a wire, each assembled by hand: the
 * outbox job asked "opted out?" and nothing about the thread, the broadcast
 * asked the one predicate with the template's purpose and then checked the
 * pause, the voice booking link asked a gate of its own, and the webhook's
 * reply is the statement order of a 300-line function. They disagreed about
 * the pause and about marketing consent, and the disagreements were the
 * defects: a promotional template reaching someone who had said yes to
 * appointments and no to offers; a held draft firing under the owner's own
 * words.
 *
 * This is the door for the first three, and the shape the fourth grows into.
 * It RE-READS the facts at the wire -- the person's consent, the thread's
 * pause, the workspace's status -- because the moment before the send is the
 * one place a stale answer cannot be taken back. It knows nothing about who
 * should be told when a send fails: it returns what happened, and the caller
 * (a job with an owner to alert, a broadcast with a recipient to mark, a
 * voice agent with a caller waiting) says so in its own words.
 *
 * Every send NAMES ITS PURPOSE. A template's purpose is what Meta says it is
 * (purposeOfTemplate fails closed to marketing); words in a conversation are
 * conversational. A send is PROACTIVE when it starts a conversation rather
 * than answering one, and that decides whether a recorded yes is needed for
 * conversational words at all.
 */

type Db = SupabaseClient<Database>;
type Channel = "whatsapp" | "sms";
interface TemplateSend {
    name: string;
    language: string;
    params: string[];
}
interface WirePayload {
    body: string;
    template?: TemplateSend;
}
/** How to put words on one channel's wire. Owns its own address format. */
type Sender = (to: string, p: WirePayload) => Promise<SendResult>;
/**
 * The wires one workspace has. `undefined`: this runtime has no such
 * channel at all. `null`: the channel exists but this workspace holds no
 * credentials or line for it -- refused here, never guessed from the
 * environment, which is how one business's message left on another's line.
 */
type Wire = Partial<Record<Channel, Sender | null>>;
/**
 * WhatsApp's wire from a workspace's credentials. Graph wants bare digits,
 * so the "+" is stripped here rather than by a caller who should not know.
 */
declare function whatsappSender(cfg: WaConfig | null): Sender | null;
interface Delivery {
    tenantId: string;
    conversationId: string;
    contactId: string | null;
    /** E.164, with or without the "+"; each wire shapes it. */
    to: string;
    channel: Channel;
    sender: "ai" | "human" | "system";
    purpose: SendPurpose;
    /** True when this send starts a conversation rather than answering one. */
    proactive: boolean;
    body: string;
    template?: TemplateSend;
    /**
     * An outbox row already written as `queued` (the honest undo): finalized
     * in place rather than inserted, and only while it is still queued, so a
     * cancel that wins the row is never overwritten.
     */
    messageId?: string | null;
    /** Recorded on a row this call writes. */
    meta?: Record<string, Json>;
}
/** Why the door stayed shut. Each is a fact about the person, the thread or the workspace, never about us. */
type DeliveryRefusal = "opted_out" | "not_opted_in" | "no_marketing_consent" | "erased" | "paused" | "human_has_it" | "superseded_by_human";
type Delivered = {
    outcome: "sent";
    messageId: string | null;
    externalId: string | null;
} | {
    outcome: "refused";
    reason: DeliveryRefusal;
    messageId: string | null;
} | {
    outcome: "failed";
    /** Ours: no wire for the channel, no credentials for it, or the provider said no. */
    reason: "no_sender_for_channel" | "no_credentials" | "provider";
    status: number;
    errorBody: string | null;
    messageId: string | null;
};
interface DeliverPorts {
    db: Db;
    wire: Wire;
    /** Epoch ms; injected so the pause is testable. */
    now?: () => number;
}
declare function deliver(ports: DeliverPorts, d: Delivery): Promise<Delivered>;
/**
 * Which yes a queued template needs. Meta's category is the authority -- it
 * can recategorise a live template -- and purposeOfTemplate fails closed, so
 * a template whose category we do not have reads as marketing. A read that
 * fails throws: a purpose that cannot be read is not "utility".
 */
declare function templatePurpose(db: Db, tenantId: string, template: {
    name: string;
    language: string;
} | undefined | null): Promise<SendPurpose>;

export { type Channel, type Db, type DeliverPorts, type Delivered, type Delivery, type DeliveryRefusal, type Sender, type TemplateSend, type Wire, type WirePayload, deliver, templatePurpose, whatsappSender };
