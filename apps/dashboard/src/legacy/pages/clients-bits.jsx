/* global React, Icon, CLIENTS, CLIENT_BUCKETS, CLIENT_SEGMENTS, CLIENTS_AGGREGATES */
// Chanlytics — Clients shared bits

const ChannelGlyph = ({ kind, primary = false, size = 12 }) => {
  const map = { phone: "phone", sms: "chat", email: "mail", instagram: "instagram", chat: "chat" };
  const name = map[kind] || "chat";
  return (
    <span className={`cl-row-channel${primary ? " cl-row-channel-primary" : ""}`}>
      <Icon name={name} size={size} />
    </span>
  );
};

const TempBar = ({ value = 0.5, sizeClass = "" }) => (
  <div className={`cl-temp-bar ${sizeClass}`}>
    <div className={`cl-temp-pin ${sizeClass}`} style={{ left: `${Math.round(value * 100)}%` }} />
  </div>
);

const ClientTag = ({ children, signal = false }) => (
  <span className={`cl-tag${signal ? " signal" : ""}`}>{children}</span>
);

const AgentChip = ({ activity, compact = false }) => {
  if (!activity) return <span style={{ fontSize: 11, color: "var(--ink-faint)" }}>—</span>;
  const cls = activity.status === "approval" ? "approval"
    : activity.status === "escalated" ? "escalated"
    : "";
  const showLive = activity.status === "in-flight" || activity.status === "approval";
  return (
    <span className={`cl-row-agent ${cls}`}>
      <span className="agent-avatar">{activity.glyph}</span>
      {showLive && <span className="live-dot" />}
      <span className="cl-row-agent-verb">{compact ? activity.agent : activity.verb}</span>
    </span>
  );
};

const BucketPill = ({ bucket }) => {
  const labels = { "needs-you": "Needs you", "drifting": "Drifting", "champion": "Champion", "new": "New", "steady": "Steady" };
  return <span className={`cl-row-bucket-pill b-${bucket}`}>{labels[bucket]}</span>;
};

window.ChannelGlyph = ChannelGlyph;
window.TempBar = TempBar;
window.ClientTag = ClientTag;
window.AgentChip = AgentChip;
window.BucketPill = BucketPill;
