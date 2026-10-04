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

/** The bell's title and body for a playbook that could not run today; the first line of the body is what the bell and a phone show. */
export function playbookFailedWords(name: string): { title: string; body: string } {
  const label = name.trim() || "A playbook";
  return {
    title: `“${label}” could not run today`,
    body:
      `“${label}” could not run today, so nobody was sent it. Tomorrow's run will try again.\n\n` +
      "It kept trying through the day. If today's message matters, you can send it yourself from Campaigns.",
  };
}
