/** A count as Health says one: "1,204". */
export const healthCount = (v: number) => v.toLocaleString("en-US");

/** A moment as Health's rows say one, in UTC: "21 Oct, 13:19". */
export const utcWords = (ms: number) =>
  new Date(ms).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });

/** One line of a Health part: what it is, and what it says in the tone it is said in (`warn`, `danger`, or plain). */
export function HealthLine({
  label,
  hint,
  tone,
  testid,
}: {
  label: string;
  hint: string;
  tone?: string;
  testid?: string;
}) {
  return (
    <div className="set-row" data-testid={testid}>
      <div className="set-row-info">
        <span className="set-row-label">{label}</span>
        <span className="set-row-hint" data-tone={tone}>
          {hint}
        </span>
      </div>
    </div>
  );
}
