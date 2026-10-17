/**
 * A playbook that could not run today, told to its owner: what the notice says, and what it is about.
 *
 * The hourly sweep tries a running playbook every hour from its own through the last hour sends may go out in
 * (PLAYBOOK_HOURS.max, runDueNow), so a run that fails is tried again until then. Past that hour the day is lost, and
 * the owner is told once, at the last chance (inLastSendingHour): that the named playbook did not run, and that
 * tomorrow's run will try again. Until then nothing says so but a log line and a page to the platform, which is
 * not the owner's to read.
 */

/**
 * What a notice is about when it is a playbook's missed day: the playbook and the local day, so the day's one notice is
 * found again by whoever asks whether it was written (the notification door keeps no memory of its own).
 */
export function playbookFailedAbout(playbookId: string, runFor: string): { type: "playbook_day"; id: string } {
  return { type: "playbook_day", id: `${playbookId}:${runFor}` };
}

/**
 * Why a moment that reads the calendar could not run: the feed could not be read (core run-playbook.ts). Said once, so
 * the run's failure and the notice that tells of it read the same words: a calendar the owner's link no longer opens is
 * theirs to fix, not the platform's to be paged about.
 */
export const PLAYBOOK_CALENDAR_UNREAD = "calendar: could not be read";

/**
 * The bell's title and body for a playbook that could not run today; the first line of the body is what the bell and a
 * phone show. `why` is what failed: the calendar, which the owner can fix (Settings › Business holds its link), or
 * anything else, which the platform was paged about.
 */
export function playbookFailedWords(name: string, why: "calendar" | "other"): { title: string; body: string } {
  const label = name.trim() || "A campaign";
  if (why === "calendar")
    return {
      title: `“${label}” could not read your calendar today`,
      body:
        `“${label}” could not read your calendar today, so nobody was sent it. Tomorrow's run will try again.\n\n` +
        "It kept trying through the day. Check that the calendar link under Settings › Hours & booking still opens; if today's " +
        "message matters, you can send it yourself from Campaigns.",
    };
  return {
    title: `“${label}” could not run today`,
    body:
      `“${label}” could not run today, so nobody was sent it. Tomorrow's run will try again.\n\n` +
      "It kept trying through the day. If today's message matters, you can send it yourself from Campaigns.",
  };
}
