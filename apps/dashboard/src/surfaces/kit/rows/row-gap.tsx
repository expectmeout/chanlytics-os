/**
 * The room of the rows a long list did not draw (shown-rows.ts), as an empty element of the list's own kind: a table's
 * row across its `span` columns, or a box. Hidden from a screen reader; its height is set on the element as it is drawn,
 * never a style prop (the inline-styles measure). `className` is the list's own word for such a row (a table's `pl-foot`).
 */
export function RowGap({ height, span, className }: { height: number; span?: number; className?: string }) {
  const sized = (el: HTMLElement | null) => {
    if (el) el.style.height = `${Math.round(height)}px`;
  };
  return span ? (
    <tr ref={sized} className={className} aria-hidden="true">
      <td colSpan={span} />
    </tr>
  ) : (
    <div ref={sized} className={className} aria-hidden="true" />
  );
}
