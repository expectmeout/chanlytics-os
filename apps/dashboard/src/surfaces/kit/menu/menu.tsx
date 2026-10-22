/**
 * The kit's menu (kit.css, "MoreMenu"; docs/plans/2026-09-28-the-interface-kit-and-its-looks.md, §3.4 and step 2.5):
 * the one action menu, opened by a control of the page's (the kit's Button): its items in groups, a line between
 * two groups and a group's heading over it; an item's glyph, its words, a second line or a word at its end; the act
 * that destroys in red; an item that opens a page of its own a link (the shell's "a door is a link"); an item a role
 * refuses (the honesty gate, `gate`), which stays in the menu, says why when pressed and leaves it open; and a set the
 * page chooses one of, the tick beside the one chosen. A second line that is a sentence stands under its item's words;
 * a set whose options say a line under their words (a template's sentence) draws each as two lines, the one chosen in
 * the pick's lilac; and a menu may show its name at its top (`head`), on a phone the sheet's head with the one Close.
 *
 * Its behaviour is Base UI's Menu (`@base-ui/react/menu`, the plan's decision 15): the arrows walk the items and
 * typing a word's first letters finds one; Enter and Space act; Escape and a press outside close it and give focus
 * back to its control; the page behind holds still while it is open. It hangs under its control from the edge
 * `align` names, and turns over it where the window has no room below, placed by Base UI against the window in a
 * portal on the document's body, where no pane can cut it off or hold it under a blur. The kit writes none of it.
 * Under 900px it is the phone's action sheet: the same menu, from the bottom edge over the page (kit.css), on a layer
 * that a press outside closes it through, and a pull down from its top lets it go, following the finger, as the Sheet's
 * does (kit/motion/swipe.ts touchSwipe; Ruben, 8 October 2026: it drew the sheet's handle and did not answer a pull). The touch
 * stays the menu's own (legacy-verbs keepTouch): opened from inside a sheet or an open thread, its pull moved that too.
 *
 * It draws what the gallery's Menu family draws (tooling/scripts/e2e-harness/kit-gallery.mjs), which
 * e2e/kit/kit-behaves.spec.ts holds to it in a browser. `className` is for the page's layout, and comes last; the
 * ref reaches the menu.
 */
import { Menu as BaseMenu } from "@base-ui/react/menu";
import type { ReactElement, ReactNode, Ref } from "react";
import { Fragment, useState } from "react";
import { keepTouch, onAPhone, touchSwipe } from "../../legacy-verbs";
import { CopiedWords, useCopied } from "../copy-button/copy-button";
import { cx, variants } from "../variants";
import { longWords } from "./long-words";

/** The room between the control and the menu, as the house's menu leaves it (kit.css, .more-menu's top). */
const MENU_GAP_PX = 8;

const menuClasses = variants({
  base: "more-menu",
  variants: { align: { start: "align-left", end: "align-right" } },
  defaults: { align: "end" },
});
/** An item's classes: red where it destroys; its sentence under its words (`two`), or an option's two lines (`lines`). */
const itemClasses = variants({
  base: "more-item",
  variants: { tone: { danger: "danger" }, shape: { two: "more-item-two", lines: "more-item-lines" } },
});
/** An item whose second line is a sentence says it under its words, where beside them it squeezed them to nothing. */
const itemShape = (meta: ReactNode) => (longWords(meta) ? "two" : undefined);

/** What an item says: its words, which typing finds, a glyph before them, and a second line or a word at its end. */
type MenuWords = { label: string; glyph?: ReactElement; meta?: ReactNode; hint?: ReactNode };

/**
 * What an item says on hover (`title`), and the honesty gate's props where a role may not press it (`gate`:
 * window.gate(...)'s, spread after the item's act). A refused item stays in the menu and keeps it open.
 */
type MenuGate = { title?: string; gate?: Record<string, unknown> };

/** An item: words that act where they stand, red where the act destroys, or a door to a page of its own. */
export type MenuItem = MenuWords &
  MenuGate &
  (
    | { onSelect: () => void; tone?: "danger"; disabled?: boolean; href?: undefined; copy?: undefined }
    | { href: string; onSelect?: undefined; tone?: undefined; disabled?: undefined; copy?: undefined }
    | {
        /** A copy: the words it puts on the clipboard, and what it says in place once it has (the menu stays open). */
        copy: { text: string; said: string };
        onSelect?: undefined;
        href?: undefined;
        tone?: undefined;
        disabled?: undefined;
      }
  );

