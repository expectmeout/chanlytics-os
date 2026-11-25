/**
 * The world the tests of deliver/ share. Split by behaviour from deliver.test.mjs on 25 Nov 2026 (layer 14: a test file
 * over 1,600 lines is two files); its header, as it was:
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 */
/**
 * The door, executed.
 *
 * deliver() is the one place a message leaves through, and the rules it
 * holds are the ones that were decided differently at four call sites: which
 * yes this message needs, whether a person holds the thread, whether the
 * workspace is paused, whose wire and whose credentials. Each is a rule about
 * reaching a real person, so each is proved by running the door against a
 * fake database and a fake wire, never by reading it.
 */
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../../_fake-db.mjs";
import { importBundle } from "../../_source.mjs";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

export const {
  deliver,
  deliverSafely,
  getTemplatePurpose,
  whatsappSender,
  whatsappWire,
  wireUnavailable,
  isWireUnavailable,
  isWireUnavailableError,
  isNotTakenError,
} = await import(pathToFileURL(path.join(ROOT, "packages/core/dist/index.js")).href);

export const T = "t1";

export const NOW = Date.parse("2026-09-10T10:00:00.000Z");

export const person = (over = {}) => ({
  consent: "opted_in",
  dnc: false,
  marketing_consent: "opted_out",
  erased_at: null,
  ...over,
});

export const thread = (over = {}) => ({
  id: "c1",
  tenant_id: T,
  paused_until: null,
  contacts: person(),
  tenants: { status: "active" },
  ...over,
});

// A text leaves only on a line the carriers approved (step 3): a workspace has an active one unless a test says otherwise.
export const TEXT_LINE = {
  tenant_id: T,
  messaging_service_sid: "MG1",
  voice_state: "ready",
  sms_state: "active",
  reg_mock: false,
  created_at: "2026-09-01T00:00:00.000Z",
};

export const tables = (over = {}) => ({
  conversations: [thread()],
  messages: [],
  events: [],
  lines: [TEXT_LINE],
  ...over,
});

/** A wire that says yes and remembers what it was handed. */
export function wireOf(result = { ok: true, wamid: "wamid.1", status: 200 }) {
  const calls = [];
  return {
    calls,
    wire: {
      whatsapp: async (to, p) => {
        calls.push({ to, p });
        return result;
      },
    },
  };
}

/**
 * The send door's one question for a cold email (00424 outreach_mailbox_facts), answered from the world's tables the
 * way the SQL answers it; the SQL itself is proved on a database (outreach-facts.db.test.mjs). `t.suppressed` lists the
 * addresses on the never-again list; `t.sent_today` is what the mailbox sent in the rolling day; a person wrote back when an
 * inbound message of theirs is on one of their threads, an email's automatic reply aside (00181; a reply from another
 * address, and a call, are the SQL's, proved there). A send that names its lead (p_lead_id, 00184) is asked about
 * that lead alone, and only when it is this person's.
 */
export const outreachRpc = (t) => ({
  outreach_mailbox_facts: (a) => {
    const theirs = new Set(
      (t.conversations ?? [])
        .filter((c) => c.tenant_id === a.p_tenant_id && c.contact_id === a.p_contact_id)
        .map((c) => c.id),
    );
    const wroteBack = (t.messages ?? []).some(
      (m) =>
        theirs.has(m.conversation_id) &&
        m.direction === "inbound" &&
        m.sender === "customer" &&
        !(m.channel === "email" && m.meta?.email?.claim === "auto_reply"),
    );
    const live = (t.leads ?? [])
      .filter((l) => l.tenant_id === a.p_tenant_id && l.contact_id === a.p_contact_id && !l.erased_at && !l.blanked_at)
      .filter((l) => !a.p_lead_id || l.id === a.p_lead_id)
      .map((l) => ({ ...l, stage: l.stage ?? "ready" }))
      .sort((x, y) => Number(["ready", "nurture"].includes(y.stage)) - Number(["ready", "nurture"].includes(x.stage)));
    const m = (t.mailbox_connections ?? []).find(
      (x) =>
        x.tenant_id === a.p_tenant_id && x.state !== "removed" && x.address === String(a.p_from).trim().toLowerCase(),
    );
    return {
      lead_stage: live[0]?.stage ?? null,
      suppressed: (t.suppressed ?? []).includes(String(a.p_to).trim().toLowerCase()),
      wrote_back: wroteBack,
      // Its owner stopped writing to the send's own lead (00241).
      stopped: !!(a.p_lead_id && live.find((l) => l.id === a.p_lead_id)?.reach_out_stopped_at),
      mailbox: m
        ? {
            id: m.id,
            address: m.address,
            state: m.state,
            clean_since: m.clean_since ?? null,
            resting_until: m.resting_until ?? null,
            daily_cap: m.daily_cap ?? 40,
            customer_domain: m.customer_domain ?? false,
            sent_days: m.sent_days ?? 0,
            sent_today: t.sent_today ?? 0,
            used: t.sent_today ?? 0,
            recent: [],
            last_sent_at: null,
          }
        : null,
    };
  },
});

