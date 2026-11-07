/**
 * A playbook that could not run, told to the people who must hear of it: the platform at once, the owner at the day's
 * last chance.
 *
 * The hourly sweep (playbooks-sweep.ts) tries a due playbook every hour, so a failed run is tried again, and what it
 * could not do was a log line and a 200: a playbook that failed every hour of a day lost the day with nobody told, while
 * its card read "today, within the hour". Now:
 *
 *   - The platform is paged (shared/alerts/page-operator.ts), one key per workspace, `playbook_failed:<tenant_id>`: the pager keeps
 *     its own six-hour memory of a key, so a workspace that fails all day pages a few times, not once an hour. Not for a
 *     calendar that could not be read (contracts PLAYBOOK_CALENDAR_UNREAD): that link is the owner's, and their notice
 *     says where to check it.
 *   - The owner is told once per playbook per day, in the last hour a run is asked for (contracts inLastSendingHour):
 *     that the playbook could not run today, and that tomorrow's run will try again. Through the notification door
 *     (shared/alerts/notify.ts: the bell's row and the mail), about the playbook and the day (contracts playbookFailedAbout), which
 *     the door keeps no memory of: the notice asks whether it was already kept (packages/db wasNoticeKept) before it is
 *     written, so a second tick in that hour, or a second failure of the same playbook, says nothing twice. No migration.
 *
 * Never throws: a notice that could not go is a log line (`playbook_failed_notice_failed`), and the sweep goes on.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  addressOf,
  inLastSendingHour,
  PLAYBOOK_CALENDAR_UNREAD,
  playbookFailedAbout,
  playbookFailedWords,
} from "@chanlytics/contracts";
import { wasNoticeKept } from "@chanlytics/db/notices";
import type { Database } from "@chanlytics/db/types";
import { errField, type Logger } from "../../shared/log.js";
import { notify } from "../../shared/alerts/notify.js";
import { pageOperator } from "../../shared/alerts/page-operator.js";
import { loadTenantNotifications } from "../../shared/tenant-runtime.js";

type Db = SupabaseClient<Database>;

/** A playbook as the notices name it. */
interface FailedPlaybook {
  id: string;
  name: string;
}

/** What failed: the workspace, the playbooks (one, or every due one when the workspace's context could not be read), and why. */
interface Failure {
  db: Db;
  L: Logger;
  tenantId: string;
  /** The workspace's zone: which hour it is there. */
  tz: string;
  now: Date;
  /** The local day the runs were for. */
  runFor: string;
  playbooks: readonly FailedPlaybook[];
  error: string;
}

/** The platform, paged under the workspace's own key. */
async function pageThePlatform(failure: Failure): Promise<void> {
  const many = failure.playbooks.length > 1;
  const named = failure.playbooks.map((p) => `${p.name} (${p.id})`).join(", ");
  await pageOperator(
    { db: failure.db },
    `playbook_failed:${failure.tenantId}`,
    `${many ? "Campaigns" : "A campaign"} could not run in workspace ${failure.tenantId.slice(0, 8)}`,
    [
      `${many ? `${failure.playbooks.length} campaigns` : "A campaign"} could not run for ${failure.runFor}.`,
      "",
      `Workspace: ${failure.tenantId}`,
      `${many ? "Campaigns" : "Campaign"}: ${named}`,
      `Why: ${failure.error}`,
      "",
      "The sweep tries again every hour through the workspace's last sending hour, when its owner is told once. This page comes at most once in six hours for the workspace.",
    ].join("\n"),
  );
}

/** Whether what failed was the calendar's feed: the owner's link to fix, which the platform is not paged about. */
const calendarUnread = (f: Failure): boolean => f.error === PLAYBOOK_CALENDAR_UNREAD;

/** One playbook's owner, told once for the day. */
async function tellTheOwner(failure: Failure, failedPlaybook: FailedPlaybook): Promise<void> {
  const about = playbookFailedAbout(failedPlaybook.id, failure.runFor);
  if (
    await wasNoticeKept(failure.db, {
      tenantId: failure.tenantId,
      kind: "playbook",
      subjectType: about.type,
      subjectId: about.id,
    })
  )
    return;
  const words = playbookFailedWords(failedPlaybook.name, calendarUnread(failure) ? "calendar" : "other");
  const target = await loadTenantNotifications(failure.db, failure.tenantId);
  await notify(
    { tenantId: failure.tenantId, ...target },
    {
      kind: "playbook",
      // The playbook's own door, its drawer over Campaigns' home (contracts addressOf).
      route: addressOf({ kind: "campaign", id: failedPlaybook.id }),
      about,
      subject: words.title,
      body: words.body,
      redactedBody: "A campaign could not run today in this workspace.",
    },
    { db: failure.db },
  );
  failure.L.info("playbook_failed_told", {
    tenant_id: failure.tenantId,
    playbook_id: failedPlaybook.id,
    run_for: failure.runFor,
  });
}

/**
 * Tells of playbooks that could not run at this tick: the platform, unless what failed was the calendar's feed (a link
 * the owner gave, which the platform cannot mend: a dead one would page it every six hours, for good); each playbook's
 * owner only when this is the last hour the day's run is asked for, told what failed.
 */
export async function tellPlaybookFailed(failure: Failure): Promise<void> {
  if (!calendarUnread(failure)) {
    try {
      await pageThePlatform(failure);
    } catch (e) {
      failure.L.error("playbook_failed_notice_failed", {
        tenant_id: failure.tenantId,
        who: "platform",
        error: errField(e),
      });
    }
  }
  if (!inLastSendingHour(failure.tz, failure.now)) return;
  for (const playbook of failure.playbooks) {
    try {
      await tellTheOwner(failure, playbook);
    } catch (e) {
      failure.L.error("playbook_failed_notice_failed", {
        tenant_id: failure.tenantId,
        playbook_id: playbook.id,
        who: "owner",
        error: errField(e),
      });
    }
  }
}
