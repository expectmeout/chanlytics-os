/**
 * The doors into a mail client for an email its owner sends from their own inbox (00429; the 4 Oct spec, §4.3): their
 * mail app (mailto:), Gmail's compose and Outlook's, each carrying the address, the subject and the words. Gmail cuts a
 * compose link at about 4,096 characters of the whole link, so when the longest of the three would pass COMPOSE_URL_MAX
 * all three carry the address and the subject alone (`bodyInLinks` false), and the page copies the words to the
 * clipboard as it opens one: a body is never cut short. The lead's own draft (Leads' peek) builds its mailto: here too.
 * Pure.
 */

/** The longest compose link any of the three is given: under Gmail's cut, with room to spare. */
const COMPOSE_URL_MAX = 3800;

/** Each part encoded once, its line breaks CRLF, as mail clients read them. */
const enc = (s: string): string => encodeURIComponent(s.replace(/\r?\n/g, "\r\n"));

/** A mailto: for the owner's own mail app: the address, the subject and the body. */
export function mailtoOf(to: string, subject: string, body: string | null): string {
  return `mailto:${enc(to)}?subject=${enc(subject)}${body === null ? "" : `&body=${enc(body)}`}`;
}

/** Gmail's compose window, signed in as whoever the browser is: `su` is its subject (it ignores `subject`). */
function gmailOf(to: string, subject: string, body: string | null): string {
  return `https://mail.google.com/mail/?view=cm&fs=1&to=${enc(to)}&su=${enc(subject)}${body === null ? "" : `&body=${enc(body)}`}`;
}

/** Outlook on the web's compose window. */
function outlookOf(to: string, subject: string, body: string | null): string {
  return `https://outlook.office.com/mail/deeplink/compose?to=${enc(to)}&subject=${enc(subject)}${body === null ? "" : `&body=${enc(body)}`}`;
}

export interface ComposeLinks {
  mailto: string;
  gmail: string;
  outlook: string;
  /** The words ride in the links; false when they would make one too long, and the page copies them instead. */
  bodyInLinks: boolean;
}

/** The three doors for one email: with its words in them while every link stays under COMPOSE_URL_MAX, else without. */
export function composeLinksOf(e: { to: string; subject: string; text: string }): ComposeLinks {
  const full = {
    mailto: mailtoOf(e.to, e.subject, e.text),
    gmail: gmailOf(e.to, e.subject, e.text),
    outlook: outlookOf(e.to, e.subject, e.text),
  };
  if (Math.max(full.mailto.length, full.gmail.length, full.outlook.length) <= COMPOSE_URL_MAX)
    return { ...full, bodyInLinks: true };
  return {
    mailto: mailtoOf(e.to, e.subject, null),
    gmail: gmailOf(e.to, e.subject, null),
    outlook: outlookOf(e.to, e.subject, null),
    bodyInLinks: false,
  };
}
