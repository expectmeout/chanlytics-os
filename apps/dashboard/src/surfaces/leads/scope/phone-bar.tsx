/**
 * The phone's top (<=900px, the band People's own rows begin at), Leads' way (moved from legacy/pages/leads-scope.jsx,
 * decision 0015): People's bar (PeoplePhoneBar), the scopes as the Inbox's tab strip over the bar: lists, search, and Find
 * leads as the three's still mark. Find leads is Ask (spec F1): at a phone's width the shell's ✦ is its one door and the
 * mark gives way (leads.css); from 721px to 900px the controls row is gone and the shell draws no ✦, so the mark is the
 * page's one door. The same top on every scope, and nothing else sits above the rows -- no title, no sub-headline, no
 * stat cards and no second control row (legacy/CLAUDE.md, the phone shows the work first).
 * A search's reach-out (Reach out Part 4 PR 6) is an accent word under its counts on a phone (scope.tsx), not here.
 */
import type { ReactNode, RefObject } from "react";
import { Button } from "../../kit/button/button";
import { ActWords } from "../../kit/head/act-words";
import { Menu } from "../../kit/menu/menu";
import { menuGroups, type PeopleMenuItem } from "../../people/menu-groups";
import { Icon } from "../../kit/icon/icon";
import { gate } from "../../legacy-verbs";
import { Sheet, type SheetBack } from "../../kit/sheet/sheet";
import { JOB_CANCEL } from "../../people/sheets/phone-sheet";
import { BarWord, PeoplePhoneBar, SELECT_WORDS } from "../../people/rail/phone-bar";

interface LeadsPhoneBarProps {
  listLabel?: ReactNode;
  listCount?: number | string | null;
  onLists?: (() => void) | null;
  listsOpen?: boolean;
  q: string;
  onQ: (q: string) => void;
  searchRef: RefObject<HTMLInputElement | null> | null;
  searchOpen?: boolean;
  onSearchOpen?: (open: boolean) => void;
  onFind?: () => void;
  canFind?: boolean;
  mapOn?: boolean;
  onMap?: (on: boolean) => void;
  canMap?: boolean;
  onImport?: () => void;
  /** While a selection is on, how many: it stands where the list's name does. */
  title?: ReactNode;
  /** Select's word now and what it does, or none where nobody may act on a selection or nothing is shown. */
  select?: { word: string; press: () => void } | null;
  sortItems?: readonly PeopleMenuItem[];
}

/**
 * The bar's words, as People's Select, Sort and Export stand (Ruben, 10 Oct 2026): Select walks a selection (Select, Select
 * all, Cancel), Sort opens the sorts a desk's headings give, Import brings a list in, and Map shows the places. The map
 * (Ruben, 25 Sep): the desktop's toggle stood in the controls row, which a phone never draws, so the streets had no door
 * here; a lone push-pin said neither which view this was nor what it would open (it read as a hammer), and the capsule of
 * two circles after it stood too heavy beside the page's coral act. One word says the view it opens, List from the map,
 * so the row keeps room for the list's name beside four words. Drawn only where the rows have places.
 */
function barWords(o: {
  select: { word: string; press: () => void } | null;
  sortItems: readonly PeopleMenuItem[];
  onImport: () => void;
  canMap: boolean;
  mapOn: boolean;
  onMap: (on: boolean) => void;
}) {
  return (
    <div className="pp-bar-acts">
      {o.select ? (
        <Button variant="plain" size="sm" onClick={o.select.press} data-testid="leads-phone-select">
          <BarWord word={o.select.word} words={SELECT_WORDS} />
        </Button>
      ) : null}
      {o.sortItems.length ? (
        <Menu
          label="Sort"
          groups={menuGroups(o.sortItems)}
          trigger={
            <Button variant="plain" size="sm" data-testid="leads-phone-sort">
              Sort
            </Button>
          }
        />
      ) : null}
      <Button
        variant="plain"
        size="sm"
        onClick={o.onImport}
        data-testid="leads-phone-import"
        {...gate("find", "import leads")}
      >
        Import
      </Button>
      {o.canMap ? (
        <Button
          variant="plain"
          size="sm"
          aria-label={o.mapOn ? "Show the list" : "Show the map"}
          onClick={() => o.onMap(!o.mapOn)}
          data-testid="leads-view-switch"
        >
          {o.mapOn ? "List" : "Map"}
        </Button>
      ) : null}
    </div>
  );
}

