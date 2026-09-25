/**
 * The ways a workspace's first day on Leads can go, from the facts of the day. Moved whole from leads.ts (Reach out
 * Part 2.5) and exported from index.ts directly: it reads first-run.ts, and leads.ts no longer has to, which takes
 * leads.ts out of the contracts' import cycle.
 */
import { firstRunStepRoute } from "./first-run";
import type { LeadWay, LeadWayFacts } from "./leads";

/**
 * The three ways people arrive (§8.9), each claiming only what this tab has
 * read. The People surface carries the calendar and the count; the line is the
 * setup surface's, which this route does not load on a cold open -- so with no
 * facts the way says what it is and points at Setup, and never says a number is
 * live that nobody looked at. "Import a list" is Phase 2 and is not offered
 * until it exists.
 */
export function leadsFirstDayWays(f: LeadWayFacts): LeadWay[] {
  const live = !!(f.voice && f.voice.active && f.voice.number);
  const reachDoors = [
    { id: "line", label: live ? "Your number" : "Set up your number", to: firstRunStepRoute("phone") },
  ];
  if (!f.whatsapp || !f.whatsapp.active)
    reachDoors.push({ id: "whatsapp", label: "Connect WhatsApp", to: "admin/integrations" });
  return [
    {
      id: "reach",
      title: "They reach you",
      line: live
        ? `Calls and texts to ${f.voice!.number} are answered, and each person lands here.`
        : "Calls and texts to your number are answered, and each person lands here.",
      status: live ? "Your number is live" : null,
      doors: reachDoors,
    },
    {
      id: "calendar",
      title: "Your calendar",
      line: "Anyone with an appointment is added, with their visits, so regulars aren't strangers.",
      status: f.calendar === "ok" ? "Your calendar is connected" : null,
      doors:
        f.calendar === "ok"
          ? [{ id: "calendar", label: "Open the calendar", to: "calendar" }]
          : [{ id: "calendar", label: "Connect your calendar", to: "admin/integrations" }],
    },
    {
      id: "yours",
      title: "Clients you already have",
      line: "Add them one at a time, and they gather here with everyone else.",
      status: f.people > 0 ? `${f.people} ${f.people === 1 ? "person" : "people"} here already` : null,
      doors: [{ id: "add", label: "Add someone", to: "clients" }],
    },
  ];
}
