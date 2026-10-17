export function playbookFailedAbout(playbookId, runFor) {
  return { type: "playbook_day", id: `${playbookId}:${runFor}` };
}
export const PLAYBOOK_CALENDAR_UNREAD = "calendar: could not be read";
export function playbookFailedWords(name, why) {
  const label = name.trim() || "A campaign";
  if (why === "calendar")
    return {
      title: `\u201C${label}\u201D could not read your calendar today`,
      body: `\u201C${label}\u201D could not read your calendar today, so nobody was sent it. Tomorrow's run will try again.

It kept trying through the day. Check that the calendar link under Settings \u203A Business still opens; if today's message matters, you can send it yourself from Campaigns.`
    };
  return {
    title: `\u201C${label}\u201D could not run today`,
    body: `\u201C${label}\u201D could not run today, so nobody was sent it. Tomorrow's run will try again.

It kept trying through the day. If today's message matters, you can send it yourself from Campaigns.`
  };
}
