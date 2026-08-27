# Standards Roundup — pre-analysis audit

## Enum registry (values in use)
- **kind**: agent · all · applied · approval · archive · broadcast · case · client · convert · decided · decision · done · ghost · lead · lead-source · list · manual · no-show · opened · outbound · page · policy · primary · scheduled · sent · signal · snoozed · takeover · thread · trigger · whisper · you
- **status**: active · approval · cancelled · completed · confirmed · connected · done · draft · ended · escalated · failed · idle · in-flight · live · noshow · paused · pending · risk · running · scheduled · stalled · tentative
- **tone**: accent · danger · helpful · low · neg · ok · pos · warm · warn
- **state**: done · drafts · escalated · live · needs · snoozed · watching
- **bucket**: champion · drifting · needs-you · new · steady
- **stage**: booked · contacted · new · nurture · qualified · qualifying · ready · won

## Hardcoded stat values / metas (11)
_StatCell/meta strings carrying literal numbers_
- pages/agent-store.jsx:224 — <StatCell label="Credits" value="5,350" meta="renews Aug 1" />
- pages/agent-store.jsx:224 — <StatCell label="Credits" value="5,350" meta="renews Aug 1" />
- pages/broadcasts.jsx:194 — <StatCell label="Delivery" value="99%" meta="opt-outs auto-excluded" />
- pages/clients-a.jsx:476 — <StatCell label="Total book" value={CLIENTS_AGGREGATES.total} meta="+9 this month" metaTone="pos" />
- pages/clients-a.jsx:477 — <StatCell label="Active touches" value={CLIENTS_AGGREGATES.activeAgentTouches} meta="today · 6 agents" />
- pages/clients-a.jsx:479 — <StatCell label="Health index" value={Math.round(CLIENTS_AGGREGATES.health.score * 100)} meta="↓ 2 vs last wk 
- pages/content-cal.jsx:134 — <StatCell label="Engagement" value="666" meta="likes + votes · ↑ 22% wk" />
- pages/content-cal.jsx:134 — <StatCell label="Engagement" value="666" meta="likes + votes · ↑ 22% wk" />
- pages/content-cal.jsx:135 — <StatCell label="From content" value="+$620" meta="4 bookings via DM" accent />
- pages/content-cal.jsx:135 — <StatCell label="From content" value="+$620" meta="4 bookings via DM" accent />
- pages/leads.jsx:486 — <StatCell label="First touch" value={LEADS_AGGREGATES.medianFirstTouch} meta="median · target < 2m" metaTone="