export const LeadsPhoneBar = ({
  listLabel,
  listCount = null,
  onLists,
  listsOpen,
  q,
  onQ,
  searchRef,
  searchOpen = false,
  onSearchOpen = () => undefined,
  onFind = () => undefined,
  canFind = false,
  mapOn = false,
  onMap = () => undefined,
  canMap = false,
  onImport = () => undefined,
  select = null,
  sortItems = [],
  title = null,
}: LeadsPhoneBarProps) => (
  <>
    <PeoplePhoneBar
      listLabel={listLabel}
      listCount={listCount}
      onLists={onLists}
      listsOpen={listsOpen}
      q={q}
      onQ={onQ}
      searchRef={searchRef}
      searchOpen={searchOpen}
      onSearchOpen={onSearchOpen}
      searchLabel="Search leads"
      testid="leads"
      title={title}
      trailing={
        <>
          {barWords({ select, sortItems, onImport, canMap, mapOn, onMap })}
          <button
            type="button"
            className="pp-bar-icon ld-bar-find"
            aria-label="Find leads"
            title="Find leads"
            data-testid="leads-bar-find"
            onClick={() => onFind()}
            {...(canFind ? {} : gate("find", "find businesses for you"))}
          >
            <Icon name="three" size={16} />
          </button>
        </>
      }
    />
  </>
);

/**
 * A phone's one filled act, in the head beside the strip: New search, the finder Find leads opens (Ruben, 10 Oct 2026).
 * It stood as Import leads, which the Lists sheet said again under New search; Import is a word of the bar now, and the
 * sheet is the lists alone. Its first word is kept where the row of views is short (kit/head/act-words.tsx).
 */
export const LeadsNewSearch = ({ canFind, onFind }: { canFind: boolean; onFind: () => void }) => (
  <Button
    variant="primary"
    size="sm"
    onClick={() => onFind()}
    data-testid="leads-new-search-act"
    {...(canFind ? {} : gate("find", "find leads"))}
  >
    <ActWords icon={<Icon name="plus" size={12} />} words="New search" />
  </Button>
);

/**
 * A phone's filled act where the page is the question (the first day, and New search pressed): a list the owner already
 * has, as the first day always offered it there (Ruben, 10 Oct 2026: New search shows the first day's page, the same act
 * in its head).
 */
export const LeadsImportAct = ({ onImport }: { onImport: () => void }) => (
  <Button
    variant="primary"
    size="sm"
    onClick={() => onImport()}
    data-testid="leads-import-open"
    {...gate("find", "import leads")}
  >
    <ActWords icon={<Icon name="download" size={12} />} words="Import leads" />
  </Button>
);

/**
 * The plan panel, as a phone's sheet: the kit's Sheet in a job's shape, as every small job on a phone is (Ruben, 10 Oct
 * 2026: its own sheet sat in a desk's padding, and a picker's listbox ran off it). Titled New search, or the picker's
 * own title with a way back while a word's choices are its step; Cancel, the wash, a pull down and Esc close it (the
 * kit's, so the page's keys hold still behind it). Drawn while open and on its way out.
 */
export const LeadPlanSheet = ({
  open,
  onClose,
  title,
  back = null,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  back?: SheetBack | null;
  children?: ReactNode;
}) => (
  <Sheet
    open={open}
    shape="job"
    title={title}
    close={JOB_CANCEL}
    back={back}
    onClose={onClose}
    testid="lead-plan-sheet"
  >
    {children}
  </Sheet>
);
