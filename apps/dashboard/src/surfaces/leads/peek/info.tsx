/**
 * Two parts of what the lead's panel drew (moved from legacy/pages/leads-peek.jsx, decision 0015) that the lead sheet's
 * tabs still lay out (sheet/panes.tsx): the other addresses on their site, folded behind one line, and the links the
 * listing gave. Hookless: the lead's view model arrives as a prop.
 */
import { LEAD_WORDS as W } from "@chanlytics/contracts";
import type { LeadPeekVM } from "@chanlytics/contracts";
import { Icon } from "../../kit/icon/icon";

/** The other addresses on their site, folded behind one line. */
function peekOthers(vm: LeadPeekVM) {
  return vm.others ? (
    <details className="pk-box pk-alt" data-testid="peek-others">
      <summary className="pk-box-head" data-testid="peek-others-summary">
        <span className="pk-box-line">
          <Icon name="mail" size={12} />
          <span className="pk-box-sum">{vm.others.summary}</span>
          <Icon name="chevron-down" size={12} />
        </span>
      </summary>
      <ul>
        {vm.others.items.map((o) => (
          <li key={o.email}>{`${o.email} — ${o.why}`}</li>
        ))}
      </ul>
      {vm.others.picked ? (
        <p className="pk-alt-why" data-testid="peek-others-why">
          {vm.others.picked}
        </p>
      ) : null}
    </details>
  ) : null;
}

/**
 * The links the listing gave beyond the site (which is a way to reach them, in Contact's own rows): Instagram and the
 * rest as quiet buttons. Nothing at all where it gave none.
 */
const OTHER_LINKS = [
  ["facebook", "globe"],
  ["linkedin", "globe"],
  ["tiktok", "globe"],
  ["maps", "pin"],
] as const;
function peekLinks(vm: LeadPeekVM) {
  if (!vm.links.instagram && !OTHER_LINKS.some(([k]) => vm.links[k])) return null;
  return (
    <div className="pk-links" data-testid="peek-links">
      {vm.links.instagram ? (
        <a
          className="btn btn-ghost btn-sm"
          href={vm.links.instagram.href}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="peek-instagram"
        >
          <Icon name="instagram" size={12} />
          {W.instagram}
        </a>
      ) : null}
      {/* The address above is already the link to the map: on a phone this one is not drawn again (leads.css). */}
      {OTHER_LINKS.map(([k, icon]) => {
        const link = vm.links[k];
        return link ? (
          <a
            key={k}
            className="btn btn-ghost btn-sm"
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            data-testid={`peek-${k}`}
            data-said={k === "maps" && vm.where && vm.where.href ? "address" : undefined}
          >
            <Icon name={icon} size={12} />
            {link.label}
          </a>
        ) : null;
      })}
    </div>
  );
}

/** The parts the lead sheet's Reach and About tabs draw from here, never a second time. */
export const LeadPeekParts = {
  others: peekOthers,
  links: peekLinks,
};