/**
 * A set the page chooses one of: the one chosen, the options, and the tick drawn beside the one chosen. An option may say a
 * word at its end, as an item's `hint` does (how many a view holds: Pipeline's views, Sequences').
 */
export type MenuChoice = {
  value: string;
  onChoose: (value: string) => void;
  /** The tick (the Icon's `check`, at 13px): drawn on every option, and seen beside the one chosen (kit.css). */
  tick: ReactElement;
  options: readonly MenuOption[];
};

/**
 * An option of a set: its value, its words, a word after them, and a line under them (`sub`: what it says, a template's
 * sentence). A set where an option has a line draws each as two lines, each cut where it runs long, its word beside its
 * name, the tick at its end, and the one chosen the pick's lilac (kit.css, "A set whose options say a line").
 */
export type MenuOption = { value: string; label: string; hint?: ReactNode; sub?: ReactNode };

/**
 * A set of switches the menu stays open over while each is flipped (a table's columns): each ticked while it is on. One
 * the page keeps on (`locked`, the word said in place of a flip: "Always") is drawn on, and refuses a press.
 */
export type MenuToggles = {
  items: readonly { value: string; label: string; on: boolean; locked?: string }[];
  onToggle: (value: string) => void;
  /** The tick (the Icon's `check`, at 13px): drawn on every switch, and seen beside each one that is on (kit.css). */
  tick: ReactElement;
  /**
   * A few short words (what a board shows): on a phone, chips on a line, each lit while it is on, where a row each made
   * the menu three things at once (Ruben, 14 Oct 2026, the fitted sheets); rows on a desk, as any switches are.
   */
  chips?: boolean;
};

/**
 * A group of the menu: its items, a set to choose from, or a set of switches, under a heading or none, and a line under
 * its items where one thing is said of them all (`caption`: why the sends are off). A line parts two groups. A few acts
 * that are one kind (`tiles`: the ways to reach a person) stand on one line on a phone, a glyph over its word each, as a
 * phone's share sheet sets them: eleven rows were a person's More (Ruben, 14 Oct 2026, the fitted sheets); rows on a desk.
 */
export type MenuGroup = { header?: string; caption?: string; tiles?: boolean } & (
  | { items: readonly MenuItem[]; choose?: undefined; toggles?: undefined }
  | { choose: MenuChoice; items?: undefined; toggles?: undefined }
  | { toggles: MenuToggles; items?: undefined; choose?: undefined }
);

/**
 * A menu's name drawn at its top (the Inbox's template picker: "Reopen the chat with Fern"): on a desk a quiet line; on a
 * phone the sheet's one head, the name as a kicker's and the kit's one Close, where every sheet's stands (kit.css, "One
 * Close for every sheet"). The Close is the page's glyph (the Icon's `x`, at 13px); a screen reader is told the name as
 * the menu's, and closes it with Escape.
 */
export type MenuHead = { title: string; close: ReactElement };

/** A menu: what opens it, its groups, the edge it hangs from, and its name where its control's words are not. */
export type MenuProps = {
  /** The page's control that opens it: the kit's Button, which it is drawn as. */
  trigger: ReactElement;
  groups: readonly MenuGroup[];
  align?: "start" | "end";
  /** Its name to a screen reader, where its control's words do not say it (a glyph alone names the control). */
  label?: string;
  /** Its name drawn at its top, and on a phone its Close: the sheet's head. */
  head?: MenuHead;
  className?: string;
  ref?: Ref<HTMLDivElement>;
};

/** What an item holds, in the house's order: its glyph, its words, its second line, its word at the end. */
function itemContent({ label, glyph, meta, hint }: MenuWords) {
  return (
    <>
      {glyph}
      <span className="more-item-label">{label}</span>
      {meta ? <span className="more-item-meta">{meta}</span> : null}
      {hint ? <span className="more-item-hint">{hint}</span> : null}
    </>
  );
}

/**
 * A copy: the clipboard written and "Copied" said in its place (the kit's copy, ../copy-button), the menu left open to
 * say it, as the canvas's copy rows do; a press outside or Escape closes it.
 */
function CopyItem({ item, copy }: { item: MenuItem; copy: { text: string; said: string } }) {
  const [copied, press] = useCopied();
  return (
    <BaseMenu.Item
      className={itemClasses()}
      nativeButton
      render={<button type="button" />}
      label={item.label}
      title={item.title}
      closeOnClick={false}
      data-copied={copied || undefined}
      onClick={() => press(copy.text)}
      {...item.gate}
    >
      {item.glyph}
      <span className="more-item-label" aria-live="polite">
        {copied ? <CopiedWords said={copy.said} /> : item.label}
      </span>
    </BaseMenu.Item>
  );
}

