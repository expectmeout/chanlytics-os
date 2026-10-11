/**
 * What Today's brief reads from the metrics summary (server/metrics.ts): the workspace, its wires and the day's
 * counts, with the email wire the database cannot see and the summary of the hold the day's replies waited. What the brief says is
 * today-vm.ts; the brief that reads this is today-brief.ts.
 */
import type { EmailSetupDto } from "../email/mailbox";
import { replySpeedOf, type ReplyHoldDto, type ReplySpeed } from "../reports/report-speed";

/**
 * One wire a workspace can be reached on.
 *
 * `metrics_summary` answers the ROUTING rows (tenant_channels, 00087). Email
 * is not one of them: a workspace's email line is its `mailboxes` row plus the
 * deployment's mail domain (mailbox.ts), and the domain lives in EMAIL_DOMAIN,
 * which the database cannot see. `emailWires` below puts it in the same list,
 * from the same read Setup and Connections use, so the three cannot disagree.
 */
export interface MetricsChannelDto {
  kind: string;
  /** `tenant_channels.status`: "active" or "disabled"; "active" for a mailbox that exists. */
  status: string;
  /** The phone number customers reach this wire on; null on a wire that is not a number. */
  number: string | null;
  /** Where customers reach a wire that is not a number: the workspace's email address. */
  address?: string | null;
}

/**
 * The email wire, for that list.
 *
 * A workspace HAS email when this deployment has it and the owner has made the
 * mailbox (00129), the judgement `emailSetupFor` already makes for Setup and
 * Connections. Nothing switches a mailbox off, so a mailbox that exists is a
 * wire that is connected: `last_error` is an intake that failed, which
 * Connections tells as "Waiting on us", and a failed intake is not a wire that
 * is down.
 */
export function emailWires(email: EmailSetupDto | null | undefined): MetricsChannelDto[] {
  return email?.ready && email.mailbox
    ? [{ kind: "email", status: "active", number: null, address: email.mailbox.address }]
    : [];
}

export interface MetricsSummaryDto {
  workspace: { name: string; timezone: string; status: string };
  channels: MetricsChannelDto[];
  /**
   * False when the workspace's email line could not be read (server/metrics.ts
   * caught the mailbox read): the count above the work is short by a wire it
   * cannot name, and says so rather than printing a smaller whole. Absent is
   * true, as every payload the database answers is.
   */
  linesRead?: boolean;
  /**
   * How the day's replies sat against the hold the owner set: the hold most replies waited, in words, and how many went out as it
   * ended, later than it, and with none (`holdOf`, the one rule both reports read; four numbers, however long the day). What
   * `metrics_summary` does not say (it answers the median, and the median of a held reply is the hold): counted by the server
   * (server/metrics/metrics.ts) from the day's replies the function answers for it (00359), or from `first_replies` on a database
   * before that. Absent from an older server's answer, from a longer window, from a read that failed and from a day on which no
   * reply waited a hold, and the sentences then say the median.
   */
  reply_hold?: ReplyHoldDto;
  window: { days: number; since: string; since_local: string; now_local: string };
  now: {
    escalations_open: number;
    oldest_open_escalation_at: string | null;
    threads_needing_human: number;
    threads_snoozed: number;
    threads_awaiting_reply: number;
    last_inbound_at: string | null;
    last_outbound_at: string | null;
  };
  period: {
    messages_in: number;
    messages_out_ai: number;
    messages_out_you: number;
    conversations_active: number;
    answered_by_ai: number;
    answered_by_you: number;
    unanswered_in_window: number;
    median_reply_seconds_ai: number | null;
    send_failures: number;
    escalations_new: number;
    escalation_reasons: Record<string, number>;
    calls: number;
    call_seconds: number;
    call_sentiments: Record<string, number>;
    calls_voicemail: number;
    new_contacts: number;
  };
}

/**
 * How fast the receptionist replied over the window: its median, or, where most replies waited the owner's hold, against it
 * ("as your 1-minute hold ended", spec D14). One reading of one rule (reports/report-speed.ts) for every sentence Today says about
 * speed, so the figure's clause, the recap's line, Ask's fact and the headline's detail never disagree. Null with no reply to speak of.
 */
export function todayReplySpeed(m: MetricsSummaryDto): ReplySpeed | null {
  return replySpeedOf(m.period.median_reply_seconds_ai, m.reply_hold ?? null);
}
