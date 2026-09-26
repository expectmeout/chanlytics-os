import "server-only";
import { z } from "zod";
import {
  EVERYONE_LABEL,
  NO_NUMBER_REACH,
  PLAYBOOK_TRIGGERS,
  audiencePreview,
  compareTemplates,
  listToken,
  listUnknownWords,
  listsFor,
  membersOf,
  nextRunLabel,
  numberHealth,
  playbookListRef,
  policyClassOffered,
  resolveList,
  scheduleLine,
  sendableTemplates,
  starterForTrigger,
  triggerOf,
  triggerOffered,
  unmetNeed,
  type AudienceKind,
  type ListRef,
} from "@chanlytics/contracts";
import { load } from "../../../readers";
import { audiencePool } from "../../../readers/audience-pool";
import { channels as channelsReader } from "../../../readers/channels";
import * as readers from "../../../readers/facts";
import { lists as listsReader } from "../../../readers/lists";
import { playbooks } from "../../../readers/playbooks";
import { templates as templatesReader, type TemplatesRead } from "../../../readers/templates";
import { defineRead, unread, type ToolContext } from "../context";

/**
 * The audiences a broadcast may go to, counted by the same contracts
 * predicate the route enrols with and the page shows — so the number the
 * assistant says is the number the card will carry.
 */
async function listAudiences(t: ToolContext): Promise<unknown> {
  const [pool, lists, tpls, chans] = await Promise.all([
    load(t.rc, audiencePool, undefined).then((r) => r.data),
    // The workspace's own lists as People's rail reads them (readers/lists.ts), once a turn.
    load(t.rc, listsReader, undefined).then((r) => r.data.lists),
    // The composers' read of the templates (readers/templates.ts), once a turn: approved and not hidden by the
    // workspace (ledger #9), each with why this product cannot send it. A read that fails is its own state, as the
    // Broadcasts page keeps it, never "no template yet"; the audiences still answer.
    load(t.rc, templatesReader, { all: false }).then((r) => r.data.templates, unread(t, "list_audiences", "templates")),
    // The channels as the Broadcasts page reads them (readers/channels.ts), once a turn: get_settings reads the same.
    // A read that fails is no number known, as the page takes it -- said as such, never as no number.
    load(t.rc, channelsReader, undefined).then((r) => r.data.channels, unread(t, "list_audiences", "channels")),
  ]);
  const rows = pool.rows;
  // FOUR sizes for every audience: this listing is read BEFORE a template is
  // chosen, the two answers differ, and who gave an answer is not who can be sent
  // the message, which also needs a number (#663). A single `said_yes` here was
  // the marketing count under a name that did not say so, so the assistant would
  // report "nobody said yes" about a utility template that could reach everybody
  // who had ever texted START; and `said_yes_to_offers` was the REACH, so a list
  // whose one yes to offers had no number read as nobody's yes. The send screen's
  // own counts (audiencePreview): `sending` is the number on its chip.
  const sizes = (kind: AudienceKind, id: string | null, ids: Set<string> | null) => {
    const offers = audiencePreview(rows, kind, id, ids, "marketing");
    const messages = audiencePreview(rows, kind, id, ids, "conversational");
    return {
      said_yes_to_offers: offers.saidYes,
      can_be_sent_offers: offers.sending,
      said_yes_to_messages: messages.saidYes,
      can_be_sent_messages: messages.sending,
    };
  };
  // Every list the pool can offer (contracts listsFor): People's lists this workspace can count, then its own. Each
  // with its token (search_people's list) and its kind and id (propose_broadcast's audience). The three consent lists
  // are never audiences: each restates the yes every audience is already crossed with. A list of the workspace's own
  // that can't be counted here is listed with why, and no counts.
  const offered = listsFor(pool.listCtx, lists).filter(
    (d) => !(d.ref.kind === "builtin" && ["opted_in", "offers_ok", "opted_out"].includes(d.ref.id)),
  );
  const audiences = [
    { kind: "everyone", audience_id: null, list: null, label: EVERYONE_LABEL, ...sizes("everyone", null, null) },
    ...offered.map((d) => {
      const m = membersOf(d, rows, pool.listCtx, lists);
      const head = {
        kind: d.ref.kind === "builtin" ? "list" : "saved",
        audience_id: d.ref.id,
        list: d.token,
        label: d.label,
      };
      return m.state === "ok"
        ? { ...head, ...sizes("saved", null, m.ids) }
        : { ...head, cannot_count: listUnknownWords(m.reason, pool.listCtx.calendar) };
    }),
  ];
  // The number a broadcast goes out on, as the Broadcasts page picks it (legacy-bridge/surface-data.ts): the active
  // WhatsApp row, and its health from the quality Meta assigned it.
  const wa = chans?.find((c) => c.kind === "whatsapp" && c.status === "active") ?? null;
  const health = numberHealth({
    quality: wa?.quality ?? null,
    event: wa?.quality_event ?? null,
    limit: wa?.messaging_limit ?? null,
  });
  // The templates the composer offers (ledger #14): WhatsApp's approved ones as the page hands them over, in the
  // library's order, split as the Broadcasts composer splits them (broadcasts-real.jsx) -- the ones this product can
  // put on the wire, and one sentence, the page's, for those it cannot. A card never checks this: a template offered
  // here that the wire refuses became a card whose send failed for everyone on it. The rows carry `blocked`, the
  // answer the reader worked out from Meta's array, which the split believes (contracts templateBlocked); its type
  // names the array they no longer carry.
  const split = tpls
    ? sendableTemplates<TemplatesRead["templates"][number] & { components?: unknown }>(
        tpls.filter((x) => x.channel === "whatsapp" && x.meta_status === "approved").sort(compareTemplates),
      )
    : null;
  // What could not be read, in words the model says: a null above is not none.
  const couldNotRead = [
    ...(split ? [] : ["The messages could not be read just now: say so, and propose no broadcast until they can."]),
    ...(chans ? [] : ["The WhatsApp number's state could not be read just now."]),
  ];
  return {
    route: "broadcasts",
    audiences,
    templates:
      split?.sendable.map((x) => ({
        template_id: x.id,
        name: x.name,
        language: x.language,
        category: x.category,
        values: Array.isArray(x.variables)
          ? (x.variables as { position?: number; label?: string; example?: string | null }[]).map((v) => ({
              position: v.position,
              label: v.label,
              example: v.example ?? null,
            }))
          : [],
        body: x.body_preview,
      })) ?? null,
    cannot_send: split?.why ?? null,
    number: chans
      ? {
          present: !!wa,
          health: health.label,
          can_send: health.canSend,
          limit_per_day: health.limitPerDay === Number.POSITIVE_INFINITY ? null : health.limitPerDay,
        }
      : null,
    ...(couldNotRead.length ? { could_not_read: couldNotRead } : {}),
    note: `Two consents, two counts each. can_be_sent_offers is who a promotional template reaches and can_be_sent_messages who a utility or authentication one reaches, because ${NO_NUMBER_REACH}; said_yes_to_offers and said_yes_to_messages count everyone who gave that yes, a number or not. Pick the template first, then quote its can_be_sent count as who the broadcast reaches -- never a larger count. When that is 0 and its said_yes is not, the ones who said yes have no number: say so, and never send the owner to get a yes they already have.`,
  };
}

