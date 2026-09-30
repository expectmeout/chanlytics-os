/* global window */
// Chanlytics — Calendar seed data
// Week of Apr 20–26 (app "today" = Sunday Apr 26, 11:42 — matches the dashboard).
// Appointments carry the booking agent, therapist, and status. Aisha's two
// no-shows appear right where her refund story says they happened.

const CAL_HOURS = { start: 9, end: 18 }; // 9:00 → 18:00

// Price per service — header stats compute booked $ from these (no hardcoded sums)
const SERVICE_PRICE = {
  "Swedish 60": 95, "Swedish 90": 135, "Deep tissue 60": 120, "Deep tissue 75": 145,
  "Hot stone 60": 120, "Hot stone 75": 150, "Hot stone 90": 175, "Facial 45": 80,
  "Facial 60": 105, "Recovery 60": 110, "Couples 90": 340, "Intro 45": 75, "Intro 60": 95,
  "Prenatal 60": 105, "Sports 60": 120,
};

const CAL_WEEK = [
  { date: "Apr 20", dow: "Mon", appts: [
    { id: "a-lin",    t: 10.0, dur: 60, who: "Lin Chen",       service: "Swedish 60",     agent: "S", therapist: "lena", status: "done", clientId: "c-chen" },
    { id: "a-ross",   t: 14.0, dur: 60, who: "Jordan Ross",    service: "Swedish 60",     agent: "P", therapist: "jay",  status: "done", clientId: "c-ross" },
  ]},
  { date: "Apr 21", dow: "Tue", appts: [
    { id: "a-rashid", t: 11.0, dur: 75, who: "Rashid Ahmed",   service: "Deep tissue 75", agent: "S", therapist: "jay",  status: "done", clientId: "c-rashid" },
    { id: "a-hp",     t: 15.0, dur: 60, who: "Hannah Park",    service: "Facial 60",      agent: "E", therapist: "lena", status: "done", clientId: "c-park" },
  ]},
  { date: "Apr 22", dow: "Wed", appts: [
    { id: "a-maya1",  t: 9.5,  dur: 60, who: "Maya Rodriguez", service: "Deep tissue 60", agent: "P", therapist: "lena", status: "done", clientId: "c-maya" },
    { id: "a-aki",    t: 13.0, dur: 60, who: "Aki Yamada",     service: "Swedish 60",     agent: "S", therapist: "jay",  status: "done", clientId: "c-yamada" },
    { id: "a-vik0",   t: 16.5, dur: 60, who: "Vik Singh",      service: "Hot stone 60",   agent: "S", therapist: "lena", status: "done", clientId: "c-singh" },
  ]},
  { date: "Apr 23", dow: "Thu", appts: [
    { id: "a-vik",    t: 10.0, dur: 60, who: "Vik Singh",      service: "Swedish 60",     agent: "P", therapist: "jay",  status: "done", clientId: "c-singh" },
    { id: "a-aisha1", t: 16.0, dur: 60, who: "Aisha Khan",     service: "Recovery 60",    agent: "P", therapist: "lena", status: "noshow", clientId: "c-aisha", note: "No-show · 1st" },
  ]},
  { date: "Apr 24", dow: "Fri", appts: [
    { id: "a-claire", t: 11.0, dur: 45, who: "Claire Dubois",  service: "Intro 45",       agent: "Q", therapist: "jay",  status: "done", clientId: "c-claire" },
    { id: "a-sophie", t: 14.0, dur: 90, who: "Sophie Martin",  service: "Couples 90",     agent: "P", therapist: "lena", status: "done", clientId: "c-sophie" },
  ]},
  { date: "Apr 25", dow: "Sat", appts: [
    { id: "a-amy",    t: 10.0, dur: 90, who: "Amy Goldberg",   service: "Hot stone 90",   agent: "P", therapist: "lena", status: "done", clientId: "c-amy" },
    { id: "a-nat",    t: 13.5, dur: 60, who: "Natalie Perez",  service: "Swedish 60",     agent: "P", therapist: "lena", status: "done", clientId: "c-natalie" },
  ]},
  { date: "Apr 26", dow: "Sun", today: true, appts: [
    { id: "a-maya2",  t: 9.0,  dur: 60, who: "Maya Rodriguez", service: "Deep tissue 60", agent: "P", therapist: "lena", status: "done", clientId: "c-maya", cvId: "cv-maya-call" },
    { id: "a-aisha2", t: 10.25,dur: 45, who: "Aisha Khan",     service: "Facial 45",      agent: "I", therapist: "lena", status: "noshow", clientId: "c-aisha", threadId: "th-aisha-refund", cvId: "cv-aisha-call", note: "No-show · 2nd this week", bookedVia: "SMS · Apr 24" },
    { id: "a-selena", t: 11.5, dur: 60, who: "Selena Cho",     service: "Swedish 60",     agent: "P", therapist: "lena", status: "live", note: "Booked on the live call", bookedVia: "phone call · just now" },
    { id: "a-gabby",  t: 11.0, dur: 45, who: "Gabby Moreno",   service: "Consult 45",     agent: "Q", therapist: "jay",  status: "done", verdict: true, threadId: "th-verdict-gabby", note: "Ended 11:45 · verdict needed", bookedVia: "IG DM · Apr 24" },
    { id: "a-jordan", t: 13.0, dur: 60, who: "Jordan Patel",   service: "Intro 60",       agent: "P", therapist: "lena", status: "pending", clientId: "c-jordan", threadId: "th-jordan-discount", cvId: "cv-jordan-sms", note: "Pricing question in Inbox", bookedVia: "email thread · Apr 26" },
    { id: "a-tara",   t: 13.0, dur: 60, who: "Tara Ellis",     service: "Swedish 60",     agent: "S", therapist: "lena", status: "conflict", clientId: null, threadId: "th-booking-conflict", conflictWith: "a-jordan", note: "Double-booked — Lena 1:00 also holds Jordan Patel", bookedVia: "online form · just now" },
    { id: "a-priya",  t: 14.75,dur: 75, who: "Priya Shah",     service: "Hot stone 75",   agent: "P", therapist: "jay",  status: "risk", clientId: "c-priya", note: "Rescheduled 2× · no-show risk", bookedVia: "phone call · Apr 22" },
    { id: "a-marcus", t: 16.5, dur: 60, who: "Marcus Lee",     service: "Swedish 60",     agent: "I", therapist: "jay",  status: "tentative", clientId: "c-marcus", cvId: "cv-marcus-ig", note: "Awaiting confirmation", bookedVia: "IG DM · Apr 25" },
  ]},
];

const CAL_THERAPISTS = [
  { id: "all",  label: "All" },
  { id: "lena", label: "Lena" },
  { id: "jay",  label: "Jay" },
];

window.CALENDAR_DATA = { CAL_WEEK, CAL_HOURS, CAL_THERAPISTS, CAL_NOW: 11.7, SERVICE_PRICE };
