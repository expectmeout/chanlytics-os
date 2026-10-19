import { REPORT_CHANNELS, dayPointOf } from "./reports.js";
import { REPORT_MIN_N, shareSaid } from "./report-tiles.js";
import { templateTitle } from "../templates/template-titles.js";
import { pct, sumOf } from "../shared/numbers.js";
import { formatterOnUse } from "../shared/time.js";
const CAMPAIGN_CHANNELS = REPORT_CHANNELS.filter(
  (c) => c.key !== "voice"
);
const WHEN = formatterOnUse([], { month: "short", day: "numeric" });
export const campaignPriorHadAny = (before) => before.sent + before.optIns + before.optOuts > 0;
function campaignChannelsOf(rows) {
  return (rows ?? []).flatMap((r) => {
    const known = CAMPAIGN_CHANNELS.find((c) => c.key === r.channel);
    if (!known || !(r.sent > 0)) return [];
    const whatsapp = known.key === "whatsapp";
    const deliveredPct = pct(r.delivered, r.sent);
    return [
      {
        channel: known.key,
        label: known.label,
        sent: r.sent,
        delivered: r.delivered,
        deliveredPct,
        read: whatsapp ? r.read : null,
        readPct: whatsapp ? pct(r.read, r.sent) : null,
        replied: r.replied,
        repliedPct: pct(r.replied, r.sent),
        display: `${r.sent} \xB7 ${shareSaid(deliveredPct, r.delivered, r.sent) ?? "\u2014"} delivered`
      }
    ];
  });
}
function columnWords(d) {
  return {
    sentWords: `${dayPointOf(d.day).label}: ${d.sent} sent`,
    answeredWords: d.replied > 0 ? `${d.replied} answered` : null
  };
}
function sourceWords(s) {
  const delivered = shareSaid(pct(s.delivered, s.sent), s.delivered, s.sent);
  const replied = shareSaid(pct(s.replied, s.sent), s.replied, s.sent);
  return {
    deliveredWords: delivered ?? "\u2014",
    repliedWords: replied === null ? "\u2014" : s.sent >= REPORT_MIN_N ? `${replied} (${s.replied})` : replied
  };
}
function channelsLine(channels) {
  if (channels.length < 2) return null;
  const whatsapp = channels.find((c) => c.channel === "whatsapp");
  return whatsapp ? `Read receipts are WhatsApp's alone: ${whatsapp.read} of its ${whatsapp.sent} were read.` : "A text or an email keeps no read receipt.";
}
export function toCampaignReportVM(dto) {
  const days = dto.days;
  const series = dto.series ?? [];
  const current = series.slice(-days);
  const previous = series.slice(0, Math.max(0, series.length - days));
  const points = current.map((d) => ({
    ...dayPointOf(d.day),
    sent: d.sent,
    delivered: d.delivered,
    replied: d.replied,
    optIns: d.opt_ins,
    optOuts: d.opt_outs,
    ...columnWords(d)
  }));
  const tot = {
    sent: sumOf(current.map((d) => d.sent)),
    delivered: sumOf(current.map((d) => d.delivered)),
    read: sumOf(current.map((d) => d.read)),
    replied: sumOf(current.map((d) => d.replied)),
    optIns: sumOf(current.map((d) => d.opt_ins)),
    optOuts: sumOf(current.map((d) => d.opt_outs))
  };
  const prev = {
    sent: sumOf(previous.map((d) => d.sent)),
    delivered: sumOf(previous.map((d) => d.delivered)),
    replied: sumOf(previous.map((d) => d.replied)),
    optIns: sumOf(previous.map((d) => d.opt_ins)),
    optOuts: sumOf(previous.map((d) => d.opt_outs))
  };
  const channels = campaignChannelsOf(dto.by_channel);
  const whatsapp = channels.find((c) => c.channel === "whatsapp");
  const read = dto.by_channel ? whatsapp?.read ?? 0 : tot.read;
  const readOf = dto.by_channel ? whatsapp?.sent ?? 0 : tot.sent;
  const rawSources = dto.sources ?? [];
  const sends = sumOf(rawSources.map((s) => s.runs));
  const sources = rawSources.map((s) => ({
    id: s.id,
    kind: s.kind,
    kindLabel: s.kind === "playbook" ? "Campaign" : "Sent once",
    name: s.name,
    templateName: s.template_name,
    template: s.template_name ? templateTitle(s.template_name) : "",
    runs: s.runs,
    sent: s.sent,
    delivered: s.delivered,
    read: s.read,
    replied: s.replied,
    deliveredPct: pct(s.delivered, s.sent),
    repliedPct: pct(s.replied, s.sent),
    ...sourceWords(s),
    lastLabel: s.last_at ? WHEN.format(new Date(s.last_at)) : ""
  }));
  return {
    days,
    points,
    totals: { ...tot, read, readOf, sends },
    before: prev,
    sources,
    empty: tot.sent === 0 && tot.optIns === 0 && tot.optOuts === 0,
    table: {
      columns: ["Day", "Sent", "Delivered", "Answered", "Said yes", "Asked to stop"],
      rows: points.map((p) => [p.label, p.sent, p.delivered, p.replied, p.optIns, p.optOuts])
    },
    channels,
    channelTable: {
      columns: ["Channel", "Sent", "Delivered", "Read", "Answered"],
      rows: channels.map((c) => [c.label, c.sent, c.delivered, c.read, c.replied])
    },
    lines: {
      sent: sends ? sends === 1 ? "From one run." : `From ${sends} runs.` : null,
      channels: channelsLine(channels)
    }
  };
}
