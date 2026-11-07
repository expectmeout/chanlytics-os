# @chanlytics/channels

The providers' wires: Meta, Twilio, Retell, ElevenLabs, Resend, Gmail and Graph, Google, Apify, Anthropic. An adapter owns
a provider's wire format and knows nothing about threads. No persistence and no decisions.

## What is where

Each folder's `index.ts` is its entry: `@chanlytics/channels/lines` (decision 0110). There is no root.

One folder a provider or domain: `whatsapp/`, `instagram/`, `lines/`, `voice/`, `email/` (with `email/mailbox/`),
`google/`, `leads/`, `models/`, `site/`, `files/`, `inbound/`.

- `shared/`: the one way a call leaves for a provider (`provider-fetch.ts`) and a fetch of an address a person typed
  (`public-fetch.ts`).
- `log/` and `tokens/`: the platform's one logger, and its signed tokens.

## What it may import

`@chanlytics/contracts` alone.

## Tests

`tests/<domain>/`. The canonical adapter is `packages/channels/src/lines/sms.ts`.