/** One item: a button that acts, a copy, or a link to a page. */
function Item({ item }: { item: MenuItem }) {
  if (item.copy !== undefined) return <CopyItem item={item} copy={item.copy} />;
  if (item.href !== undefined) {
    return (
      <BaseMenu.LinkItem className={itemClasses({ shape: itemShape(item.meta) })} href={item.href} label={item.label}>
        {itemContent(item)}
      </BaseMenu.LinkItem>
    );
  }
  const act = item.onSelect;
  // A refused item is pressed, so that it can say why: it is not `disabled`, which no press reaches, and the menu stays.
  const refused = item.gate?.["aria-disabled"] === true || item.gate?.["aria-disabled"] === "true";
  return (
    <BaseMenu.Item
      className={itemClasses({ tone: item.tone, shape: itemShape(item.meta) })}
      nativeButton
      render={<button type="button" />}
      label={item.label}
      title={item.title}
      disabled={item.disabled}
      closeOnClick={!refused}
      onClick={() => act()}
      {...item.gate}
    >
      {itemContent(item)}
    </BaseMenu.Item>
  );
}

/** Whether a set's options say a line under their words, which draws each as two lines. */
const saysLines = (choose: MenuChoice) => choose.options.some((option) => option.sub !== undefined);

/** An option of two lines: its name and its word on the first, what it says under them, the tick at its end. */
function optionLines(option: MenuOption, tick: ReactElement) {
  return (
    <>
      <span className="more-item-words">
        <span className="more-item-line">
          <span className="more-item-label">{option.label}</span>
          {option.hint ? <span className="more-item-hint">{option.hint}</span> : null}
        </span>
        {option.sub !== undefined ? <span className="more-item-sub">{option.sub}</span> : null}
      </span>
      {tick}
    </>
  );
}

/** A set to choose one of: a radio item each, which closes the menu as it is chosen, as any item does. */
function Choice({ choose }: { choose: MenuChoice }) {
  const lines = saysLines(choose);
  return (
    <BaseMenu.RadioGroup value={choose.value} onValueChange={(value: string) => choose.onChoose(value)}>
      {choose.options.map((option) => (
        <BaseMenu.RadioItem
          key={option.value}
          value={option.value}
          className={itemClasses({ shape: lines ? "lines" : undefined })}
          nativeButton
          render={<button type="button" />}
          label={option.label}
          closeOnClick
        >
          {lines
            ? optionLines(option, choose.tick)
            : itemContent({ label: option.label, glyph: choose.tick, hint: option.hint })}
        </BaseMenu.RadioItem>
      ))}
    </BaseMenu.RadioGroup>
  );
}

/**
 * A set of switches: a checkbox item each, which flips as it is pressed and leaves the menu open, so the next can be
 * flipped; a locked one is disabled, drawn on, its word at its end.
 */
function Toggles({ toggles }: { toggles: MenuToggles }) {
  const items = toggles.items.map((t) => (
    <BaseMenu.CheckboxItem
      key={t.value}
      className={itemClasses()}
      nativeButton
      render={<button type="button" />}
      label={t.label}
      checked={t.on}
      disabled={t.locked !== undefined}
      closeOnClick={false}
      onCheckedChange={() => toggles.onToggle(t.value)}
    >
      {itemContent({ label: t.label, glyph: toggles.tick, meta: t.locked })}
    </BaseMenu.CheckboxItem>
  ));
  return toggles.chips ? <div className="more-chips">{items}</div> : <>{items}</>;
}

/** A group: its heading, which names it, over its items, its set, or its switches, and its caption under them. */
function Group({ group }: { group: MenuGroup }) {
  const items = group.toggles ? (
    <Toggles toggles={group.toggles} />
  ) : group.choose ? (
    <Choice choose={group.choose} />
  ) : group.tiles ? (
    <div className="more-tiles">
      {group.items.map((item, at) => (
        <Item key={at} item={item} />
      ))}
    </div>
  ) : (
    group.items.map((item, at) => <Item key={at} item={item} />)
  );
  const body = group.caption ? (
    <>
      {items}
      <p className="more-cap">{group.caption}</p>
    </>
  ) : (
    items
  );
  if (group.header === undefined) return <>{body}</>;
  return (
    <BaseMenu.Group>
      <BaseMenu.GroupLabel className="more-header">{group.header}</BaseMenu.GroupLabel>
      {body}
    </BaseMenu.Group>
  );
}

