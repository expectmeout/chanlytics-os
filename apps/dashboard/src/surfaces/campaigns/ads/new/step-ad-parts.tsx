/**
 * The sections of New ad's step 2, the ad: what it is about (a Service), the photo or video and the post, the words with Meta's
 * soft limits where they are near, how the chat starts, the words Google will show with the page it opens and what people
 * search, a form's details, "Let Meta adjust my photo and wording", and who the ad is shown as. step-ad.tsx picks the ones a
 * platform and a door take. Nothing here spends anything.
 */
import type { AdsRead } from "@chanlytics/contracts";
import { ADS_COPY_LIMITS, NEW_AD, dayShort, dayWord } from "@chanlytics/contracts/ads-page";
import type { AdDraft } from "@chanlytics/contracts/ads-page";
import { Icon } from "../../../kit/icon/icon";
import { Field } from "../../../kit/field/field";
import { LinkButton } from "../../../kit/link-button/link-button";
import { Picker } from "../../../kit/picker/picker";
import type { PickerGroup } from "../../../kit/picker/picker";
import { RecordDisclosure } from "../../../kit/record/disclosure";
import { Segmented } from "../../../kit/segmented/segmented";
import { routeDoor } from "../../../legacy-verbs";
import { cmChevron } from "../../parts/picks";
import { Cap, Ctl, OnOffRow, Sec } from "./new-bits";
import type { StepProps } from "./new-bits";
import type { Completion } from "./new-state";

/** What it is about: a Service, with its price note verbatim, and the amber line where the ad quotes a price it must not. */
export function AboutSec({ vm, state, read, patch }: StepProps) {
  const { serviceId } = state.draft;
  const one = read.services.find((s) => s.id === serviceId) ?? read.services.at(0);
  const note = (price: string) => price || NEW_AD.step2.quoted;
  const groups: PickerGroup<string>[] = [
    { options: read.services.map((s) => ({ value: s.id, label: s.name, meta: note(s.note) })) },
  ];
  const warn = vm.drawer.preview.warn;
  return (
    <Sec label={NEW_AD.step2.about}>
      <Picker
        label={NEW_AD.step2.aboutLabel}
        value={one ? one.id : null}
        onValueChange={(id) => patch({ serviceId: id })}
        groups={groups}
        chevron={cmChevron()}
        face={
          one ? (
            <>
              {one.name}
              <span className="ads-new-dim"> · {note(one.note)}</span>
            </>
          ) : undefined
        }
        data-testid="ads-new-service"
      />
      <Cap>{NEW_AD.step2.aboutCaption}</Cap>
      {warn ? (
        <p className="cm-callout" data-testid="ads-new-quote">
          <Icon name="notice" size={14} />
          <span className="cm-callout-words">{warn}</span>
        </p>
      ) : null}
    </Sec>
  );
}

/** Meta: a photo or a vertical video (Reels and Stories). TikTok's is always a video, so it is not asked. */
export function MediaSec({ state, patch }: StepProps) {
  const { format } = state.draft;
  const w = NEW_AD.step2.media;
  return (
    <Sec label={w.label}>
      <Segmented
        label={w.label}
        value={format}
        onValueChange={(next) => patch({ format: next })}
        options={[
          { value: "photo", label: w.photo, testid: "ads-new-format-photo" },
          { value: "video", label: w.video, testid: "ads-new-format-video" },
        ]}
      />
      {format === "video" ? <Cap>{w.videoNote}</Cap> : null}
    </Sec>
  );
}

/** One post as a flat tile: its glyph, its day, and a 2px ring in ink where it is the one picked. */
function PostTile({ post, picked, onPick }: { post: AdsRead["posts"][number]; picked: boolean; onPick: () => void }) {
  return (
    <LinkButton
      size="inherit"
      className="ads-new-post"
      aria-pressed={picked}
      aria-label={`${post.label}, ${dayWord(post.day)}`}
      onClick={onPick}
      data-testid={`ads-new-post-${post.id}`}
    >
      <span className="ads-new-post-art" aria-hidden="true">
        <Icon name={post.platform === "tiktok" ? "video" : post.kind === "video" ? "play" : "instagram"} size={14} />
      </span>
      <span className="ads-new-post-day">{dayShort(post.day)}</span>
    </LinkButton>
  );
}