export const ports = (t, w, over = {}) => ({
  db: fakeDb(t, {}, outreachRpc(t)),
  wire: w.wire,
  now: () => NOW,
  ...over,
});

export const words = (over = {}) => ({
  tenantId: T,
  conversationId: "c1",
  contactId: "k1",
  to: "+13475550101",
  channel: "whatsapp",
  sender: "human",
  purpose: "conversational",
  proactive: false,
  // What the message is about, required of every sender (decision D1): a person's words in their own thread are theirs. A
  // broadcast's news says "ours", as the door tests of the email row do below.
  about: "theirs",
  body: "See you at 3",
  ...over,
});

export const kinds = (t) => t.events.map((e) => e.kind);

/* ------------------------------------------------------------------ email */

export const { emailSender, sendBroadcastBatch } = await import(
  pathToFileURL(path.join(ROOT, "packages/core/dist/index.js")).href
);

export const { buildEmailRequest, connectedIdentity, sendsAsConnected, sendsAs } = await importBundle("channels");

export const ADDRESS = "ana@example.com";

export const frozen = (over = {}) =>
  buildEmailRequest({
    identity: {
      fromName: "Best Movers",
      fromAddress: "bestmovers@mail.chanlytics.com",
      replyTo: "r+abcdefghijklmnopqrstuvwx@mail.chanlytics.com",
    },
    to: ADDRESS,
    parent: { messageId: "m0", rfcMessageId: "<q1@customer.example>", references: [], subject: "Quote for Saturday" },
    body: "We can do Saturday at 9.",
    signature: null,
    actor: "human",
    messageId: "m1",
    tenantId: T,
    ...over,
  });

export const emailed = (over = {}) =>
  words({ to: ADDRESS, channel: "email", email: frozen(), body: "We can do Saturday at 9.", messageId: "m1", ...over });

/** The row an email is queued as before it leaves, under the id its request was frozen with (frozen()'s "m1"). */
export const queuedEmail = (over = {}) => ({
  id: "m1",
  tenant_id: T,
  conversation_id: "c1",
  contact_id: "k1",
  channel: "email",
  direction: "outbound",
  sender: "human",
  status: "queued",
  body: "We can do Saturday at 9.",
  created_at: "2026-09-10T09:59:00.000Z",
  ...over,
});

export const onEmail = (over = {}) => person({ email: ADDRESS, email_suppressed_at: null, ...over });

export const emailWire = (result = { ok: true, wamid: "re_1", status: 200 }) => {
  const calls = [];
  return {
    calls,
    wire: {
      email: async (to, p) => {
        calls.push({ to, p });
        return result;
      },
    },
  };
};

/* --------------------------------------------------------------- outreach */

export const MAILBOX = {
  local_part: "bestmovers",
  reply_token: "abcdefghijklmnopqrstuvwx",
  reply_token_prev: null,
};

/** The mailbox the business connected (decision 0056): the name it sends as, and its address. */
export const OWN = { address: "sam@getharbor.com", from_name: "Sam at Harbor" };

export const OWNER = "owner@example.com";

/** A cold email as Part 3's writer freezes it: the connected mailbox's identity, plain, its one-click way out. */
export const coldRequest = (over = {}) =>
  buildEmailRequest({
    identity: connectedIdentity(OWN),
    to: OWNER,
    parent: null,
    subject: "Your moving quotes",
    body: "Saw your shop on the map.",
    signature: null,
    actor: "human",
    plain: true,
    autoSubmitted: false,
    campaign: {
      unsubscribeUrl: "https://app.chanlytics.com/u/token",
      footer: 'You\'re hearing from us because your business is listed on Maps. Not interested? Reply "no thanks".',
    },
    messageId: "m1",
    tenantId: T,
    ...over,
  });

/** Twenty clean days; the ramp counts the days it actually sent on (D15). */
export const CLEAN_SINCE = new Date(NOW - 20 * 86_400_000).toISOString();

export const HARBOR = {
  id: "mbx-harbor",
  tenant_id: T,
  address: "sam@getharbor.com",
  state: "connected",
  clean_since: CLEAN_SINCE,
  daily_cap: 40,
  customer_domain: false,
  sent_days: 0,
  resting_until: null,
};

