import { z } from "zod";

// No code from strings, anywhere. zod 4 probes `Function("")` at first use to
// decide whether to compile object parsers with the Function constructor; under
// a Content-Security-Policy without 'unsafe-eval' the probe itself is a
// violation the browser reports on every page (the nightly saw two per page),
// and the compiled path buys nothing at this size. jitless keeps the same
// parsers on the interpreted path and the policy quiet, on the edge and in the
// browser alike, since every consumer imports this package first.
z.config({ jitless: true });

export * from "./envelope";
export * from "./errors";
export * from "./phone";
export * from "./enums";
export * from "./consent";
export * from "./viewmodels";
export * from "./policy";
export * from "./standing";
export * from "./time";
export * from "./today";
export * from "./config";
export * from "./whisper";
export * from "./brain";
export * from "./notifications";
export * from "./ask";
export * from "./availability";
export * from "./feed-url";
export * from "./line-failure";
export * from "./people";
export * from "./broadcasts";
export * from "./templates";
export * from "./playbooks";
export * from "./template-library";
export * from "./refusal";
export * from "./clock";
export * from "./campaign-report";
export * from "./calendar";
export * from "./calendar-people";
export * from "./call-words";
export * from "./channels";

export * from "./reports";
export * from "./live";
export * from "./setup";
export * from "./capabilities";
export * from "./forwarding";
export * from "./facts";
export * from "./identity";
export * from "./workspace";
export * from "./chrome";
export * from "./google";
export * from "./connections";
export * from "./platform";
export * from "./consent-page";
export * from "./retention";
export * from "./activity";
export * from "./business-page";
export * from "./a2p-enums";
export * from "./registration-path";
export * from "./business-record";
export * from "./review-reply";
export * from "./signup";
export * from "./password";
export * from "./billing";
export * from "./schema-sets";
export * from "./schema-sets.generated";
export * from "./tone";
export * from "./erasure";
