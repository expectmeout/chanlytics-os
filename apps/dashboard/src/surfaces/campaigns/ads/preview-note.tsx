/**
 * What a workspace's preview of the Ads says wherever it draws the sample (MOCKUP): the page, an ad's drawer, New ad, the Results
 * sheet, Reports' lens and Connections' card, each of which someone can reach without passing the others. The Example pill is the
 * menu that walks the states, and says this only once it is opened. A demo session draws none: the whole session is one.
 */
import { EXAMPLE } from "@chanlytics/contracts/ads-page";
import { Notice } from "../../kit/notice/notice";
import { adsInPreview } from "./shown";

export function PreviewNote({ className }: { className?: string }) {
  if (!adsInPreview()) return null;
  const { word, said } = EXAMPLE.preview;
  return (
    <Notice
      className={className}
      label={`${word} ${said}`}
      fact={
        <>
          <b>{word}</b> {said}
        </>
      }
      testid="ads-preview-note"
    />
  );
}
