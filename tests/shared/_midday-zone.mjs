/**
 * A zone where it is midday now, for a test that runs a broadcast's batch on the machine's own clock: the head of every
 * batch asks the day's sending hours (core broadcast.ts outsideTheHours; contracts PLAYBOOK_HOURS, nine to the
 * twenty-hundred hour by the business's clock), and a throttled batch's next try, a minute or two on, must fall inside
 * them too, whatever the hour the suite happens to run at (the nightly runs at 09:00 UTC, which is the small hours in New
 * York). A workspace in this zone has its noon whenever its tests run.
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 */
export function middayZone(now = new Date()) {
  const k = 12 - now.getUTCHours();
  return k === 0 ? "Etc/GMT" : k > 0 ? `Etc/GMT-${k}` : `Etc/GMT+${-k}`;
}
