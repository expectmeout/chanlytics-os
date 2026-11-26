/**
 * A custom property in a `style` prop (`style={{ "--fill": "40%" }}`): a value the page's stylesheet reads with var(), the
 * one kind of inline value a class cannot hold (a share, a count, a colour of a row's own). React passes it through as
 * the browser takes it; React's own CSSProperties names only the standard properties, so each place told the checker
 * `as CSSProperties`. Declared here once instead.
 */
import "react";

declare module "react" {
  interface CSSProperties {
    [property: `--${string}`]: string | number | undefined;
  }
}