/** What a run does under each mode, in the assistant's words. */
const MODE_WORDS: Record<string, string> = {
  auto: "a run sends on its own",
  veto: "a run sends 30 minutes later unless someone stops it",
  ask: "a run waits for a person on Today",
  never: "nothing runs",
};

/**
 * The playbooks as the page shows them — the same rows, the same totals,
 * the same next-run words — and the triggers with the counts the page's
 * chips carry: the Playbooks page's own read (readers/playbooks.ts), once a
 * turn, projected (ledger #10). Every count is the page's: over everyone, with
 * no one looking, the week's touches applied and, where deals are on, whoever
 * already had their proposal's follow-up left out, as a run counts them.
 */
async function listPlaybooksTool(t: ToolContext): Promise<unknown> {
  const [pb, policies] = await Promise.all([
    load(t.rc, playbooks, undefined).then((r) => r.data),
    load(t.rc, readers.policies, undefined).then(
      (r) => r.data,
      () => [],
    ),
  ]);
  const modes = new Map(policies.map((r) => [r.class, r.mode]));
  const modeOf = (cls: string) => modes.get(cls) ?? "ask";
  // Who a moment or a list names that said the yes its template needs, a number or not, and who of them a run reaches
  // now: the page's chip (`candidates`). `said_yes_now` was the reach once, so a moment whose yes had no number to
  // send to read as nobody's yes. Null where the page counts nobody: a read it needs failed.
  const counted = (key: string) => {
    const x = pb.pools[key];
    return x
      ? { said_yes_now: x.saidYes, can_be_sent_now: x.candidates }
      : { said_yes_now: null, can_be_sent_now: null };
  };
  // Why the page counts nobody for a playbook on a list, as far as its read says, and never a reason it does not give.
  // One of the workspace's own: its list could not be read, or is gone; or it is about whoever is looking, and a run
  // has no one (the page's read carries that one, `viewer`); else the page cannot count it and People says why on the
  // list. One of People's: none offered at all is a People read that failed; one offered and uncounted, a read of its
  // own; one not offered needs what this workspace does not have (contracts unmetNeed, in listUnknownWords' words) -- a
  // consult-first service when neither the calendar nor deals is what it lacks, since the page's read does not carry
  // that one, and the built-ins that need nothing are offered whenever the read succeeds.
  const uncounted = (ref: ListRef): string => {
    if (ref.kind === "saved") {
      if (pb.lists === null) return "its list could not be read just now";
      const own = pb.lists.find((l) => l.id === ref.id);
      if (!own) return "its list was deleted";
      if (own.viewer) return listUnknownWords("viewer", pb.calendar);
      return "it could not be counted just now; People says why on the list";
    }
    const def = resolveList(ref, []);
    if (!def) return "its list is not one of People's";
    if (pb.people_lists.length === 0) return "it could not be counted just now";
    if (pb.people_lists.some((l) => l.key === ref.id)) return "it could not be counted just now";
    const need =
      unmetNeed(def.needs, { calendar: pb.calendar, dealsOn: pb.deals_on, consultFirst: true, viewer: false }) ??
      "consult";
    return listUnknownWords(need, pb.calendar);
  };
  return {
    route: "outbound",
    timezone: pb.timezone,
    modes: {
      reengage: modeOf("reengage"),
      campaign: modeOf("campaign"),
      booking: modeOf("booking"),
      // The follow-ups' class only where deals are on (0006).
      ...(policyClassOffered("follow_up", pb.deals_on) ? { follow_up: modeOf("follow_up") } : {}),
    },
    mode_words: MODE_WORDS,
    playbooks: pb.playbooks.map((p) => ({
      playbook_id: p.id,
      name: p.name,
      trigger: p.trigger,
      trigger_label: triggerOf(p.trigger)?.label ?? p.trigger,
      template: p.template_name,
      state: p.state,
      policy_class: p.policy_class,
      mode: modeOf(p.policy_class),
      schedule: scheduleLine(p),
      next_run: nextRunLabel(p, pb.timezone, t.now),
      // On a list (decision 0009): its token, and who a run on it reaches now, as the page counts that list.
      ...(() => {
        const ref = playbookListRef(p);
        if (!ref) return {};
        const token = listToken(ref);
        return { list: token, ...(pb.pools[token] ? counted(token) : { cannot_count: uncounted(ref) }) };
      })(),
      runs: p.totals.runs,
      sent: p.totals.sent,
      replied: p.totals.replied,
      waiting: p.totals.waiting
        ? { broadcast_id: p.totals.waiting.id, people: p.totals.waiting.recipient_count }
        : null,
    })),
    // The moments offered here (0006): a proposal's only where deals are on.
    triggers: PLAYBOOK_TRIGGERS.filter((x) => triggerOffered(x, pb.deals_on)).map((x) => ({
      trigger: x.id,
      label: x.label,
      when: x.hint,
      policy_class: x.cls,
      // On a list, the counts are the list's: list_audiences has each list's.
      ...(x.kind === "saved" ? { counted_per_list: true } : counted(x.id)),
      starter_template: starterForTrigger(x.id)?.title ?? null,
    })),
    note: `A run is a broadcast, and ${NO_NUMBER_REACH}. It never reaches anyone twice within the playbook's gap, and sends one playbook message per person per week. said_yes_now counts who each trigger names that said the yes its template needs, a number or not; can_be_sent_now is who of them a run reaches now, the Playbooks page's own count: whoever a broadcast already reached this week waits out the week. When can_be_sent_now is 0 and said_yes_now is not, the ones who said yes have no number to send to, or heard from a broadcast this week: say so, and never send the owner to get a yes they already have. A null count means the page could not count it just now.${pb.deals_on ? " The proposal follow-up reaches each proposal once, with its link: its counts leave out whoever already had theirs." : ""} Nothing here has run because you read it.`,
  };
}

