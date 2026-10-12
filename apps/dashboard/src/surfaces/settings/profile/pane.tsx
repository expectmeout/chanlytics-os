/**
 * Settings › Profile -- you, before anything about the business (moved from legacy/pages/settings.jsx, decision 0015
 * step 11). Settings' page still draws it by its old name, which seed-globals publishes (settings/globals.ts).
 *
 * Everything here already existed and was somewhere else: your name inside the Team card, your email only inside the
 * account menu's popover, your role as a chip beside other people's. A person who wants to check which account they are
 * signed in as should not have to open a menu over a page about a salon.
 *
 * Deliberately short. Theme and the Keyboard shortcuts row (on a desk; the sheet opens on ? too) stay in the account
 * menu, because they are properties of this BROWSER rather than of you, and moving them here would make one of the two
 * wrong. This browser's alerts are Settings › Notifications' (the account menu says where they stand and opens it).
 */
import { useRef, useState } from "react";
import { identityWords, ROLE_SAYS, roleSays } from "@chanlytics/contracts";
import { meVerbs } from "@/legacy-bridge/identity";
import { LinkButton } from "../../kit/link-button/link-button";
import { RecordField } from "../../kit/record/field";
import { useRecordFold } from "../../kit/record/hooks";
import { RecordInline } from "../../kit/record/inline";
import { RecordRow } from "../../kit/record/row";
import { demoSession, meNow, shellSignOut, type LegacyFlash } from "../../legacy-verbs";

type Flash = (f: LegacyFlash) => void;

/**
 * The name you go by, saved through the bridge (/api/v1/me). Empty clears it; the chip, the roster and the account menu
 * read the same words.
 *
 * It used to live inside the Team card, under a roster of other people, on a page titled Workspace whose first card was
 * the business -- while the account menu's own "Your name" item navigated there. It is the first row of Profile now,
 * which is where the menu points and where a person looks.
 */
function YourName({ flash }: { flash: Flash }) {
  const me = meNow() || {};
  const stored = me.display_name || "";
  // The record kit's row and inline editor, as the Business tab edits a value where it is stated: the row says the
  // name, Change opens the box on the row's own line, Enter saves, Esc cancels, and the registry keeps one editor open.
  // It was a box always drawn, with a Save that appeared beside it.
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const live = useRef<{ draft: string | null; stored: string; busy: boolean }>({ draft: null, stored, busy: false });
  live.current.stored = stored;
  live.current.busy = busy;
  const fold = useRecordFold("profile-name", {
    dirty: () => live.current.draft != null && live.current.draft.trim() !== live.current.stored,
    saving: () => live.current.busy,
  });
  const now = draft == null ? stored : draft;
  const set = (v: string) => {
    live.current.draft = v;
    setDraft(v);
  };
  const close = () => {
    live.current.draft = null;
    setDraft(null);
    fold.close();
  };
  const save = async () => {
    if (busy) return;
    if (now.trim() === stored) {
      close();
      return;
    }
    setBusy(true);
    const r = await meVerbs.setName(now);
    setBusy(false);
    if (!r.ok) {
      flash({ tone: "danger", msg: <>{r.message}</> });
      return;
    }
    close();
    flash({
      msg: r.name ? (
        <>
          You&rsquo;re <b>{r.name}</b> to your team now.
        </>
      ) : (
        <>Name cleared — your email stands in.</>
      ),
    });
  };
  return (
    <>
      {fold.open ? null : (
        <RecordRow
          id="profile-name"
          label="Name"
          value={stored || null}
          empty="Your email stands in"
          act={{
            label: stored ? "Change" : "Add one",
            name: stored ? "Change your name" : "Add one: your name",
            onClick: () => fold.request(),
            testid: "set-you-change",
          }}
        />
      )}
      <RecordInline
        id="profile-name"
        label="Name"
        open={fold.open}
        onSave={() => void save()}
        onCancel={close}
        saving={busy}
      >
        <RecordField
          id="set-you-name"
          label={null}
          aria-labelledby="rec-inline-profile-name-key"
          value={now}
          onChange={set}
          maxLength={80}
          placeholder="How your team sees you"
          readOnly={busy || undefined}
          data-testid="set-you-name"
          testid="set-you"
        />
      </RecordInline>
    </>
  );
}