/**
 * The menu's name at its top and its Close (`head`). Its words are the menu's name to a screen reader already, and Escape
 * closes it there, so the head is drawn for the eye and the finger alone: out of the menu's items and out of a key's
 * walk through them.
 */
function Head({ head, onClose }: { head: MenuHead; onClose: () => void }) {
  return (
    <div className="more-head" aria-hidden="true">
      <p className="more-head-title">{head.title}</p>
      <button type="button" tabIndex={-1} className="rec-sheet-close" onClick={onClose}>
        {head.close}
      </button>
    </div>
  );
}

/**
 * What a menu draws on the body: its wash, its place by its control, its head and its groups. `onClose` closes it, for a
 * phone's pull and its head's Close.
 */
function MenuPopup({
  groups,
  align = "end",
  label,
  head,
  className,
  ref,
  onClose,
}: Omit<MenuProps, "trigger"> & { onClose: () => void }) {
  // A set of two-line options is wider on a desk, so the line under each name can be read (kit.css .more-menu-lines).
  const lines = groups.some((group) => group.choose !== undefined && saysLines(group.choose));
  return (
    <BaseMenu.Portal>
      <BaseMenu.Backdrop className="more-backdrop" />
      <BaseMenu.Positioner className="pop-place" sideOffset={MENU_GAP_PX} align={align}>
        <BaseMenu.Popup
          ref={ref}
          className={cx(menuClasses({ align }), lines && "more-menu-lines", head && "more-menu-titled", className)}
          aria-label={label ?? head?.title}
          {...keepTouch(touchSwipe({ onDown: onClose, when: onAPhone }))}
        >
          {head ? <Head head={head} onClose={onClose} /> : null}
          {groups.map((group, at) => (
            <Fragment key={at}>
              {at > 0 ? <BaseMenu.Separator className="more-divider" /> : null}
              <Group group={group} />
            </Fragment>
          ))}
        </BaseMenu.Popup>
      </BaseMenu.Positioner>
    </BaseMenu.Portal>
  );
}

/** A menu, opened by the page's control and drawn on the document's body. */
export function Menu({ trigger, ...popup }: MenuProps) {
  // Open is Base UI's to decide; it is held here only so a phone's pull can close the menu.
  const [open, setOpen] = useState(false);
  return (
    <BaseMenu.Root open={open} onOpenChange={(next) => setOpen(next)}>
      <BaseMenu.Trigger render={trigger} />
      <MenuPopup {...popup} onClose={() => setOpen(false)} />
    </BaseMenu.Root>
  );
}

/** What ties a shared menu to its controls (Base UI's handle): made once where the menu is drawn. */
export type MenuHandle<P> = BaseMenu.Handle<P>;
export const menuHandle = <P,>(): MenuHandle<P> => BaseMenu.createHandle<P>();

/**
 * One of many controls that open one menu, each with what it is about (`payload`): a row's Call. A row draws its
 * control alone and the table draws the menu once (SharedMenu), so two hundred rows mount one menu and not two hundred
 * (a switch to Leads at 200 rows spent 159 ms at 4x CPU mounting a menu on every row, 5 Oct 2026). It behaves as a
 * Menu's control does: it opens the menu under itself, and gets focus back as it closes.
 */
export function MenuTrigger<P>({
  handle,
  payload,
  trigger,
}: {
  handle: MenuHandle<P>;
  payload: P;
  trigger: ReactElement;
}) {
  return <BaseMenu.Trigger handle={handle} payload={payload} render={trigger} />;
}

/** The menu its controls share: its groups and its name for the payload of the control that opened it. */
export type SharedMenuProps<P> = Omit<MenuProps, "trigger" | "groups" | "label"> & {
  handle: MenuHandle<P>;
  groups: (payload: P) => readonly MenuGroup[];
  label?: (payload: P) => string;
};

/** A menu drawn once for the controls that share it (MenuTrigger), its items those of the one that opened it. */
export function SharedMenu<P>({ handle, groups, label, ...popup }: SharedMenuProps<P>) {
  return (
    <BaseMenu.Root handle={handle}>
      {({ payload }: { payload: P | undefined }) =>
        payload === undefined ? null : (
          <MenuPopup {...popup} groups={groups(payload)} label={label?.(payload)} onClose={() => handle.close()} />
        )
      }
    </BaseMenu.Root>
  );
}
