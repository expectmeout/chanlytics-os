const COMPOSE_URL_MAX = 3800;
const enc = (s) => encodeURIComponent(s.replace(/\r?\n/g, "\r\n"));
export function mailtoOf(to, subject, body) {
  return `mailto:${enc(to)}?subject=${enc(subject)}${body === null ? "" : `&body=${enc(body)}`}`;
}
function gmailOf(to, subject, body) {
  return `https://mail.google.com/mail/?view=cm&fs=1&to=${enc(to)}&su=${enc(subject)}${body === null ? "" : `&body=${enc(body)}`}`;
}
function outlookOf(to, subject, body) {
  return `https://outlook.office.com/mail/deeplink/compose?to=${enc(to)}&subject=${enc(subject)}${body === null ? "" : `&body=${enc(body)}`}`;
}
export function composeLinksOf(e) {
  const full = {
    mailto: mailtoOf(e.to, e.subject, e.text),
    gmail: gmailOf(e.to, e.subject, e.text),
    outlook: outlookOf(e.to, e.subject, e.text)
  };
  if (Math.max(full.mailto.length, full.gmail.length, full.outlook.length) <= COMPOSE_URL_MAX)
    return { ...full, bodyInLinks: true };
  return {
    mailto: mailtoOf(e.to, e.subject, null),
    gmail: gmailOf(e.to, e.subject, null),
    outlook: outlookOf(e.to, e.subject, null),
    bodyInLinks: false
  };
}
