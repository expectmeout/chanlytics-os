import { dateFormat, DAY_MS } from "../shared/time.js";
export function tzClock(iso, tz, now) {
  const t = tzTime(iso, tz);
  if (!iso || !t) return t;
  const key = (d) => {
    try {
      return dateFormat("en-CA", {
        timeZone: tz,
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }).format(d);
    } catch {
      return d.toDateString();
    }
  };
  const day = key(new Date(iso));
  if (day === key(now)) return t;
  if (day === key(new Date(now.getTime() + DAY_MS))) return `tomorrow ${t}`;
  try {
    return `${dateFormat("en-US", { weekday: "short", timeZone: tz }).format(new Date(iso))} ${t}`;
  } catch {
    return t;
  }
}
export function tzSince(iso, tz, now) {
  const t = tzTime(iso, tz);
  if (!iso || !t) return t;
  const dayNumber = (d) => {
    try {
      const parts = dateFormat("en-CA", {
        timeZone: tz,
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }).format(d).split("-").map(Number);
      return Date.UTC(parts[0] ?? 1970, (parts[1] ?? 1) - 1, parts[2] ?? 1) / DAY_MS;
    } catch {
      return Math.floor(d.getTime() / DAY_MS);
    }
  };
  const days = dayNumber(now) - dayNumber(new Date(iso));
  if (days <= 0) return t;
  if (days === 1) return `yesterday ${t}`;
  try {
    const within = days < 7 ? { weekday: "short", timeZone: tz } : { month: "short", day: "numeric", timeZone: tz };
    const day = dateFormat("en-US", within).format(new Date(iso));
    return days < 7 ? `${day} ${t}` : `${day}, ${t}`;
  } catch {
    return t;
  }
}
export function tzTime(iso, tz) {
  if (!iso) return null;
  try {
    return dateFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: tz
    }).format(new Date(iso));
  } catch {
    return null;
  }
}
export function tzDayAndTime(iso, tz, now) {
  if (!iso) return null;
  const t = tzTime(iso, tz);
  if (!t) return null;
  const key = (d) => dateFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const toUtc = (k) => Date.UTC(Number(k.slice(0, 4)), Number(k.slice(5, 7)) - 1, Number(k.slice(8, 10)));
  const days = Math.round((toUtc(key(now)) - toUtc(key(new Date(iso)))) / DAY_MS);
  if (days < 1) return t;
  if (days === 1) return `yesterday at ${t}`;
  try {
    const d = new Date(iso);
    if (days < 7) {
      const day = dateFormat("en-US", { weekday: "long", timeZone: tz }).format(d);
      return `${day} at ${t}`;
    }
    const md = dateFormat("en-US", { month: "long", day: "numeric", timeZone: tz }).format(d);
    return `${md} at ${t}`;
  } catch {
    return t;
  }
}
