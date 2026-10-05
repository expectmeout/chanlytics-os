/**
 * The workspace's email address: chosen once, and the name beside it (moved from legacy/pages/integrations-real.jsx,
 * decision 0015 step 11). The row's verb opens this; it is the row's own body, like the business record. What may be
 * typed is contracts' to say (mailbox.ts), so the sentence under a box before the press is the one the route would give
 * after it; whether an address is free is the server's, and its refusal lands under the same box.
 */
import { useState } from "react";
import type { SetupDto } from "@chanlytics/contracts";
import { FieldError } from "../../kit/field-error/field-error";
import { gate, refusalToast, type LegacyFlash } from "../../legacy-verbs";
import { mailbox as MAILBOX } from "./mailbox";

type Email = NonNullable<SetupDto["email"]>;

interface EmailSetupProps {
  email: Email;
  businessName: string | null;
  flash: (f: LegacyFlash) => void;
  onClose: () => void;
}

export const EmailSetupForm = ({ email, businessName, flash, onClose }: EmailSetupProps) => {
  const mailbox = email.mailbox;
  const [local, setLocal] = useState(() => (mailbox ? "" : MAILBOX.suggestLocalPart(businessName) || ""));
  const [name, setName] = useState(() => (mailbox ? mailbox.from_name : businessName || ""));
  const [problems, setProblems] = useState<{ local?: string; name?: string }>({});
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const found: { local?: string; name?: string } = {};
    const localProblem = mailbox ? null : MAILBOX.whyNotALocalPart(local);
    const nameProblem = MAILBOX.whyNotAFromName(name);
    if (localProblem) found.local = localProblem;
    if (nameProblem) found.name = nameProblem;
    setProblems(found);
    if (localProblem || nameProblem) return;
    setBusy(true);
    const r = mailbox
      ? await MAILBOX.rename(mailbox.id, name)
      : await MAILBOX.create({ localPart: local, fromName: name });
    setBusy(false);
    // A taken address is the one refusal an owner causes by typing: it belongs under the box, not in a toast.
    if (!r.ok) {
      if (r.code === "conflict" && !mailbox) setProblems({ local: r.message });
      else flash(refusalToast(r, "Not saved"));
      return;
    }
    const made = r.data as { mailbox?: { address?: string } } | undefined;
    flash({
      msg: mailbox ? (
        <>Customers now see {name.trim()} beside your address</>
      ) : (
        <>{made?.mailbox?.address} is yours — emails to it arrive in your Inbox</>
      ),
    });
    onClose();
  };
  return (
    <div className="set-row set-row-stack biz" data-testid="email-setup">
      <div className="biz-fields">
        {!mailbox && (
          <label className="biz-field" data-testid="email-local">
            <span className="biz-label">The address customers write to</span>
            <span className="biz-affix">
              <input
                className={`biz-input${problems.local ? " biz-bad" : ""}`}
                value={local}
                placeholder="yourbusiness"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                disabled={busy}
                aria-invalid={problems.local ? true : undefined}
                aria-describedby={problems.local ? "email-local-problem" : "email-local-hint"}
                onChange={(e) => setLocal(e.target.value)}
              />
              <span className="biz-affix-text">@{email.domain}</span>
            </span>
            {problems.local ? (
              <FieldError id="email-local-problem" message={problems.local} testid="email-local-problem" />
            ) : (
              <span className="biz-hint" id="email-local-hint">
                It cannot be changed later: it goes on business cards and into customers&apos; address books.
              </span>
            )}
          </label>
        )}
        <label className="biz-field" data-testid="email-name">
          <span className="biz-label">The name customers see beside it</span>
          <input
            className={`biz-input${problems.name ? " biz-bad" : ""}`}
            value={name}
            disabled={busy}
            aria-invalid={problems.name ? true : undefined}
            aria-describedby={problems.name ? "email-name-problem" : undefined}
            onChange={(e) => setName(e.target.value)}
          />
          {problems.name ? (
            <FieldError id="email-name-problem" message={problems.name} testid="email-name-problem" />
          ) : null}
        </label>
      </div>
      <div className="bc-chips">
        <button
          className="btn btn-primary btn-sm"
          onClick={() => void save()}
          disabled={busy}
          data-testid="email-save"
          {...gate("team", "set up email")}
        >
          {busy ? "Saving…" : mailbox ? "Save" : "Use this address"}
        </button>
        <button className="btn btn-sm" onClick={onClose} disabled={busy}>
          Cancel
        </button>
      </div>
    </div>
  );
};
