/* global React, Icon, StatStrip, StatCell */
// Campaigns › Content — the content calendar. Chat Agent drafts; you approve the voice.
// Draft state is page-level so cards, the week grid, and the stats move together;
// the held collab slot overlays the @thewellness.co Inbox decision (IX_STORE).

const CT_DRAFTS = [
  {
    id: "ct-review", platform: "IG post", tint: "peach", glyph: "MR",
    title: "Maya's five-star review, reposted",
    cap: "“Best deep tissue in the city — Lena remembers everything.” — Maya R. ⭐⭐⭐⭐⭐ Book your reset this week.",
    by: "Drafted by Chat Agent · from Maya's Apr 19 review",
    slot: "Today · 5:00pm",
  },
  {
    id: "ct-couples", platform: "IG story", tint: "sage", glyph: "C90",
    title: "Couples 90 — May weekends",
    cap: "Anniversary season is booking up. Couples 90-min, $340 — Saturday slots go first. DM us “MAY” to hold one.",
    by: "Drafted by Chat Agent · demand signal: 2 couples inquiries this week",
    slot: "Tue · 6:30pm",
  },
];

const CT_WEEK = [
  { dow: "Mon", d: 20, posts: [{ t: "5:12pm", platform: "post", title: "Client testimonial · repost", stats: "189 likes · 3 DMs" }] },
  { dow: "Tue", d: 21, posts: [] },
  { dow: "Wed", d: 22, posts: [{ t: "12:00pm", platform: "post", title: "Meet Jay — new therapist", stats: "214 likes · 6 DMs" }] },
  { dow: "Thu", d: 23, posts: [{ t: "4:00pm", platform: "story", title: "Poll: hot stone vs deep tissue", stats: "96 votes · 2 bookings" }] },
  { dow: "Fri", d: 24, posts: [] },
  { dow: "Sat", d: 25, posts: [{ t: "10:00am", platform: "post", title: "Weekend self-care carousel", stats: "167 likes · 4 saves" }] },
  { dow: "Sun", d: 26, today: true, posts: [
    { t: "5:00pm", platform: "post", title: "Maya review repost", draftId: "ct-review" },
    { t: "—", platform: "collab", title: "@thewellness.co collab", collab: true },
  ]},
];

const ContentDraftCard = ({ d, state, onApprove, onSkip, onRestore }) => {
  const [editing, setEditing] = React.useState(false);
  const [cap, setCap] = React.useState(d.cap);
  return (
    <article className={"ct-card" + (state === "skipped" ? " skipped" : "")}>
      <div className="ct-card-top">
        <span className="pill">{d.platform}</span>
        {state === "scheduled"
          ? <span className="pill pill-ok"><Icon name="check" size={10} /> Scheduled · {d.slot}</span>
          : state === "skipped"
          ? <span className="pill">Skipped</span>
          : <span className="pill pill-accent">Needs your voice</span>}
      </div>
      <div className={"ct-visual " + d.tint}><span className="ct-visual-glyph mono">{d.glyph}</span></div>
      <div className="ct-title">{d.title}</div>
      {editing
        ? <textarea className="ix-composer-text" rows={3} value={cap} onChange={(e) => setCap(e.target.value)} />
        : <p className="ct-cap">{cap}</p>}
      <div className="ct-by"><Icon name="sparkle" size={10} /> {d.by}</div>
      <div className="ct-actions">
        {editing ? (
          <button className="btn btn-primary btn-sm" onClick={() => setEditing(false)}>Save caption</button>
        ) : state === "draft" ? (
          <>
            <button className="btn btn-primary btn-sm" onClick={() => onApprove(d)}>Approve &amp; schedule</button>
            <button className="btn btn-sm" onClick={() => setEditing(true)}><Icon name="edit" size={11} /> Edit</button>
            <button className="btn btn-ghost btn-sm" onClick={() => onSkip(d)}>Skip</button>
          </>
        ) : state === "scheduled" ? (
          <span className="ct-done-note">Chat Agent posts it and handles the DMs.</span>
        ) : (
          <button className="btn btn-ghost btn-sm" onClick={() => onRestore(d)}>Restore</button>
        )}
      </div>
    </article>
  );
};

const CT_STATS = { fromContent: 620, bookingsViaDM: 4 };   // seed · attributed revenue

