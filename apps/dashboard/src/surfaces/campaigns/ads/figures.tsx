/**
 * The Ads page's four figures (MOCKUP; spec C4): Spent, Got in touch, Booked, For each person who booked, in the Reports figure
 * strip's recipe (a raised box, a hairline between cells), each the kit's Figure with the model's words field for field. A
 * cost that waits for a platform to be read is a dash that says so, never a zero. Under the strip, ONE quiet line and the
 * doors: "How this is counted ›", which opens the four definitions, the WhatsApp-fee sentence, the calls sentence and how long
 * it is kept in the kit's Popover, so every definition is reachable by a tap and not by a hover alone; "Results ›", the sheet
 * of every ad's last 30 days; and, while no calendar link is set, the door to where it is added.
 */
import { adsResultsRoute } from "@chanlytics/contracts";
import { COUNTED } from "@chanlytics/contracts/ads-page";
import type { CountedVM, DoorVM, FigureVM } from "@chanlytics/contracts/ads-page";
import { Figure } from "../../kit/figure/figure";
import { Icon } from "../../kit/icon/icon";
import { LinkButton } from "../../kit/link-button/link-button";
import { Popover } from "../../kit/popover/popover";
import { routeDoor } from "../../legacy-verbs";

/** What the door opens: the title, then a sentence each, the first four under the figure they define. */
function CountedBox({ counted }: { counted: CountedVM }) {
  return (
    <>
      <h3 className="ads-counted-title">{counted.title}</h3>
      <ul className="ads-counted-list">
        {counted.items.map((item, at) => (
          <li key={at}>
            {item.label ? <b>{item.label}</b> : null}
            <span>{item.text}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

interface FiguresProps {
  figures: readonly FigureVM[];
  counted: CountedVM;
  /** The door to the calendar link, while none is set. */
  link: DoorVM | null;
  /** Open an Ads address over the page (the Results sheet), pushed so Back closes it. */
  onOpen: (route: string) => void;
}

/** The strip, and the line under it with its doors. */
export function Figures({ figures, counted, link, onOpen }: FiguresProps) {
  return (
    <div className="ads-figures-block" data-testid="ads-figures">
      <dl className="ads-figures">
        {figures.map((f) => (
          <Figure
            key={f.id}
            id={f.id}
            label={f.label}
            value={f.value}
            change={f.change}
            meta={f.meta}
            definition={f.definition}
            n={f.n}
            minN={f.minN}
            className="ads-cell"
            data-testid={`ads-figure-${f.id}`}
          />
        ))}
      </dl>
      <p className="ads-counted">
        <span data-testid="ads-counted-quiet">{counted.quiet}</span>
        <Popover
          label={counted.title}
          align="start"
          className="ads-counted-box"
          trigger={
            <LinkButton className="ads-counted-door" data-testid="ads-counted-door">
              {counted.door} <Icon name="chevron" size={11} />
            </LinkButton>
          }
        >
          <CountedBox counted={counted} />
        </Popover>
        <LinkButton
          {...routeDoor(adsResultsRoute(), onOpen)}
          className="ads-counted-door"
          data-testid="ads-results-door"
        >
          {COUNTED.results} <Icon name="chevron" size={11} />
        </LinkButton>
        {link ? (
          <LinkButton {...routeDoor(link.to)} className="ads-counted-door" data-testid="ads-link-door">
            {link.words} <Icon name="chevron" size={11} />
          </LinkButton>
        ) : null}
      </p>
    </div>
  );
}
