/**
 * The open message's head, in as few words as it can be said (the message sheet's canvas, 12 Nov 2026): under its name
 * one line of facts (what it is, what sends it, what went), and at its right where it stands, in one word and its dot,
 * whose meaning is a tap on it. It replaces a line under the name that said a rule on every open ("An offer, for people
 * who said yes to offers"), and two rows under the words, one of which said "None yet". The words' own pencil is here
 * too, which WhatsApp's words and an email's or a text's version wear alike.
 */
import { MESSAGE_CHANGE_WORDS } from "@chanlytics/contracts";
import { SEQUENCES_ROUTE, sequenceRoute } from "@chanlytics/contracts";
import { navigate } from "../../frame-verbs";
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";
import { LinkButton } from "../../kit/link-button/link-button";
import { StatePill } from "../../kit/pill/state-pill";
import { Popover } from "../../kit/popover/popover";
import type { TemplateGroup } from "./group";
import { sentByWords } from "./message-row-facts";
import type { MessagePlace, messageFacts, placeOfMessage } from "./message-row-facts";
import { TPL_LIST_WORDS, TPL_SHEET_WORDS as WORDS } from "./words";

type Facts = ReturnType<typeof messageFacts>;
type Setting = ReturnType<typeof placeOfMessage>;

/** Where it stands, as its head says it: the list's group, in the tone of what it asks of you. */
const PLACE_TONES: Record<MessagePlace, string> = { need: "warn", going: "ok", idle: "plain", away: "plain" };

/** What went out, in a few words: how many and when the last did, that none has yet, or nothing where it was not read. */
function sentWords(sent: Facts["usage"]["sent"]): string | null {
  if (!sent) return null;
  if (sent.count) return WORDS.sent(sent.count, sent.when);
  return /never/i.test(sent.when ?? "") ? WORDS.noneSent : null;
}

/**
 * The one line under the name: what it is (an offer, a note), what sends it, a door to that sequence (else to the list of
 * them), and how many went out. A starter nothing sends says what it is for instead.
 */
export function factsLine(g: TemplateGroup, facts: Facts) {
  const offer = facts.marks.offer;
  const { use, sent } = facts.usage;
  const sends = use && !use.unused ? use : null;
  const went = sentWords(sent);
  const purpose = !sends && g.starter ? g.purpose.charAt(0).toUpperCase() + g.purpose.slice(1) : null;
  return (
    <span className="tpl-facts-line" data-testid="template-pane-users">
      <Icon name={offer ? "gift" : "bell"} size={12} />
      <span>{offer ? WORDS.offer : WORDS.note}</span>
      {sends ? (
        <>
          <span className="tpl-facts-sep" aria-hidden="true">
            ·
          </span>
          <LinkButton
            className="tpl-facts-door"
            onClick={() => navigate(sends.sequence ? sequenceRoute(sends.sequence) : SEQUENCES_ROUTE)}
            title={sentByWords(sends)}
            data-testid="template-users"
          >
            <span className="tpl-facts-by">{sends.words}</span>
            <Icon name="chevron" size={10} />
          </LinkButton>
        </>
      ) : purpose ? (
        <>
          <span className="tpl-facts-sep" aria-hidden="true">
            ·
          </span>
          <span className="tpl-facts-by">{purpose}</span>
        </>
      ) : null}
      {went ? (
        <>
          <span className="tpl-facts-sep" aria-hidden="true">
            ·
          </span>
          <span className="tpl-facts-went" data-testid="template-sent-count">
            {went}
          </span>
        </>
      ) : null}
    </span>
  );
}

/**
 * Where it stands: one word and its dot (the kit's StatePill), and on a tap what that means, with the rule its kind keeps.
 * While WhatsApp looks at words sent back to it, the word is Checking, whatever group the list keeps it in.
 */
export function standingTap(g: TemplateGroup, facts: Facts, setting: Setting) {
  const checking = facts.lang.row?.meta_status === "pending" && setting.place !== "away";
  const word = checking ? WORDS.checking : TPL_LIST_WORDS.placeWord[setting.place];
  const tone = checking ? "warn" : PLACE_TONES[setting.place];
  const use = facts.usage.use;
  const says = checking
    ? WORDS.checkingSays
    : setting.place === "need"
      ? setting.said
      : setting.place === "going" && use
        ? WORDS.goingSays(sentByWords(use))
        : setting.place === "away"
          ? use && use.running
            ? `${WORDS.awaySays} ${MESSAGE_CHANGE_WORDS.awayStill(sentByWords(use))}`
            : WORDS.awaySays
          : WORDS.idleSays;
  return (
    <Popover
      label={WORDS.standing(g.title)}
      align="end"
      className="tpl-standing-pop"
      trigger={
        <Button variant="quiet" size="sm" className="tpl-standing" data-testid="template-pane-standing">
          <StatePill kind="tone" value={tone} label={word} testid="template-pane-status" />
        </Button>
      }
    >
      <div className="tpl-standing-says">
        <p>
          <b>{word}.</b> {says}
        </p>
        <p className="tpl-standing-rule">{facts.marks.offer ? WORDS.offerSays : WORDS.noteSays}</p>
      </div>
    </Popover>
  );
}

/** The pencil on words that may be changed: the press that opens them in the editor, where they stand. */
export function wordsPencil(onEdit: () => void, testid = "template-words-edit") {
  return (
    <Button
      iconOnly
      variant="glass"
      size="sm"
      className="tpl-read-pen"
      onClick={onEdit}
      aria-label={WORDS.changeWords}
      title={WORDS.changeWords}
      data-testid={testid}
    >
      <Icon name="pencil" size={13} />
    </Button>
  );
}
