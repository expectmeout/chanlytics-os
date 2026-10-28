/**
 * The person's name and email address, each changed where it is said (moved from legacy/pages/client-profile.jsx,
 * decision 0015, step 5), in the box it is typed in: the words and the box are one (the record kit's in-place value,
 * kit/record/in-place.ts), so beginning to type moves nothing (Ruben, 28 Oct 2026: the editor's box, ✓ and ✕ took the
 * name's line and pushed the head down; the address grew from one line to three).
 *
 * The name as the owner gives it. A number is what most people arrive as, so for a person with no name yet the pencil
 * after it is always in view; a person who has a name shows it on hover under a mouse, and always on a touch screen,
 * which has no hover.
 *
 * The email address sits in the About list where the number is: said once, and changed where it is said. Someone who may
 * change it sees the address with a quiet pencil, or "Add an email" in its box when there is none; someone who may not
 * sees the address, or no row at all. What is wrong with a typed address is said under the box before a round trip
 * (whyNotAnEmail), and the door's own refusal, another person here already has it, is said there too.
 */
import { PERSON_NAME_WORDS, PERSON_WASH_WORDS, whyNotAnEmail } from "@chanlytics/contracts";
import type { PersonVM } from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";
import { Wash } from "../../kit/motion/wash";
import { LinkButton } from "../../kit/link-button/link-button";
import { useInPlace } from "../../kit/record/in-place";
import type { InPlace } from "../../kit/record/in-place";
import { setPersonDetails } from "../people-detail";
import type { FlashFn } from "../person-verbs";

interface FieldProps {
  p: PersonVM;
  canEdit: boolean;
  flash: FlashFn;
}

/** The longest name the details door keeps. */
const PERSON_NAME_MAX = 80;
/** The longest address the details door keeps. */
const EMAIL_MAX = 254;

/** What the toast says of a name taken away: what shows in its place. */
function clearedWords(p: PersonVM) {
  return <>Name cleared — {p.phone ? "the number" : p.email ? "their email address" : "nothing"} shows again</>;
}

/**
 * The pencil after a value typed in place, and ✓ while it is typed (a list's name draws it too). The box is the stop a
 * key reaches, so neither is one; ✓ keeps the keys in the box while its press asks for the save.
 */
export function InPlacePen({ edit, label, rest, save }: { edit: InPlace; label: string; rest: string; save: string }) {
  return edit.typing ? (
    <Button
      key="save"
      variant="quiet"
      size="sm"
      iconOnly
      tabIndex={-1}
      className="cl-in-place-pen"
      aria-label="Save"
      title="Save · Esc leaves it as it was"
      aria-busy={edit.busy || undefined}
      onMouseDown={edit.keep}
      onClick={() => void edit.done()}
      data-testid={save}
    >
      <Icon name="check" size={13} />
    </Button>
  ) : (
    <Button
      key="pen"
      variant="quiet"
      size="sm"
      iconOnly
      tabIndex={-1}
      className="cl-in-place-pen"
      aria-label={label}
      title={label}
      onClick={edit.begin}
      data-testid={rest}
    >
      <Icon name="edit" size={11} />
    </Button>
  );
}

/**
 * The name, in its box. Pressed, the caret lands where it was pressed; its pencil chooses every word. A stand-in (named
 * for the business, 0052) and a person known by their number open with the box empty, since the business's name and the
 * number are not theirs. A name a reply's signer gave says so under the box while it is typed in, over what is below
 * it, with the way back to the business (`onPutBack`, the notice's Undo). Someone who may not change it reads the name.
 */
