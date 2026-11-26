/**
 * Content's bar, drawn over Ads: Ads is the third of Content's lists, beside Made and the Library (Ruben, 25 Nov 2026), and
 * lit here. Its own filter stands where Made's views stand, the pill on a phone and the row on a desk, as Content's own bar
 * draws them (heads.tsx ContentBar): All, then each group that holds an ad, with how many, Needs you amber (live/ad-list.ts).
 * A list long enough has the find line under the bar, as People's and the Inbox's do, folded on a phone under the bar's
 * search glyph. Ads stays its own page at its own address (`campaigns/ads…`), kept beside Content with its own code and
 * reads: a press on Made or the Library goes to the Content address it names, and Back returns.
 *
 * On a phone it stands in the frame's top, as Content's bar does (heads.tsx ContentTop): drawn in the page instead, the top
 * was 44 px shorter on Ads than on Content, so every move between the two, and every load of Ads, laid the page out under
 * the taller top and then moved it up as the top's height caught up (Ruben, 25 Nov 2026). The Library is readied from here
 * as it is from Made (heads.tsx useLibraryAhead), so its press shows it whole.
 */
// Content's bar's rules, loaded with Ads too: the Ads view can be the first of Content's two to be drawn.
import "../content/content.css";
import { useRef } from "react";
import { contentPlanOf, contentRouteOf, type ContentList } from "@chanlytics/contracts";
import { navigate } from "../../frame-verbs";
import { ListFind } from "../../kit/head/list-find";
import { UnderRow } from "../../kit/head/under-row";
import { FindWords } from "../../files/library-views";
import { surfaceValue } from "../../surface-values";
import { useSurface } from "../../use-surface";
import { useAdsTab, useLibraryAhead } from "../content/heads";
import { ContentLists, ViewsPill, ViewsRow, weekCountOf } from "../content/views";
import { AD_FIND_FROM, adFilterChoicesOf, adFilterOf, useAdsLooked } from "./live/ad-list";
import type { LiveRowVM } from "./live/model";
import { LIVE } from "./live/words";

interface AdsBarProps {
  phone: boolean;
  /** Whether Ads is the view shown: a view kept hidden puts nothing in the frame's top, nor readies anything. */
  shown: boolean;
  /** The ads the list holds, which its filter and find line look through; null where no account's ads are read. */
  rows: readonly LiveRowVM[] | null;
}

/** Content's lists over Ads, Ads lit; its filter beside them on a phone and under them on a desk; its find line under all. */
export function AdsBar({ phone, shown, rows }: AdsBarProps) {
  const planned = contentPlanOf(useSurface("settings")?.settings?.config);
  // How many each list holds, as Content last read it: none before it has, never a read of its own from here.
  const tally = surfaceValue("content")?.dto?.tally ?? null;
  // Effects wait while the view is hidden (route.tsx Activity), so this readies the Library only while Ads is shown.
  useLibraryAhead(false);
  const ads = useAdsTab(true);
  const looked = useAdsLooked();
  const findRef = useRef<HTMLTextAreaElement>(null);
  const onList = (list: ContentList) => navigate(contentRouteOf({ list, view: "all", open: null }));
  const listed = rows ?? [];
  const filter =
    listed.length > 0
      ? {
          label: LIVE.showWhich,
          choices: adFilterChoicesOf(listed),
          value: adFilterOf(listed, looked.filter),
          onChoose: looked.choose,
          choiceTestid: "ads-filter",
        }
      : null;
  const finds = listed.length >= AD_FIND_FROM;
  return (
    <UnderRow className="cnv-under" away={!phone || !shown}>
      <div className="cnv-bar" data-testid="ads-bar">
        <ContentLists
          list="made"
          tally={tally}
          onList={onList}
          week={planned ? { count: weekCountOf() } : null}
          ads={ads}
        />
        <div className="cnv-bar-end">
          {phone && finds && !looked.about ? (
            <ListFind label={LIVE.find} onFind={() => findRef.current?.focus()} testid="ads-find-open" />
          ) : null}
          {phone && filter ? <ViewsPill {...filter} testid="ads-filter" /> : null}
        </div>
      </div>
      {!phone && filter ? <ViewsRow {...filter} testid="ads-filter-row" /> : null}
      {finds ? (
        <FindWords
          about={looked.about}
          onFind={looked.find}
          placeholder={LIVE.find}
          testid="ads-find"
          inputRef={findRef}
          folds={phone}
        />
      ) : null}
    </UnderRow>
  );
}