/**
 * Delete your own account (00190; App Store 5.1.1(v)): two steps on the row itself, the sentence saying what goes and
 * what stays, then the one button; the door's refusal (the only owner of a workspace with other members) said where it
 * happened. Drawn on the web and in the app alike: a rule that only the app needs is still the account's.
 */
function DeleteAccountRow({ flash }: { flash: Flash }) {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState("");
  const go = async () => {
    if (demoSession()) {
      flash({ msg: <>Nothing to delete in the demo.</> });
      return;
    }
    setBusy(true);
    const r = await meVerbs.deleteAccount();
    setBusy(false);
    if (!r.ok) setRefused(r.message || "Your account could not be deleted.");
  };
  return (
    <RecordRow
      id="profile-delete"
      label="Delete account"
      value={
        armed ? (
          <span className="set-delete-confirm" data-testid="set-profile-delete-confirm">
            <LinkButton
              className="set-inline-act"
              tone="danger"
              onClick={() => void go()}
              disabled={busy}
              data-testid="set-profile-delete-go"
            >
              {busy ? "Deleting…" : "Yes, delete my account"}
            </LinkButton>
            {" · "}
            <LinkButton className="set-inline-act" onClick={() => setArmed(false)} disabled={busy}>
              Keep it
            </LinkButton>
          </span>
        ) : (
          <LinkButton className="set-inline-act" onClick={() => setArmed(true)} data-testid="set-profile-delete">
            Delete my account…
          </LinkButton>
        )
      }
      hint={
        refused
          ? refused
          : armed
            ? "Removes you from every workspace and deletes your sign-in. A workspace you alone were in keeps its records for the business."
            : "Yours to do here, any time. A workspace with other members needs another owner first."
      }
    />
  );
}

export const PaneProfile = ({ flash }: { flash: Flash }) => {
  const me = meNow();
  const words = identityWords(me ? { ...me, email: me.email ?? null } : null);
  const role = me && me.role && Object.hasOwn(ROLE_SAYS, me.role) ? roleSays(me.role) : null;
  const signOut = () => {
    if (demoSession() || !shellSignOut()) flash({ msg: <>Nothing to sign out of in the demo.</> });
  };
  // One card of the record kit's rows (24 Sep): the name, edited on its row; the address you signed in with, whose act
  // goes to the sign-in page's password reset; your role, with what it may do as the row's hint (a desktop's; a phone
  // reads the word); and the sign-out, a press inside its row rather than the row's act, since a whole row that signs
  // you out everywhere is one stray tap too many. It was two cards, each row a label, a sentence and a control, 736px for
  // four facts. The avatar, the name, the address and the role pill were a block above rows that say the same four
  // things -- and the sidebar's own footer says three of them a third time.
  return (
    <section className="rec-card set-profile" data-testid="set-profile" aria-labelledby="set-profile-title">
      <div className="rec-card-head">
        <h2 className="rec-card-title" id="set-profile-title">
          You
        </h2>
        <span className="rec-card-sub">How your team sees you, and how you signed in.</span>
      </div>
      <YourName flash={flash} />
      <RecordRow
        id="profile-email"
        label="Signed in as"
        value={words.email || null}
        empty="No address"
        act={{
          label: "Change password",
          name: "Change your password, from the sign-in page",
          icon: "arrow-right",
          onClick: () => {
            window.location.assign("/reset-password");
          },
          testid: "set-profile-password",
        }}
      />
      {role && <RecordRow id="profile-role" label="Role" value={role.label} hint={role.can} />}
      {/* Named for what it does. "This device" sat over a sign-out that ends every session on every device:
          /auth/signout revokes them all (S20). */}
      <RecordRow
        id="profile-signout"
        label="Sign out"
        value={
          <LinkButton className="set-inline-act" onClick={signOut} data-testid="set-profile-signout">
            Sign out everywhere
          </LinkButton>
        }
        hint="Ends your session on every device, this one included."
      />
      <DeleteAccountRow flash={flash} />
    </section>
  );
};
