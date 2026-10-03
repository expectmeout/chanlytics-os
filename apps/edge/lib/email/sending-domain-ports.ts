/**
 * What the sending-domain verbs share: the ports they are handed (the database, the cold account's config, the DNS
 * reads, the clock, the logger), the door's answer and the owner's words for a refusal (`say`), a row as the page is
 * told about it, and a row as the judge reads it. Moved whole from sending-domains.ts, which re-exports what its callers
 * take.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, SendingDomainRow } from "../packages/db.js";
import type { ResendConfig } from "../packages/channels.js";
import {
  sendingDomainDtoOf,
  type DomainHold,
  type DomainJudgement,
  type DomainRecord,
  type DomainRowState,
  type EdgeErrorCode,
  type SendingDomainDto,
} from "../packages/contracts.js";
import type { Logger } from "../log.js";

type Db = SupabaseClient<Database>;
export type DomainJudgementChange = DomainJudgement["change"];

export interface DomainPorts {
  db: Db;
  /** The platform's pager (ops/page-operator.ts): what is the account's, not a workspace's. Optional: a test may omit it. */
  page?: (key: string, subject: string, body: string) => Promise<unknown>;
  /** The cold account's key (env RESEND_COLD_API_KEY). */
  cfg: ResendConfig;
  /** DMARC at the host or a parent (dmarc.ts readDmarc); null when DNS could not be read. */
  dmarc: (host: string) => Promise<"found" | "missing" | null>;
  /** Whether its DKIM key is published in DNS (dmarc.ts dkimPublished); null when DNS could not be read. */
  dkim: (host: string, records: DomainRecord[]) => Promise<boolean | null>;
  now: () => number;
  log: Logger;
}

/** A row as the page is told about it: contracts' one mapping, which never carries the provider's id. */
export function domainDto(row: SendingDomainRow): SendingDomainDto {
  return sendingDomainDtoOf(row);
}

/** The row's state, as the judge reads it. */
export function stateOf(row: SendingDomainRow): DomainRowState {
  return {
    state: row.state as SendingDomainDto["state"],
    held_why: (row.held_why ?? null) as DomainHold | null,
    held_at: row.held_at,
    verified_at: row.verified_at,
    clean_since: row.clean_since,
    counted_since: row.counted_since,
    dmarc: (row.dmarc ?? null) as SendingDomainDto["dmarc"],
    provider_status: row.provider_status,
  };
}

/** Where a domain's reputation is counted from: its own clock (00178), or, for a row older than it, the ramp's. */
export const countedSince = (row: SendingDomainRow): string | null => row.counted_since ?? row.clean_since;

/** The door's answer: the domain, or a refusal's code with the owner's words in `message` (the page shows them). */
export type DoorAnswer =
  { ok: true; domain: SendingDomainDto } | { ok: false; status: number; error: EdgeErrorCode; message: string };

export const say = (status: number, error: EdgeErrorCode, message: string): DoorAnswer => ({
  ok: false,
  status,
  error,
  message,
});
