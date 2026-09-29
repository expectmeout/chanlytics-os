/**
 * The kit's two class helpers (docs/plans/2026-09-28-the-interface-kit-and-its-looks.md, §3.4). A component renders
 * the kit's classes, so a legacy page that writes them by hand and a surface that draws the component draw the same
 * markup: `cx` joins a component's classes, and `variants` maps its props to them, the part of shadcn's
 * class-variance-authority the kit needs, with no dependency.
 */

/** A class name, or what a condition leaves where it has none (`open && "is-open"`). */
type ClassName = string | false | null | undefined;

/** For each prop of a component, the class each of its values draws; "" where a value draws none of its own. */
type Variants = Record<string, Record<string, string>>;

/** The props a component's variants take: one of each prop's values, or nothing for its default. */
type VariantProps<V extends Variants> = { [P in keyof V]?: keyof V[P] & string };

/** The class names, in order, joined by a space; false, null, undefined and "" add nothing. */
export function cx(...names: ClassName[]): string {
  return names.filter(Boolean).join(" ");
}

/** What a record holds under `key` itself, never what every object inherits there (`constructor`, `toString`). */
function own<T>(record: Partial<Record<string, T>>, key: string): T | undefined {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}

/**
 * A component's classes from its props: the base class, then each prop's class in the order `variants` names the
 * props, a prop not given (or given as undefined) taking its default. A value its map does not name adds nothing.
 */
export function variants<V extends Variants>(spec: { base: string; variants: V; defaults?: VariantProps<V> }) {
  return (props: VariantProps<V> = {}): string => {
    const given: Partial<Record<string, string>> = props;
    const fallback: Partial<Record<string, string>> = spec.defaults ?? {};
    return cx(
      spec.base,
      ...Object.entries(spec.variants).map(([prop, classes]) => {
        const value = own(given, prop) ?? own(fallback, prop);
        return value === undefined ? undefined : own(classes, value);
      }),
    );
  };
}