export const coldWorld = ({ who = {}, leads, boxes } = {}) =>
  tables({
    conversations: [thread({ contact_id: "k1", contacts: onEmail({ email: OWNER, consent: "unknown", ...who }) })],
    messages: [queuedEmail({ sender: "ai" })],
    leads: leads ?? [{ id: "l1", tenant_id: T, contact_id: "k1" }],
    mailbox_connections: boxes ?? [{ ...HARBOR }],
  });

export const cold = (over = {}) =>
  words({
    to: OWNER,
    channel: "email",
    sender: "ai",
    purpose: "outreach",
    proactive: true,
    email: coldRequest(),
    body: "Saw your shop on the map.",
    messageId: "m1",
    ...over,
  });

/** A connected mailbox's route, as the edge binds one (mailbox/wire.ts): its sends recorded, each answered `answer`. */
export const ownRoute = (address = OWN.address, answer = { ok: true, wamid: "g-1", status: 200 }) => {
  const sent = [];
  return {
    sent,
    route: {
      lane: "own",
      as: sendsAsConnected({ address }),
      send: async (request, bound) => {
        sent.push({ request, bound });
        return answer;
      },
    },
  };
};

/* ------------------------- Part 5.4: a person's reply may leave by the mailbox the chain wrote from (G15, N5) */

/** A person's reply from a lead, frozen a second time on the chain's connected mailbox: the same row, the same words. */
export const ownTwin = (over = {}) => frozen({ identity: connectedIdentity(OWN), ...over });

/* ----------------------------------------------------- offers by email (step 4) */

export const { campaignsIdentity, sendsAsCampaigns } = await importBundle("channels");

export const OFFER_MAILBOX = {
  local_part: "bestmovers",
  reply_token: "abcdefghijklmnopqrstuvwx",
  reply_token_prev: null,
  from_name: "Best Movers",
};

export const UNSUB = "https://app.example.com/u/token-for-this-person-and-this-email";

/** An offer's frozen request: from the campaigns domain, answered at the mailbox's reply route, its unsubscribe in the headers and the foot. */
export const offerRequest = (over = {}) =>
  buildEmailRequest({
    identity: campaignsIdentity(OFFER_MAILBOX, "campaigns.example.com", "mail.chanlytics.com"),
    to: ADDRESS,
    parent: null,
    subject: "October at Best Movers",
    body: "Ten percent off a Saturday move.",
    signature: null,
    actor: "ai",
    campaign: {
      unsubscribeUrl: UNSUB,
      footer: `You're a customer of Best Movers.\nBest Movers · 12 Main St\nUnsubscribe: ${UNSUB}`,
      footerHtml: `<p>You&#39;re a customer of Best Movers.<br>Best Movers · 12 Main St<br><a href="${UNSUB}">Unsubscribe</a></p>`,
    },
    messageId: "m1",
    tenantId: T,
    ...over,
  });

export const offered = (over = {}) =>
  words({
    to: ADDRESS,
    channel: "email",
    purpose: "marketing",
    sender: "human",
    proactive: true,
    kind: "broadcast",
    email: offerRequest(),
    body: "Ten percent off a Saturday move.",
    messageId: "m1",
    ...over,
  });

/** A customer with a relationship on record and nobody's no: the person an offer by email may go to. */
export const customer = (over = {}) =>
  onEmail({
    marketing_consent: "unknown",
    consent_channels: ["whatsapp", "sms"],
    marketing_channels: null,
    email_marketing: "unknown",
    has_relationship: true,
    ...over,
  });

export const offerWorld = (who, over = {}) => ({
  t: tables({
    conversations: [thread({ contacts: who })],
    messages: [queuedEmail()],
    mailboxes: [{ tenant_id: T, offers_paused_at: null, offers_paused_reason: null, ...over }],
  }),
  w: emailWire(),
});

/**
 * The business's own news by email: a broadcast whose message is a utility, whatever its WhatsApp twin is (decision D1). Since
 * decision D2 it is an offer at the door: its request is an offer's (the campaigns domain, the one-click unsubscribe), and it
 * goes only where the deployment's campaigns domain is open and the workspace's offers are not paused.
 */
export const news = (over = {}) =>
  offered({ purpose: "conversational", sender: "ai", proactive: true, kind: "broadcast", about: "ours", ...over });

/** A person with an address and nothing else on record: no yes of any kind, no relationship, nobody's no. */
export const addressAlone = (over = {}) =>
  customer({ consent: "unknown", consent_channels: null, has_relationship: false, ...over });

/**
 * The broadcast batch (core sendBroadcastBatch) run into the REAL door over a world in memory: one person on email, and the
 * words and the facts their run kept for them. What comes back is what the run wrote on their row, and what the wire was handed.
 */