/** The words over the posts, by what the ad shows: Instagram posts or videos, TikTok videos. */
function postsLabel(platform: AdDraft["platform"], format: AdDraft["format"]): string {
  if (platform === "tiktok") return NEW_AD.step2.postsLabel.tiktok;
  return format === "video" ? NEW_AD.step2.media.postsVideo : NEW_AD.step2.postsLabel.meta;
}

/**
 * The photo or post: the owner's posts of the kind chosen first, then a photo (a video, on TikTok and where Meta's is a video)
 * of their own; a post can run as it is or lend its photo. TikTok says the sound line when a post is used.
 */
export function PostsSec({ state, read, patch }: StepProps) {
  const { platform, postId, postMode, format } = state.draft;
  const tiktok = platform === "tiktok";
  const video = tiktok || format === "video";
  const posts = read.posts
    .filter((p) => p.platform === (tiktok ? "tiktok" : "meta") && (tiktok || p.kind === format))
    .sort((a, b) => b.day.localeCompare(a.day));
  const post = posts.find((p) => p.id === postId) ?? null;
  const label = postsLabel(platform, format);
  return (
    <Sec label={label}>
      <div className="ads-new-posts" role="group" aria-label={label}>
        {posts.map((p) => (
          <PostTile key={p.id} post={p} picked={p.id === postId} onPick={() => patch({ postId: p.id })} />
        ))}
        <LinkButton
          size="inherit"
          className="ads-new-post"
          aria-pressed={post === null}
          onClick={() => patch({ postId: null })}
          data-testid="ads-new-post-add"
        >
          <span className="ads-new-post-art" aria-hidden="true">
            <Icon name="plus" size={14} />
          </span>
          <span className="ads-new-post-day">{video ? NEW_AD.step2.addVideo : NEW_AD.step2.addPhoto}</span>
        </LinkButton>
      </div>
      {tiktok ? <Cap>{NEW_AD.step2.video}</Cap> : null}
      {tiktok && post !== null ? <Cap>{NEW_AD.step2.sound}</Cap> : null}
      {!video && post === null ? <Cap>{NEW_AD.step2.photoHint}</Cap> : null}
      {!tiktok && post !== null ? (
        <Segmented
          label={NEW_AD.step2.postUse}
          value={postMode}
          onValueChange={(next) => patch({ postMode: next })}
          options={[
            { value: "as-is", label: NEW_AD.step2.asIs, testid: "ads-new-as-is" },
            {
              value: "new-words",
              label: video ? NEW_AD.step2.newWordsVideo : NEW_AD.step2.newWords,
              testid: "ads-new-new-words",
            },
          ]}
        />
      ) : null}
    </Sec>
  );
}

/** Meta's soft limit, said only once the words are near it. */
function nearLimit(length: number, caps: readonly { max: number; where: string }[]): string | undefined {
  const hit = caps.find((c) => length >= c.max * ADS_COPY_LIMITS.near);
  return hit ? NEW_AD.step2.limit(length, hit.max, hit.where) : undefined;
}

