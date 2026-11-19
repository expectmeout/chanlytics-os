/**
 * What an ad said where a person tapped it (decision 0049, step P0a): the shape `ad_entries.said` holds, and the one
 * that crosses from the reader of a referral (channels) to the door that keeps it (db) and on to the page that names the
 * ad. A part the ad did not say, or said in a shape that is not kept, is left out, never null.
 */
export interface AdSaid {
  headline?: string;
  /** The ad's own words. */
  body?: string;
  /** The platform's word for the ad's media: Meta's are `image` and `video`. */
  media_type?: string;
  /** The ad's own address at its platform, as the referral gave it. Never a click id. */
  link?: string;
}