const ContentPage = () => {
  const [states, setStates] = React.useState({}); // draftId -> "scheduled" | "skipped"
  const [toastNode, ppFlash] = window.usePPToast();
  const [, setTick] = React.useState(0);

  // The collab hold follows the partnership decision live
  React.useEffect(() => {
    const bump = () => setTick(n => n + 1);
    window.addEventListener("inbox:decisions", bump);
    return () => window.removeEventListener("inbox:decisions", bump);
  }, []);
  const collabDec = (() => {
    const rec = window.IX_STORE && window.IX_STORE.get("th-wellness-partnership");
    return rec && rec.kind === "decided" ? rec : null;
  })();

  const flash = (msg, undo = null) => ppFlash({ msg, undo });

  const stateOf = (id) => states[id] || "draft";
  const setDraftState = (id, next, prev) => setStates(s => {
    const n = { ...s };
    if (next === "draft") delete n[id]; else n[id] = next;
    return n;
  });

  const approve = (d) => {
    setDraftState(d.id, "scheduled");
    flash(
      <><b>{d.title}</b> scheduled for {d.slot.toLowerCase()} — Chat Agent posts and handles the DMs</>,
      () => setDraftState(d.id, "draft")
    );
  };
  const skip = (d) => {
    setDraftState(d.id, "skipped");
    flash(
      <><b>{d.title}</b> skipped — Chat Agent won't resurface this angle</>,
      () => setDraftState(d.id, "draft")
    );
  };
  const restore = (d) => setDraftState(d.id, "draft");

  const awaiting = CT_DRAFTS.filter(d => stateOf(d.id) === "draft").length;
  const publishedBase = 4;
  const scheduledCount = CT_DRAFTS.filter(d => stateOf(d.id) === "scheduled").length;

  return (
  <div className="ct-page">
    <header className="ct-head">
      <div>
        <h2 className="ct-h2">Content</h2>
        <p className="ct-sub">Chat Agent drafts from what's actually happening — reviews, demand, launches. Nothing posts without you.</p>
      </div>
    </header>

    <StatStrip>
      <StatCell
        label="This week"
        value={publishedBase + CT_DRAFTS.length}
        meta={`${publishedBase} published${scheduledCount > 0 ? ` · ${scheduledCount} scheduled` : ""}${awaiting > 0 ? ` · ${awaiting} awaiting you` : " · queue clear"}`}
      />
      <StatCell label="Engagement" tip="Likes + poll votes across this week's posts" value={CT_WEEK.flatMap(d => d.posts).reduce((s, p) => { const m = (p.stats || "").match(/(\d+) (?:likes|votes)/); return s + (m ? +m[1] : 0); }, 0)} meta="likes + votes · ↑ 22% wk" />
      <StatCell label="From content" tip="Revenue from bookings that started in a content DM · this week" value={`+$${CT_STATS.fromContent}`} meta={`${CT_STATS.bookingsViaDM} bookings via DM`} accent />
    </StatStrip>

    <section className="ct-section">
      <div className="ct-sec-head">
        <span className="ct-sec-title">Awaiting your voice</span>
        <span className="ct-sec-meta">{awaiting === 0 ? "all handled" : `${awaiting} draft${awaiting === 1 ? "" : "s"}`}</span>
      </div>
      <div className="ct-drafts">
        {CT_DRAFTS.map((d) => (
          <ContentDraftCard key={d.id} d={d} state={stateOf(d.id)} onApprove={approve} onSkip={skip} onRestore={restore} />
        ))}
      </div>
    </section>

    <section className="ct-section">
      <div className="ct-sec-head">
        <span className="ct-sec-title">This week</span>
        <span className="ct-sec-meta">Apr 20 – 26 · @serenityspa</span>
      </div>
      <div className="ct-week-wrap">
        <div className="ct-week">
          {CT_WEEK.map((day) => (
            <div key={day.d} className={"ct-day" + (day.today ? " today" : "")}>
              <div className="ct-day-head">
                <span className="ct-day-dow">{day.dow}</span>
                <span className="ct-day-num tabular">{day.d}</span>
                {day.today && <span className="ct-day-today">Today</span>}
              </div>
              {day.posts.length === 0 && <button className="ct-ghost" onClick={() => window.askAbout({ mode: "compose", prompt: "Draft an IG post about " })}>+ Draft</button>}
              {day.posts.map((p, i) => {
                // Draft-linked minis follow the card state; the collab mini follows the Inbox decision
                if (p.draftId) {
                  const st = stateOf(p.draftId);
                  return (
                    <div key={i} className={"ct-mini" + (st === "scheduled" ? " sched" : st === "skipped" ? "" : " held")}>
                      <div className="ct-mini-top">
                        <span className={"ct-mini-dot " + p.platform} />
                        <span className="ct-mini-time mono">{p.t}</span>
                      </div>
                      <div className="ct-mini-title">{p.title}</div>
                      {st === "scheduled" && <div className="ct-mini-stats sched">Scheduled — posts at 5:00pm</div>}
                      {st === "skipped" && <div className="ct-mini-stats">Skipped</div>}
                      {st === "draft" && <div className="ct-mini-stats held">Awaiting your approval</div>}
                    </div>
                  );
                }
                if (p.collab) {
                  return (
                    <button
                      key={i}
                      className={"ct-mini ct-mini-link" + (collabDec && !collabDec.declined ? " sched" : " held")}
                      title={collabDec ? "Open the thread" : "Decide the partnership in your Inbox"}
                      onClick={() => window.CHANLY.nav(window.CHANLY.R.thread("th-wellness-partnership"))}
                    >
                      <div className="ct-mini-top">
                        <span className={"ct-mini-dot " + p.platform} />
                        <span className="ct-mini-time mono">{p.t}</span>
                      </div>
                      <div className="ct-mini-title">{p.title}</div>
                      {collabDec
                        ? <div className={"ct-mini-stats " + (collabDec.declined ? "" : "sched")}>{collabDec.declined ? "Declined — slot freed" : `Partnership “${collabDec.action}” ✓ — Chat Agent drafting the collab`}</div>
                        : <div className="ct-mini-stats held">Held — decide in Inbox</div>}
                    </button>
                  );
                }
                return (
                  <div key={i} className="ct-mini">
                    <div className="ct-mini-top">
                      <span className={"ct-mini-dot " + p.platform} />
                      <span className="ct-mini-time mono">{p.t}</span>
                    </div>
                    <div className="ct-mini-title">{p.title}</div>
                    {p.stats && <div className="ct-mini-stats">{p.stats}</div>}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="ct-week-foot">
        <Icon name="instagram" size={11} /> The held slot ties to the{" "}
        <button className="lm-link" onClick={() => window.CHANLY.nav(window.CHANLY.R.thread("th-wellness-partnership"))}>@thewellness.co decision</button>{" "}
        in your Inbox — approve the partnership and Chat Agent drafts the collab post.
      </div>
    </section>

    {toastNode}
  </div>
  );
};

window.ContentPage = ContentPage;