export const list_audiences = defineRead({
  name: "list_audiences",
  description:
    "The audiences a broadcast may go to — everyone who said yes, every People list this workspace can count, and every list of the workspace's own (kept by hand, or by a rule) — each with its kind and audience_id (propose_broadcast's audience), its list token (search_people's list), and FOUR counts; a list of the workspace's own that can't be counted here carries cannot_count (why) and no counts, because there are two consents and a yes needs a number to send to: can_be_sent_offers and can_be_sent_messages (who a promotional, or a utility or authentication, template reaches) and said_yes_to_offers and said_yes_to_messages (everyone who gave that yes, a number or not). Also the approved WhatsApp templates with their category and values, and whether the number may send. Read this before proposing a broadcast, and match the count to the template.",
  input: z.object({}),
  label: "Reading the lists and templates",
  run: listAudiences,
});

export const list_playbooks = defineRead({
  name: "list_playbooks",
  description:
    "The playbooks: standing rules that send one approved template to newly eligible people who said yes — each with what starts it, its template, its clock, whether it is running, the autonomy mode its class runs under, its next run, what its runs earned, and a run waiting for a person if there is one — plus every trigger with who its moment names right now: said_yes_now (who said the yes its template needs, a number or not) and can_be_sent_now (who of them a run reaches), and each one's starter template. Read this to say what is running, and before proposing a playbook.",
  input: z.object({}),
  label: "Reading the playbooks",
  run: listPlaybooksTool,
});