## Static counts & $/% literals in rendered text (8)
_numbers painted into JSX text nodes_
- pages/broadcasts.jsx:37 — { id: "sch-may", name: "May schedule change", when: "May 1 · 9:00 AM", segId: "lena-clients", label: "Lena's c
- pages/outbound.jsx:14 — audience: { label: "Birthday this week", count: 8, to: "clients" },
- pages/outbound.jsx:20 — audience: { label: "Lapsed 60+ days", count: 23, to: "clients", segId: "lapsed-60" },
- pages/outbound.jsx:26 — audience: { label: "Package ending soon", count: 18, to: "clients", segId: "pkg-ending" },
- pages/outbound.jsx:38 — audience: { label: "Advocates", count: 14, to: "clients", segId: "advocates" },
- pages/outbound.jsx:44 — audience: { label: "All active clients", count: 120, to: "clients" },
- pages/segments.jsx:566 — id, label, count: 0, kind: "agent", agent: "Qualifier",
- pages/settings.jsx:190 — <li><Icon name="check" size={11} /><span>Discounts above 15% require your approval</span></li>

## Bare route strings (not via CHANLY.R) (45)
- pages/agent-fleet.jsx:332 — conversations/cv-selena-live
- pages/agent-studio.jsx:125 — admin/memory
- pages/calendar.jsx:539 — admin/integrations
- pages/dashboard-a-ask.jsx:14 — to: inbox/th-aisha-refund
- pages/dashboard-a-ask.jsx:14 — to: clients/c-aisha
- pages/dashboard-a-ask.jsx:16 — to: inbox/th-aisha-refund
- pages/dashboard-a-ask.jsx:41 — to: clients/c-maya
- pages/dashboard-a-ask.jsx:42 — to: clients/c-jordan
- pages/dashboard-a-ask.jsx:43 — to: clients/c-aisha
- pages/dashboard-a-ask.jsx:44 — to: clients/c-priya
- pages/dashboard-a-ask.jsx:45 — to: clients/c-david-chen
- pages/dashboard-a-ask.jsx:46 — to: clients/c-yuki
- pages/dashboard-a-ask.jsx:47 — to: clients/c-marcus
- pages/dashboard-a-ask.jsx:88 — to: inbox/th-jordan-discount
- pages/dashboard-a-ask.jsx:95 — to: inbox/th-aisha-refund
- pages/dashboard-a-ask.jsx:112 — to: segments/drifting-vips
- pages/dashboard-a-ask.jsx:113 — to: broadcasts/drifting-vips
- pages/dashboard-a-ask.jsx:159 — to: inbox/th-aisha-refund
- pages/dashboard-a-ask.jsx:169 — to: inbox/th-aisha-refund
- pages/dashboard-a-ask.jsx:169 — to: clients/c-aisha
- pages/dashboard-a-ask.jsx:171 — to: inbox/th-aisha-refund
- pages/dashboard-a-ask.jsx:180 — to: inbox/th-jordan-discount
- pages/dashboard-a-ask.jsx:190 — to: inbox/th-jordan-discount
- pages/dashboard-a-ask.jsx:192 — to: inbox/th-jordan-discount
- pages/dashboard-a-ask.jsx:550 — conversations/cv-selena-live
- pages/live-monitor.jsx:49 — conversations/phone
- pages/live-monitor.jsx:295 — to: conversations/phone
- pages/outbound.jsx:234 — conversations/chats
- pages/segments.jsx:234 — admin/notifications
- pages/settings.jsx:275 — to: admin/memory
- pages/settings.jsx:399 — to: admin/billing
- pages/settings.jsx:427 — to: admin/billing
- pages/tasks.jsx:55 — to: admin/integrations
- pages/tasks.jsx:210 — admin/memory
- components/topbar.jsx:11 — to: inbox/th-aisha-refund
- components/topbar.jsx:11 — to: clients/c-aisha
- components/topbar.jsx:14 — to: segments/drifting-vips
- components/topbar.jsx:14 — to: clients/c-yuki
- components/topbar.jsx:17 — to: conversations/cv-maya-call
- components/topbar.jsx:20 — to: admin/integrations
- components/topbar.jsx:23 — to: calendar/a-priya
- components/topbar.jsx:26 — to: segments/lapsed-60
- components/topbar.jsx:32 — to: fleet/phone-rep
- components/topbar.jsx:127 — to: conversations/cv-selena-live
- components/topbar.jsx:127 — to: calendar/a-selena

## Seed-clock literals (13)
_dates/times that should come from one seed constant_
- pages/broadcasts.jsx:29 — { name: "April win-back · 20% off",   date: "Apr 20", seg: "Lapsed 60+ days", segId: "lapsed-60",   sent: 23, 
- pages/broadcasts.jsx:31 — { name: "Spring hours change",      date: "Apr 2",  seg: "Everyone",                              sent: 178, d
- pages/broadcasts.jsx:124 — const scheduleIt = (when = "Tomorrow · 9:00 AM") => {
- pages/broadcasts.jsx:291 — { label: "Tomorrow · 9:00 AM", icon: "clock", onClick: () => scheduleIt("Tomorrow · 9:00 AM") },
- pages/calendar.jsx:475 — <span className="cal-week-range">{view === "day" && shown[0] ? `${shown[0].dow} · ${shown[0].date}` : "Apr 20 
- pages/client-profile.jsx:59 — { type: "event", at: "Apr 26 · 11:00", text: "Marked no-show by Front Desk · 2nd this week" },
- pages/client-profile.jsx:60 — { type: "agent", agent: "Phone Rep", at: "Apr 24 · 09:12", text: "Confirmed Tuesday 11am reschedule via SMS." 
- pages/client-profile.jsx:61 — { type: "client", channel: "sms", at: "Apr 24 · 09:11", text: "Sorry I missed Friday — work emergency. Can I r
- pages/client-profile.jsx:62 — { type: "event", at: "Apr 23 · 16:15", text: "Marked no-show by Front Desk" },
- pages/client-profile.jsx:63 — { type: "session", at: "Apr 16 · 14:00", text: "Deep tissue 60 with Lena — completed" },
- pages/client-profile.jsx:64 — { type: "client", channel: "phone", at: "Apr 14 · 11:02", text: "Booked Friday 4pm." },
- pages/settings.jsx:342 — <SetRow label="Weekly report email" hint="Sundays, the Reports page in your inbox">
- pages/settings.jsx:387 — { id: "inv-apr", date: "Apr 1, 2026", label: "Professional · monthly", amount: "$99.00", status: "Paid" },

## Generic Ask/links where entity routes exist (46)
- pages/agent-fleet.jsx:185 — links: [{ label: "Its queue in Inbox", to: "inbox" }],
- pages/agent-store.jsx:140 — links: [{ label: "Open Fleet", to: "fleet" }],
- pages/app-shell.jsx:235 — crumbs = threadWho ? [{ label: "Inbox", to: "inbox" }, threadWho] : ["Inbox"];
- pages/app-shell.jsx:249 — crumbs = ["People", { label: "Clients", to: "clients" }, segMeta ? segMeta.label : "Segment"];
- pages/app-shell.jsx:255 — crumbs = ["People", { label: "Clients", to: "clients" }, client ? client.name : "Profile"];
- pages/app-shell.jsx:289 — crumbs = segMeta ? ["People", { label: "Segments", to: "segments" }, segMeta.label] : ["People", "Segments"];
- pages/app-shell.jsx:316 — crumbs = apptWho ? [{ label: "Calendar", to: "calendar" }, apptWho] : ["Calendar"];
- pages/app-shell.jsx:326 — crumbs = [{ label: "Conversations", to: "conversations" }, "Live"];
- pages/app-shell.jsx:334 — crumbs = cvWho ? [{ label: "Conversations", to: "conversations" }, cvWho] : chLabel ? [{ label: "Conversations
- pages/app-shell.jsx:355 — crumbs = fleetAgent ? ["Agents", { label: "Fleet", to: "fleet" }, fleetAgent.name] : ["Agents", "Fleet"];
- pages/calendar.jsx:212 — links: [{ label: "Open Calendar", to: "calendar" }],
- pages/client-profile.jsx:229 — links: [{ label: "Live monitor", to: "live" }, { label: "Open Inbox", to: "inbox" }],
- pages/client-profile.jsx:235 — links: [{ label: "Open Calendar", to: "calendar" }],
- pages/client-profile.jsx:243 — { label: "Archive client", icon: "x", danger: true, onClick: () => window.askAbout({ prompt: "Archive " + c.na
- pages/dashboard-a-ask.jsx:25 — { role: "ai", text: "Lena is at 82% capacity this week — 19 of 23 bookable hours. Today she has Maya (done), A
- pages/dashboard-a-ask.jsx:31 — { match: /refund|approve|decline/i, label: "Decide in Inbox", to: "inbox" },
- pages/dashboard-a-ask.jsx:32 — { match: /segment|smart list|lapsed|drifting|no-show list/i, label: "Open Segments", to: "segments" },
- pages/dashboard-a-ask.jsx:33 — { match: /revenue|report|convert|credit|return/i, label: "Open Reports", to: "reports" },
- pages/dashboard-a-ask.jsx:34 — { match: /book|calendar|schedule|slot|resched/i, label: "Open Calendar", to: "calendar" },
- pages/dashboard-a-ask.jsx:35 — { match: /agent|fleet|autonomy|pause/i, label: "Open Fleet", to: "fleet" },
- pages/dashboard-a-ask.jsx:36 — { match: /client/i, label: "Open Clients", to: "clients" },
- pages/dashboard-a-ask.jsx:102 — links: [{ label: "Open Fleet", to: "fleet" }],
- pages/dashboard-a-ask.jsx:125 — return { role: "ai", text: "Queue clear — you've decided everything that was waiting. Agents will pause anythi
- pages/dashboard-a-ask.jsx:130 — links: open.filter(t => t.threadId).map(t => ({ label: t.who.split(" ")[0], to: `inbox/${t.threadId}` })).conc
- pages/dashboard-a-ask.jsx:141 — links: [{ label: "Open Reports", to: "reports" }, { label: "Today's pulse", to: "today" }],
- pages/dashboard-a-ask.jsx:150 — links: [{ label: "Open Calendar", to: "calendar" }],
- pages/dashboard-a-ask.jsx:258 — { label: "Today", to: "today" }, { label: "Inbox", to: "inbox" }, { label: "Clients", to: "clients" },
- pages/dashboard-a-ask.jsx:259 — { label: "Leads", to: "leads" }, { label: "Segments", to: "segments" }, { label: "Pipeline", to: "pipeline" },
- pages/dashboard-a-ask.jsx:260 — { label: "Calendar", to: "calendar" }, { label: "Conversations", to: "conversations" }, { label: "Live Monitor
- pages/dashboard-a-ask.jsx:261 — { label: "Fleet", to: "fleet" }, { label: "Agent Store", to: "store" }, { label: "Tasks", to: "tasks" },
- pages/dashboard-a-ask.jsx:262 — { label: "Reports", to: "reports" }, { label: "Broadcasts", to: "broadcasts" }, { label: "Outbound", to: "outb
- pages/inbox-list.jsx:165 — done:      { icon: "check", title: "48 resolved this week", body: "Handled threads archive after 7 days — ever
- pages/inbox-rail.jsx:55 — { label: "Why this call?", icon: "sparkle", onClick: () => window.askAbout({ prompt: "Why did the agent make t
- pages/inbox-thread.jsx:133 — { label: "Mark as unread", icon: "inbox", onClick: () => window.askAbout({ prompt: "Mark this conversation unr
- pages/outbound.jsx:14 — audience: { label: "Birthday this week", count: 8, to: "clients" },
- pages/outbound.jsx:20 — audience: { label: "Lapsed 60+ days", count: 23, to: "clients", segId: "lapsed-60" },
- pages/outbound.jsx:26 — audience: { label: "Package ending soon", count: 18, to: "clients", segId: "pkg-ending" },
- pages/outbound.jsx:32 — audience: { label: "After a 5★ visit", count: null, to: "clients" },
- pages/outbound.jsx:38 — audience: { label: "Advocates", count: 14, to: "clients", segId: "advocates" },
- pages/outbound.jsx:44 — audience: { label: "All active clients", count: 120, to: "clients" },
- pages/outbound.jsx:223 — links: c.audience.segId ? [{ label: "Open the audience", to: "segments/" + c.audience.segId }] : [{ label: "Op
- pages/settings.jsx:136 — links: [{ label: "See it in Fleet", to: "fleet" }],
- pages/settings.jsx:216 — links: [{ label: "See it in Tasks", to: "tasks" }],
- components/topbar.jsx:20 — actions: [{ label: "Reconnect", to: "admin/integrations", primary: true }, { label: "View task", to: "tasks" }
- components/topbar.jsx:26 — actions: [{ label: "Open list", to: "segments/lapsed-60", primary: true }, { label: "In Reports", to: "reports
- components/topbar.jsx:53 — actions: [{ label: "View task", to: "tasks", primary: true }],

## Direct global mutations outside stores (3)
- pages/segments.jsx:528 — window.CLIENT_SEGMENTS.push({ id: seg.id, label: seg.label, count: pool.length, kind: "agent", agent: "Qualifi
- pages/segments.jsx:529 — window.SEGMENT_META[seg.id] = liveMeta;
- data/people-data.jsx:401 — window.CLIENT_SEGMENTS.push(...LEAD_SEGMENTS);

## Magic baseline numbers (4)
- pages/agent-store.jsx:224 — <StatCell label="Credits" value="5,350" meta="renews Aug 1" />
- pages/inbox.jsx:266 — // Live bucket counts (done keeps its archive baseline of 48 resolved this week)
- pages/inbox.jsx:269 — count: threads.filter((t) => t.state === b.id).length + (b.id === "done" ? 48 : 0),
- pages/tasks.jsx:104 — const doneBase = 41 + tasks.filter(t => t.decided && t.status === "done").length;

## Timer expandos (should be zero) (0)

## Resolution addendum (this pass)
- Groups A–D executed: stats wired to shared sources, seed-clock derived, code-path routes on R.*, baselines moved to TASKS_BASELINE / INBOX_BASELINE.
- E8 (46 generic Ask links): code-path entity routes converted; the remainder are page-level intents inside answer copy (acceptable) — revisit per-surface.
- E9: Agent Store and Agent Studio still need their deep-analysis rounds.
