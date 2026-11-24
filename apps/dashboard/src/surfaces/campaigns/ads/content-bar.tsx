/**
 * Content's bar, drawn over Ads (Campaigns in three tabs, 23 Nov 2026: Ads is the last of Made's views, where it is on).
 * Made is lit among Content's lists and Ads among Made's views, the pill on a phone and the row on a desk, as Content's own
 * bar draws them (page.tsx ContentBar). Ads stays its own page at its own address (`campaigns/ads…`), kept beside Content
 * with its own code and reads and drawn in Made's place: a press here goes to the Content address it names, as a press
 * on Content's own bar does, and Back returns.
 */
// Content's bar's rules, loaded with Ads too: the Ads view can be the first of Content's two to be drawn.
import "../content/content.css";
import { contentPlanOf, contentRouteOf, type ContentList } from "@chanlytics/contracts";
import { navigate } from "../../frame-verbs";
import { surfaceValue } from "../../surface-values";
import { useSurface } from "../../use-surface";
import { ContentLists, ContentViewRow, ContentViews, weekCountOf, type MadeView } from "../content/views";

/** Content's lists over Ads, Made lit; Made's views beside them on a phone and under them on a desk, Ads lit. */
export function AdsBar({ phone, owed }: { phone: boolean; owed: boolean }) {
  const planned = contentPlanOf(useSurface("settings")?.settings?.config);
  // How many each list and view holds, as Content last read it: none before it has, never a read of its own from here.
  const tally = surfaceValue("content")?.dto?.tally ?? null;
  const onList = (list: ContentList) => navigate(contentRouteOf({ list, view: "all", open: null }));
  const onView = (view: MadeView) => {
    if (view !== "ads") navigate(contentRouteOf({ list: "made", view, open: null }));
  };
  const ads = { owed };
  return (
    <>
      <div className="cnv-bar" data-testid="ads-bar">
        <ContentLists list="made" tally={tally} onList={onList} week={planned ? { count: weekCountOf() } : null} />
        <div className="cnv-bar-end">
          {phone ? <ContentViews view="ads" tally={tally} onView={onView} planned={planned} ads={ads} /> : null}
        </div>
      </div>
      {phone ? null : <ContentViewRow view="ads" tally={tally} onView={onView} planned={planned} ads={ads} />}
    </>
  );
}