/** The words, on the photo path: a headline and a text, drafted from the Service and Hours, with Meta's limits near the limit. */
export function WordsSec({ vm, patch }: StepProps) {
  const { headline, text } = vm.ad.copy;
  return (
    <Sec label={NEW_AD.step2.words}>
      <Field
        label={NEW_AD.step2.headline}
        value={headline}
        onValueChange={(next) => patch({ headline: next })}
        hint={nearLimit(headline.length, [
          { max: ADS_COPY_LIMITS.headlineFacebook, where: NEW_AD.step2.where.facebook },
          { max: ADS_COPY_LIMITS.headlineInstagram, where: NEW_AD.step2.where.instagram },
        ])}
        data-testid="ads-new-headline"
      />
      <Field
        label={NEW_AD.step2.text}
        rows={3}
        value={text}
        onValueChange={(next) => patch({ text: next })}
        hint={nearLimit(text.length, [{ max: ADS_COPY_LIMITS.textInstagram, where: NEW_AD.step2.where.instagram }])}
        data-testid="ads-new-text"
      />
    </Sec>
  );
}

/** How the chat starts: one word with two exclusive options, and why they cannot both be. */
export function ChatSec({ state, patch }: StepProps) {
  const groups: PickerGroup<AdDraft["startWith"]>[] = [
    {
      options: [
        { value: "ready", label: NEW_AD.step2.chatReady, sub: NEW_AD.step2.chatShort },
        { value: "questions", label: NEW_AD.step2.chatQuestions },
      ],
    },
  ];
  return (
    <Sec label={NEW_AD.step2.chat}>
      <Picker
        label={NEW_AD.step2.chat}
        value={state.draft.startWith}
        onValueChange={(startWith) => patch({ startWith })}
        groups={groups}
        chevron={cmChevron()}
        note={NEW_AD.step2.chatLocked}
        data-testid="ads-new-chat"
      />
    </Sec>
  );
}