export function PersonName({ p, canEdit, flash, onPutBack }: FieldProps & { onPutBack?: (() => void) | null }) {
  const unnamed = !p.givenName || p.standIn;
  const edit = useInPlace({
    value: p.name,
    start: unnamed ? "" : p.givenName || "",
    max: PERSON_NAME_MAX,
    // A stand-in's box left empty keeps the business's name: an empty save would clear it.
    same: (typed) => typed === (p.givenName || "") || (p.standIn && !typed),
    save: async (next) => {
      const was = p.givenName || "";
      const r = await setPersonDetails(p.id, { name: next });
      if (!r.ok) return r.message || "Could not save the name.";
      // A name the owner gave goes back by the same door; a stand-in's and a signer's go back by the notice's own Undo.
      const undo =
        p.standIn || p.head.namedBy
          ? null
          : async () => {
              // Said back at once: an Undo pressed before the page's read lands would leave the name it took away.
              edit.hold(was || null);
              const back = await setPersonDetails(p.id, { name: was });
              if (!back.ok) {
                edit.hold(null);
                flash({ tone: "danger", msg: <>{back.message || "Could not put the name back."}</> });
              } else flash({ msg: was ? <>{PERSON_NAME_WORDS.backTo(was)}</> : clearedWords(p) });
            };
      flash({
        msg: next ? (
          <>
            Named <b>{next}</b>
          </>
        ) : (
          clearedWords(p)
        ),
        undo: undo && (() => void undo()),
      });
      return null;
    },
    said: (why) => flash({ tone: "danger", msg: <>{why}</> }),
  });
  if (!canEdit) {
    return (
      <div className="cl-prof-name-row">
        <h1 className="cl-prof-name">
          <Wash scope={p.id} value={p.name} said={PERSON_WASH_WORDS.name(p.name)}>
            {p.name}
          </Wash>
        </h1>
      </div>
    );
  }
  const ask = unnamed ? (p.standIn && p.head.addName ? PERSON_NAME_WORDS.addName : "Give them a name") : "Rename";
  return (
    <div
      className="cl-prof-name-row"
      data-in-place
      data-typing={edit.typing || undefined}
      data-invite={unnamed || undefined}
      aria-busy={edit.busy || undefined}
    >
      <h1 className="cl-prof-name">
        <Wash scope={p.id} value={p.name} said={PERSON_WASH_WORDS.name(p.name)}>
          <span
            key={edit.round}
            {...edit.box}
            className="cl-in-place cl-prof-name-text"
            aria-label="Their name"
            spellCheck={false}
            autoCapitalize="words"
            autoCorrect="off"
            enterKeyHint="done"
            data-placeholder="Their name"
            data-testid="person-name-input"
          >
            {edit.shown}
          </span>
        </Wash>
        <InPlacePen edit={edit} label={ask} rest="person-rename" save="person-name-save" />
      </h1>
      {edit.problem ? (
        <p className="cl-in-place-says" data-problem role="alert" data-testid="person-name-problem">
          {edit.problem}
        </p>
      ) : edit.typing && p.head.namedBy && onPutBack ? (
        <p className="cl-in-place-says" data-testid="person-name-from">
          {PERSON_NAME_WORDS.fromSignature(p.head.namedBy.day)}
          {p.head.namedBy.putBack ? (
            <>
              {" · "}
              <LinkButton
                onMouseDown={edit.keep}
                onClick={() => {
                  edit.leave();
                  onPutBack();
                }}
                data-testid="person-name-put-back"
              >
                {PERSON_NAME_WORDS.putBack(p.head.namedBy.putBack)}
              </LinkButton>
            </>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}

/** The email address, in the About list, in its box; with none, the box says "Add an email" and its pencil stays. */
export function PersonEmail({ p, canEdit, flash }: FieldProps) {
  const edit = useInPlace({
    value: p.email || "",
    start: p.email || "",
    max: EMAIL_MAX,
    same: (typed) => typed.toLowerCase() === (p.email || ""),
    check: (typed) => (typed ? whyNotAnEmail(typed) : null),
    save: async (next) => {
      const was = p.email || "";
      const r = await setPersonDetails(p.id, { email: next });
      if (!r.ok) return r.message || "Could not save the address.";
      const undo = async () => {
        edit.hold(was || null);
        const back = await setPersonDetails(p.id, { email: was });
        if (!back.ok) {
          edit.hold(null);
          flash({ tone: "danger", msg: <>{back.message || "Could not put the address back."}</> });
        } else flash({ msg: was ? <>Email address put back</> : <>Email address removed</> });
      };
      flash({ msg: next ? <>Email address saved</> : <>Email address removed</>, undo: () => void undo() });
      return null;
    },
    said: (why) => flash({ tone: "danger", msg: <>{why}</> }),
  });
  if (!canEdit) {
    return (
      <span className="cl-prof-email" data-testid="person-email">
        {p.email && <span className="cl-prof-email-val">{p.email}</span>}
      </span>
    );
  }
  return (
    <span
      className="cl-prof-email"
      data-in-place
      data-typing={edit.typing || undefined}
      data-invite={!p.email || undefined}
      aria-busy={edit.busy || undefined}
      data-testid="person-email"
    >
      <span
        key={edit.round}
        {...edit.box}
        className="cl-in-place cl-prof-email-val"
        aria-label="Their email address"
        inputMode="email"
        spellCheck={false}
        autoCapitalize="none"
        autoCorrect="off"
        enterKeyHint="done"
        data-placeholder="Add an email"
        data-testid="person-email-input"
      >
        {edit.shown}
      </span>
      <InPlacePen
        edit={edit}
        label={p.email ? "Change the email address" : "Add an email address"}
        rest="person-email-edit"
        save="person-email-save"
      />
      {edit.problem ? (
        <span className="cl-in-place-says" data-problem role="alert" data-testid="person-email-problem">
          {edit.problem}
        </span>
      ) : null}
    </span>
  );
}
