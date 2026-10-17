import { clipAtWord } from "../conversations/message-words.js";
const NOTE_TEXT_SAID_MAX = 160;
export function applySettingsChange(config, change) {
  if (change.op === "set_goal") {
    const ask = { ...config.ask ?? {} };
    const goal = change.goal.trim();
    if (goal) ask.goal = goal;
    else delete ask.goal;
    return { ...config, ask };
  }
  const brain = { ...config.brain ?? {} };
  const profile = { ...brain.profile ?? {} };
  switch (change.op) {
    case "add_closure": {
      const closures = [...profile.closures ?? []];
      closures.push({
        date: change.date,
        ...change.until ? { until: change.until } : {},
        ...change.note ? { note: change.note } : {}
      });
      profile.closures = closures;
      break;
    }
    case "set_hours": {
      const hours = { ...profile.hours ?? {} };
      hours[change.day] = change.open && change.close ? { open: change.open, close: change.close } : { open: null, close: null };
      profile.hours = hours;
      break;
    }
    case "add_note": {
      const notes = [...profile.notes ?? []];
      notes.push({ title: change.title, text: change.text, ...change.until ? { until: change.until } : {} });
      profile.notes = notes;
      break;
    }
    case "add_service": {
      const services = [...profile.services ?? []];
      services.push({ name: change.name, ...change.duration_min ? { duration_min: change.duration_min } : {} });
      profile.services = services;
      break;
    }
  }
  brain.profile = profile;
  return { ...config, brain };
}
export function describeSettingsChange(change) {
  switch (change.op) {
    case "add_closure":
      return change.until ? `Closed ${change.date} to ${change.until}${change.note ? ` (${change.note})` : ""}` : `Closed on ${change.date}${change.note ? ` (${change.note})` : ""}`;
    case "set_hours":
      return change.open && change.close ? `${change.day}: ${change.open}\u2013${change.close}` : `${change.day}: closed`;
    case "add_note": {
      const text = clipAtWord(change.text.replace(/\s+/g, " "), NOTE_TEXT_SAID_MAX);
      return `Note for the receptionist: \u201C${change.title}\u201D${change.until ? `, until ${change.until}` : ""}${text ? ` \u2014 \u201C${text}\u201D` : ""}`;
    }
    case "add_service":
      return `New service: ${change.name}${change.duration_min ? ` (${change.duration_min} min)` : ""}`;
    case "set_goal":
      return change.goal.trim() ? `Your goal: \u201C${change.goal.trim()}\u201D` : "Your goal, taken away";
  }
}
