/**
 * The workspace's email address: chosen once, and the name beside it (moved from legacy/pages/integrations-real.jsx,
 * decision 0015 step 11). The row's verb opens this; it is the row's own body, like the business record. What may be
 * typed is contracts' to say (mailbox.ts), so the sentence under a box before the press is the one the route would give
 * after it; whether an address is free is the server's, and its refusal lands under the same box.
 */
import { useState } from "react";
import type { SetupDto } from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { RecordField } from "../../kit/record/field";
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
          <RecordField
            id="email-local"
            testid="email-local"
            label="The address customers write to"
            unit={`@${email.domain}`}
            value={local}
            onChange={setLocal}
            hint="It can't be changed later, so pick one to keep."
            problem={problems.local ? <span data-testid="email-local-problem">{problems.local}</span> : undefined}
            placeholder="yourbusiness"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            readOnly={busy}
          />
        )}
        <RecordField
          id="email-name"
          testid="email-name"
          label="The name customers see beside it"
          value={name}
          onChange={setName}
          problem={problems.name ? <span data-testid="email-name-problem">{problems.name}</span> : undefined}
          readOnly={busy}
        />
      </div>
      <div className="set-acts">
        <Button
          size="sm"
          variant="primary"
          onClick={() => void save()}
          disabled={busy}
          data-testid="email-save"
          {...gate("team", "set up email")}
        >
          {busy ? "Saving…" : mailbox ? "Save" : "Use this address"}
        </Button>
        <Button size="sm" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
      </div>
    </div>
  );
};
