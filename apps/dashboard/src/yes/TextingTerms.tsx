import type { TextingTermsVM } from "@chanlytics/contracts";

/**
 * A workspace's texting terms, as markup: its view model. Apart from its page (app/b/[slug]/terms/page.tsx, whose
 * comment says what the carriers read here) so what it draws is checked by rendering this with a fixture. While the
 * workspace is paused the terms say it is not taking sign-ups (X4-1).
 */
export function TextingTerms({ vm }: { vm: TextingTermsVM }) {
  return (
    <main className="legal biz-public">
      <h1>{vm.title}</h1>
      <p className="legal-meta">{vm.lead}</p>
      {vm.closedLine && (
        <p className="legal-meta" data-testid="bt-closed">
          {vm.closedLine}
        </p>
      )}
      <ul data-testid="bt-items">
        {vm.items.map((it) => (
          <li key={it.label}>
            <b>{it.label}</b>: <Emphasised text={it.text} />
          </li>
        ))}
      </ul>
      <p>
        Privacy policy:{" "}
        <a href={vm.privacyUrl} data-testid="bt-privacy">
          {vm.privacyUrl}
        </a>
        . These messages are sent for the business named above by a receptionist operated by Chanlytics (RJ Capital LLC,
        193 Jamaica Ave, Brooklyn, NY 11207, <a href="tel:+19175746416">+1 (917) 574-6416</a>); what Chanlytics holds as
        their processor is in the <a href="/privacy">Chanlytics privacy policy</a>.
      </p>
    </main>
  );
}

/** HELP and STOP in bold, which the reviewers' guide asks of a program's terms. */
function Emphasised({ text }: { text: string }) {
  return (
    <>
      {text
        .split(/(\bHELP\b|\bSTOP\b)/)
        .map((part, i) => (part === "HELP" || part === "STOP" ? <b key={i}>{part}</b> : <span key={i}>{part}</span>))}
    </>
  );
}