export async function broadcastBatchByEmail({ who, facts, trigger = null }) {
  const t = tables({
    conversations: [thread({ id: "cv-k1", contacts: who })],
    messages: [],
    mailboxes: [{ tenant_id: T, offers_paused_at: null, offers_paused_reason: null }],
  });
  const w = emailWire();
  // The campaigns domain is open here: the business's own news is an offer at the door (decision D2), and a visit's or a
  // proposal's run, which is not, leaves from the mail domain whether it is or not.
  const door = ports(t, w, { emailOffers: true });
  const marks = [];
  const reminder = {
    meta_status: "approved",
    category: "utility",
    body_preview: "Hi {{1}}, a note from Best Movers.",
    components: [
      { type: "HEADER", format: "TEXT", text: "A note, {{1}}" },
      { type: "BODY", text: "Hi {{1}}, a note from Best Movers." },
    ],
  };
  await sendBroadcastBatch(
    {
      broadcast: async () => ({
        id: "b1",
        state: "sending",
        name: "A note · 2026-09-10",
        template_name: "a_note",
        template_language: "en_US",
        params: [{ kind: "first_name" }],
        recipient_count: 1,
        playbook_id: trigger ? "p1" : null,
        // A playbook run's audience as run-playbook writes it, its moment named; a broadcast's names none.
        audience: trigger ? { kind: "playbook", id: "p1", label: "A moment", trigger } : null,
      }),
      workspacePaused: async () => false,
      sendingStopped: async () => false,
      fail: async () => {},
      startSending: async () => true,
      // The message as the jobs adapter reads it: Meta's row for it and the email version, the one the person is sent.
      message: async (name, language) =>
        ["whatsapp", "email"].map((channel) => ({
          id: `t-${channel}`,
          channel,
          name,
          language,
          variables: [],
          hidden_at: null,
          title: null,
          source: channel === "whatsapp" ? "meta" : "chanlytics",
          rejected_reason: null,
          ...reminder,
          ...(channel === "whatsapp" ? { components: [{ type: "BODY", text: reminder.body_preview }] } : {}),
        })),
      facts: async () => ({ businessName: "Best Movers", bookingLink: null, timezone: "UTC", address: "12 Main St" }),
      batch: async () => [{ contact_id: "k1", facts, channel: "email" }],
      contacts: async (ids) =>
        new Map(
          ids.map((id) => [
            id,
            {
              id,
              phone_e164: null,
              email: ADDRESS,
              email_marketing: who.email_marketing ?? null,
              erased_at: null,
              display_name: "Ana Reyes",
              wa_profile_name: null,
            },
          ]),
        ),
      target: async () => null,
      targetOfContact: async () => ({ conversationId: "cv-k1" }),
      // As the jobs adapter builds it: an offer (and the business's news) leaves on the campaigns domain with the one-click
      // unsubscribe in its headers; anything else from the mailbox on the mail domain.
      emailRequest: async (i) =>
        buildEmailRequest({
          identity: i.offer
            ? campaignsIdentity(OFFER_MAILBOX, "campaigns.example.com", "mail.chanlytics.com")
            : {
                fromName: "Best Movers",
                fromAddress: "bestmovers@mail.chanlytics.com",
                replyTo: "r+abcdefghijklmnopqrstuvwx@mail.chanlytics.com",
              },
          to: i.to,
          parent: null,
          subject: i.subject,
          body: i.body,
          signature: i.offer ? null : i.footer,
          ...(i.offer
            ? { campaign: { unsubscribeUrl: i.offer.unsubscribeUrl, footer: i.footer, footerHtml: i.offer.footerHtml } }
            : {}),
          actor: "human",
          messageId: i.messageId,
          tenantId: T,
        }),
      offersClosed: async () => null,
      offersUnread: async () => null,
      unsubscribeUrl: async () => UNSUB,
      // The row the door sends from, written as the adapter writes it before the send.
      queueEmail: async (row) => {
        t.messages.push(
          queuedEmail({ id: row.id, conversation_id: row.conversationId, contact_id: row.contactId, body: row.body }),
        );
        return { status: "queued" };
      },
      withdrawEmail: async () => {},
      monthSent: async () => 0,
      alreadySent: async () => new Map(),
      byOtherChannels: async () => true,
      mark: async (_id, contactId, patch) => (marks.push([contactId, patch.state, patch.reason ?? null]), true),
      deliver: (d) => deliver(door, d),
      wireUnavailable: async () => null,
      remaining: async () => 0,
      state: async () => "sending",
      tally: async () => ({ sent: 1, held: 0 }),
      heldFor: async () => [],
      scheduleNext: async () => {},
      finish: async () => {},
      alert: async () => {},
      sleep: async () => {},
      now: () => NOW,
      random: () => 0,
    },
    { tenantId: T, broadcastId: "b1", deadline: NOW + 60_000 },
  );
  return { marks, wire: w.calls, t };
}
