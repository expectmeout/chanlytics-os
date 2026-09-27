import "server-only";
import { z } from "zod";
import {
  DEAL_LOST_REASONS,
  DEAL_LOST_REASON_WORDS,
  DEAL_PERS,
  DEAL_STAGES,
  DEAL_STAGE_WORDS,
  NOTE_MAX,
  NOTE_WORDS,
  amountWords,
  clipAtWord,
  foldName,
  isDealLostReason,
  isRealDate,
  linkHost,
  normalizeLink,
  pickCurrentDeal,
  stepDayOf,
  whyNotALink,
  type DealStage,
} from "@chanlytics/contracts";
import { UUID, defineAct, propose, refuse, str, type ProposalOutcome, type ToolContext } from "../context";

async function proposeDeal(
  t: ToolContext,
  input: {
    contact_id: string;
    stage: string;
    service?: string;
    amount_cents?: number;
    per?: string;
    note?: string;
    proposal_url?: string;
    valid_until?: string;
    lost_reason?: string;
    next_step?: string;
    next_step_due?: string;
  },
): Promise<ProposalOutcome> {
  const id = str(input.contact_id, 40);
  const stage = str(input.stage, 10);
  if (!UUID.test(id)) return refuse("contact_id must be an id a read returned");
  if (!(DEAL_STAGES as readonly string[]).includes(stage)) return refuse("stage must be proposed, won, lost or ended");
  // The proposal's link, judged by the one normalizer the route uses; the day it stands until, a real one; and a reason
  // only for a pass (0008). Each is refused in words before it becomes a card the route would refuse.
  const typedLink = str(input.proposal_url, 600);
  const url = typedLink ? normalizeLink(typedLink) : null;
  if (typedLink && !url) return refuse(`proposal_url: ${whyNotALink(typedLink) ?? "that is not a web address"}`);
  const day = str(input.valid_until, 10);
  if (day && !isRealDate(day)) return refuse("valid_until must be a day, like 2026-09-30");
  const reason = str(input.lost_reason, 20);
  if (reason && !isDealLostReason(reason)) return refuse(`lost_reason must be one of ${DEAL_LOST_REASONS.join(", ")}`);
  if (reason && stage !== "lost") return refuse("lost_reason goes only with stage lost");
  // Its next step (0007, amended): the words and their day together, a real day from the business's today on. It is
  // a note with a day, the team's, which the commit writes after the deal, naming it (commit.ts).
  const stepWords = typeof input.next_step === "string" ? input.next_step.trim() : "";
  if (stepWords.length > NOTE_MAX) return refuse(`next_step is at most ${NOTE_MAX} characters`);
  const stepDue = str(input.next_step_due, 10);
  if (stepWords && !stepDue) return refuse("next_step needs next_step_due, the day it is due, like 2026-09-30");
  if (stepDue && !stepWords) return refuse("next_step_due goes only with next_step");
  const stepDay = stepDue ? stepDayOf(stepDue, t.timezone, t.now.getTime()) : null;
  if (stepDue && !stepDay) return refuse("next_step_due must be a day, like 2026-09-30");
  if (stepDay && stepDay.due === "past") return refuse("next_step_due must be today or later");
  const { data: c, error } = await t.ctx.supabase
    .from("contacts")
    .select("id, display_name, wa_profile_name, phone_e164, email, erased_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!c || c.erased_at) return refuse("no such person in this workspace");
  // Every deal of theirs: the current one may be the oldest, since a running engagement outlives newer proposals
  // (pickCurrentDeal). A read that fails is a card that cannot be checked, never a move proposed against no row.
  const { data: rows, error: dErr } = await t.ctx.supabase
    .from("deals")
    .select("id, stage, service, version, created_at")
    .eq("tenant_id", t.tenantId)
    .eq("contact_id", id)
    .order("created_at", { ascending: false });
  if (dErr) throw new Error(dErr.message);
  const current = pickCurrentDeal(rows ?? []);
  const who = c.display_name || c.wa_profile_name || c.phone_e164 || c.email || "this person";
  const named = str(input.service, 80) || null;
  const amount =
    typeof input.amount_cents === "number" && input.amount_cents >= 0 ? Math.round(input.amount_cents) : null;
  const per = (DEAL_PERS as readonly string[]).includes(str(input.per, 10)) ? str(input.per, 10) : null;
  const note = str(input.note, 200);
  // The rows a move may move: the open ones (proposed, won; already_open is per service, so there may be two), else
  // the current row unless it has ended -- so a passed row moves to won, lost or ended too, since the door allows
  // any move but out of ended. A named service picks its own row among them (foldName: case and accents aside);
  // unnamed, the current row moves. A proposal is a new row, unless it is a passed one sent again for its service.
  type Row = NonNullable<typeof current>;
  const isOpen = (r: Row) => r.stage === "proposed" || r.stage === "won";
  const sameService = (r: Row) => foldName((r.service ?? "").trim()) === foldName(named ?? "");
  const open = (rows ?? []).filter(isOpen);
  const movable: Row[] = open.length ? open : current && current.stage !== "ended" ? [current] : [];
  let sameRow: Row | null = null;
  if (stage !== "proposed") {
    if (!movable.length) return refuse("they have no open deal to move; record a proposal first");
    sameRow = named ? (movable.find(sameService) ?? null) : current;
    if (!sameRow) {
      const names = movable.map((r) => r.service ?? "no named service");
      const whose = open.length > 1 ? "open deals are" : open.length ? "open deal is" : "last deal is";
      return refuse(
        `their ${whose} for ${names.join(" and ")}; name ${names.length > 1 ? "one of those" : "that service"} or none`,
      );
    }
  } else if (current && current.stage === "lost" && (!named || sameService(current))) {
    sameRow = current;
  }
  // On a move the row's own service is said, never the input's: the door never changes a row's service.
  const service = sameRow ? sameRow.service : (named ?? current?.service ?? null);
  t.read.person.add(id);
  const words = DEAL_STAGE_WORDS[stage as DealStage];
  // A proposal's value is said as a client's is (0008), and the card says where the link lives and why they passed.
  const money = amount !== null ? amountWords(amount, per) : null;
  const why = reason && isDealLostReason(reason) ? DEAL_LOST_REASON_WORDS[reason] : null;
  // The step as the card says it: "Next step: send the quote, due Fri" (its words clipped; the note keeps them whole).
  const next = stepDay ? `${NOTE_WORDS.next}: ${clipAtWord(stepWords, 80)}, due ${stepDay.near}` : null;
  return propose({
    kind: "deal",
    title: `${who} · ${words}`,
    summary: [words, service, money, url ? linkHost(url) : null, why, next].filter((x): x is string => !!x).join(" · "),
    payload: {
      contact_id: id,
      stage,
      ...(sameRow ? { deal_id: sameRow.id, version: sameRow.version } : {}),
      ...(service && !sameRow ? { service } : {}),
      ...(amount !== null ? { amount_cents: amount } : {}),
      ...(per ? { per } : {}),
      ...(note ? { note } : {}),
      ...(url ? { proposal_url: url } : {}),
      ...(day ? { valid_until: day } : {}),
      ...(reason ? { lost_reason: reason } : {}),
      who,
    },
    ...(stepDay ? { step: { body: stepWords, due_on: stepDay.day } } : {}),
  });
}

export const propose_deal = defineAct({
  name: "propose_deal",
  description:
    "Propose recording a deal on a person: stage proposed (a proposal went out, a new engagement), won (they said yes or paid, now a client), lost (they passed), or ended (the engagement ended). Optional: service, amount_cents with per (once, month or year: a proposal's value, or a client's agreed amount), a note, the proposal's web address (proposal_url), the last day it stands (valid_until, YYYY-MM-DD), with lost only why they passed (lost_reason: price, timing, elsewhere, no_reply, not_a_fit or other), and the next step on it, next_step (what, for the team) with next_step_due (YYYY-MM-DD, today or later), a note with a day the team sees on the deal. Call it when they say a proposal went out, someone became a client, passed or ended; a next step rides on that stage change, never alone, and a move names the open deal's service when there are two. It records what a person told you and never decides money; a move with no open deal to move is refused in words.",
  input: z.object({
    contact_id: z.string(),
    stage: z.enum(DEAL_STAGES),
    service: z.string().optional(),
    amount_cents: z.number().optional(),
    per: z.enum(DEAL_PERS).optional(),
    note: z.string().optional(),
    proposal_url: z.string().optional(),
    valid_until: z.string().optional(),
    lost_reason: z.enum(DEAL_LOST_REASONS).optional(),
    next_step: z.string().optional(),
    next_step_due: z.string().optional(),
  }),
  examples: [
    {
      contact_id: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
      stage: "proposed",
      service: "Deep clean",
      amount_cents: 25000,
      per: "once",
      proposal_url: "https://example.com/quotes/42",
      valid_until: "2026-10-15",
      next_step: "Call to walk through the quote",
      next_step_due: "2026-10-05",
    },
    { contact_id: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d", stage: "lost", lost_reason: "price" },
  ],
  label: "Preparing a deal",
  build: proposeDeal,
});