/** Google's words as Google will show them, and the fold of the other wordings it tries. */
export function GoogleWords({ vm, state, read }: StepProps) {
  const copy = vm.ad.copy;
  const service = read.services.find((s) => s.id === state.draft.serviceId);
  const more = NEW_AD.step2.googleMore({
    offer: vm.ad.offer,
    business: read.business.name,
    price: service ? service.note : "",
  });
  return (
    <Sec label={NEW_AD.step2.words}>
      <Cap>{NEW_AD.step2.googleShown}</Cap>
      <dl className="ads-new-shown" data-testid="ads-new-shown">
        <dt>{NEW_AD.step2.headlines}</dt>
        {copy.headlines.map((h) => (
          <dd key={h}>{h}</dd>
        ))}
        <dt>{NEW_AD.step2.descriptions}</dt>
        {copy.lines.map((l) => (
          <dd key={l}>{l}</dd>
        ))}
      </dl>
      <RecordDisclosure id="ads-new-google-more" label={NEW_AD.step2.googleFold} testid="ads-new-google-more">
        <ul className="ads-new-lines">
          {[...more.headlines, ...more.descriptions].map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </RecordDisclosure>
    </Sec>
  );
}

/** Google: the page the ad opens, the business's Chanlytics page (the default) or its own website. */
export function OpensSec({ vm, patch }: StepProps) {
  const opens = vm.opens;
  if (opens === null) return null;
  const picked = opens.choices.find((c) => c.id === opens.picked);
  return (
    <Sec label={opens.label}>
      <Segmented
        label={opens.group}
        value={opens.picked}
        onValueChange={(next) => patch({ opens: next })}
        options={opens.choices.map((c) => ({ value: c.id, label: c.label, testid: `ads-new-opens-${c.id}` }))}
      />
      <p className="ads-new-address" data-testid="ads-new-opens-address">
        {picked ? picked.address : null}
      </p>
      <Cap>{opens.note}</Cap>
    </Sec>
  );
}

/** Google: what people search, as read-only words, and what is left out for the owner. */
export function SearchSec({ vm }: StepProps) {
  const search = vm.search;
  if (search === null) return null;
  return (
    <Sec label={search.label}>
      <ul className="ads-new-themes" data-testid="ads-new-themes">
        {search.themes.map((theme) => (
          <li key={theme} className="ads-new-theme">
            {theme}
          </li>
        ))}
      </ul>
      <Cap>{search.leftOut}</Cap>
      <Cap>{search.note}</Cap>
    </Sec>
  );
}

/** Who the ad is shown as: read from the connection, changed in Settings. */
export function ShownAsRow({ vm }: StepProps) {
  const s = vm.shownAs;
  return (
    <div className="ads-new-shownas" data-testid="ads-new-shown-as">
      <p className="ads-new-shownas-words">
        <span className="ads-new-shownas-k">{s.label}</span> <span className="ads-new-shownas-v">{s.line}</span>
        {s.limit ? <span className="ads-new-dim"> · {s.limit}</span> : null}
      </p>
      <LinkButton className="ads-new-shownas-door" {...routeDoor(s.door.to)} data-testid="ads-new-shown-as-door">
        {s.door.words}
        <Icon name="chevron" size={11} />
      </LinkButton>
    </div>
  );
}

/** A form's details: Name and Phone filled in for them, one dropdown of services if asked, the privacy page, how it ends. */
export function FormSec({ vm, state, patch, setExtra }: StepProps) {
  const { extra, draft } = state;
  const [viaWhatsapp, viaCall, nothing] = NEW_AD.step2.completions;
  const groups: PickerGroup<Completion>[] = [
    {
      options: [
        { value: "whatsapp", label: viaWhatsapp },
        { value: "call", label: viaCall },
        { value: "none", label: nothing },
      ],
    },
  ];
  const missing = extra.privacy.trim() === "";
  return (
    <Sec label={NEW_AD.step2.formFields}>
      <Cap>{NEW_AD.step2.formFilled}</Cap>
      <OnOffRow
        label={NEW_AD.step2.askService}
        hint={NEW_AD.step2.askServiceHint}
        checked={extra.askService}
        onChange={(askService) => setExtra({ askService })}
        testid="ads-new-ask-service"
      />
      <OnOffRow
        label={NEW_AD.step2.doubleCheck}
        checked={draft.doubleCheck}
        onChange={(doubleCheck) => patch({ doubleCheck })}
        testid="ads-new-double-check"
      />
      <Field
        label={NEW_AD.step2.privacyLink}
        type="url"
        value={extra.privacy}
        onValueChange={(privacy) => setExtra({ privacy })}
        placeholder={NEW_AD.step2.privacyPlaceholder}
        spellCheck={false}
        data-testid="ads-new-privacy"
        {...(missing
          ? { problem: NEW_AD.step2.privacyNeeded, problemGlyph: <Icon name="alert" size={13} /> }
          : { hint: NEW_AD.step2.privacyHint })}
      />
      <Ctl label={NEW_AD.step2.completion}>
        <Picker
          label={NEW_AD.step2.completion}
          value={extra.completion}
          onValueChange={(completion) => setExtra({ completion })}
          groups={groups}
          chevron={cmChevron()}
          data-testid="ads-new-completion"
        />
      </Ctl>
      <OnOffRow
        label={NEW_AD.step2.thanks}
        hint={NEW_AD.step2.thanksHint(vm.ad.copy.thanks)}
        checked={draft.thanks}
        onChange={(thanks) => patch({ thanks })}
        testid="ads-new-thanks"
      />
      {draft.thanks ? <Cap>{NEW_AD.step2.thanksOnNote}</Cap> : null}
      <Cap>{NEW_AD.step2.consentOn}</Cap>
      <Cap>{NEW_AD.step2.consentCounsel}</Cap>
    </Sec>
  );
}

/** "Let Meta adjust my photo and wording": off, so the photo and words stay the owner's; on, what it would change. */
export function AdjustRow({ state, patch }: StepProps) {
  const on = state.draft.adjust;
  return (
    <OnOffRow
      label={NEW_AD.step2.adjust}
      hint={on ? NEW_AD.step2.adjustWhat : NEW_AD.step2.adjustOff}
      checked={on}
      onChange={(adjust) => patch({ adjust })}
      testid="ads-new-adjust"
    />
  );
}
