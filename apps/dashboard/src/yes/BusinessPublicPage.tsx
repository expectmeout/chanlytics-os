import type { BusinessPageVM } from "@chanlytics/contracts";

/**
 * A workspace's own public page, as markup: its view model. Apart from its page (app/b/[slug]/page.tsx, whose comment
 * says who reads it and why we host it) so what it draws, open and paused, is checked by rendering this with a fixture.
 * While the workspace is paused the page still says who the business is, for the carriers' re-vet, says it is not taking
 * sign-ups, and no longer that it answers its customers (X4-1).
 */
export function BusinessPublicPage({ vm }: { vm: BusinessPageVM }) {
  return (
    <main className="legal biz-public">
      <h1>{vm.title}</h1>
      <p className="legal-meta" data-testid="bp-lead">
        {vm.lead}
      </p>
      {vm.closedLine && (
        <p className="legal-meta" data-testid="bp-closed">
          {vm.closedLine}
        </p>
      )}

      <h2>Who we are</h2>
      <ul data-testid="bp-identity">
        {vm.identity.map((f) => (
          <li key={f.label}>
            <b>{f.label}</b>:{" "}
            {f.href ? (
              <a href={f.href} {...(f.href.startsWith("http") ? { rel: "noreferrer" } : {})}>
                {f.value}
              </a>
            ) : (
              f.value
            )}
          </li>
        ))}
      </ul>

      {/*
        What the business IS, in its owner's words, before the list of what can be booked. The ninth refusal of
        the live campaign (30919, 22 Sep 2026) wanted "the products, services, and industry" on the page, and a
        services list names what can be booked without saying what kind of business books it.
      */}
      {(vm.about || vm.services.length > 0) && <h2>What we do</h2>}
      {vm.about && <p data-testid="bp-about">{vm.about}</p>}
      {vm.services.length > 0 && (
        <>
          <ul data-testid="bp-services">
            {vm.services.map((s) => (
              <li key={s.name}>
                {s.name}
                {s.detail ? <span className="legal-meta"> — {s.detail}</span> : null}
              </li>
            ))}
          </ul>
        </>
      )}

      {/*
        The clauses, from contracts, so this page and Chanlytics' own privacy
        policy cannot drift. Two copies of a compliance sentence is one copy
        that will be edited and one that will not.
      */}
      <h2>Text messages</h2>
      <p data-testid="bp-sms-lead">{vm.smsLead}</p>
      <ul data-testid="bp-sms-clauses">
        {vm.smsClauses.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <p>
        {vm.signUpLead}{" "}
        <a href={vm.optInUrl} data-testid="bp-opt-in">
          the sign-up page
        </a>
        . Offers and news never come by text: they go by WhatsApp, and only to customers who separately asked for them
        there.
      </p>

      {/*
        What the program keeps and what for, which is the half of a privacy
        policy 30908 asks for beside the non-sharing clause above; then the
        program's own terms, and who operates the sending.
      */}
      <h2>Your data</h2>
      {vm.yourData.map((s) => (
        <p key={s} data-testid="bp-your-data">
          {s}
        </p>
      ))}
      <p>
        The full terms of {vm.title}&rsquo;s text messages are at{" "}
        <a href={vm.termsUrl} data-testid="bp-terms">
          {vm.termsUrl}
        </a>
        . Messages to {vm.title} are answered by a receptionist operated by Chanlytics (RJ Capital LLC, 193 Jamaica Ave,
        Brooklyn, NY 11207, <a href="tel:+19175746416">+1 (917) 574-6416</a>) on their behalf; what Chanlytics holds as
        their processor, and how to have it removed, is in the <a href="/privacy">Chanlytics privacy policy</a>.
        Questions about {vm.title}&rsquo;s own handling of your data go to them at the address above.
      </p>
    </main>
  );
}
