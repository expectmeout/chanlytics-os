import type { ConsentFormVM } from "@chanlytics/contracts";

/**
 * A workspace's paper sign-up form, as markup: its view model and the origin its addresses are printed under. Apart from
 * its page (app/yes/[slug]/form/page.tsx) so what it draws is checked by rendering this with a fixture. While the
 * workspace is paused the sheet says it is not in use and does not offer itself for printing (X4-1).
 */
export function PaperForm({
  vm,
  origin,
  slug,
  businessName,
}: {
  vm: ConsentFormVM;
  origin: string;
  slug: string;
  businessName: string;
}) {
  return (
    <main className="yes yes-paper">
      <h1>{vm.title}</h1>
      <p className="yes-lead">{vm.lead}</p>

      <div className="yes-paper-fields">
        {vm.fields.map((f) => (
          <div className="yes-paper-line" key={f}>
            {f}
          </div>
        ))}
      </div>

      {vm.sections.map((s) => (
        <section className="yes-ask yes-paper-section" key={s.purpose} data-testid={`form-${s.purpose}`}>
          <h2 className="yes-ask-title">{s.title}</h2>
          <p className="yes-paper-box">
            <span className="yes-paper-tick" aria-hidden="true" />
            <span>{s.box}</span>
          </p>
          {s.optional && <p className="yes-ask-optional">{s.optional}</p>}
          <ul className="yes-terms">
            {s.terms.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
          <div className="yes-paper-sign">
            <div className="yes-paper-line">{s.sign}</div>
            <div className="yes-paper-line">Date</div>
          </div>
        </section>
      ))}

      <ul className="yes-terms">
        {vm.terms.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>

      <p className="yes-paper-office">{vm.office}</p>

      <p className="yes-foot">
        Texts are sent for {businessName} by a receptionist operated by Chanlytics (RJ Capital LLC). Privacy:{" "}
        <a href={vm.links.privacy}>
          {origin}
          {vm.links.privacy}
        </a>{" "}
        · Terms:{" "}
        <a href={vm.links.terms}>
          {origin}
          {vm.links.terms}
        </a>
      </p>
      {vm.taking && (
        <p className="yes-foot yes-paper-noprint" data-testid="form-print-foot">
          Print this page to use it as a form, or <a href={`/yes/${slug}`}>say yes by text instead</a>.
        </p>
      )}
    </main>
  );
}
