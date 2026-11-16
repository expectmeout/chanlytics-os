import { api } from "@/bridge/api";

/**
 * A lead's name or its city put right for every email to them (00631 lead_named): the lead's rows are read again behind
 * its answer, so the card's blanks say it at once.
 */
export async function nameLead(id: string, body: { business_name: string } | { city: string }) {
  return api()("POST leads/[id]/name", { params: { id }, body, refresh: "behind" });
}
