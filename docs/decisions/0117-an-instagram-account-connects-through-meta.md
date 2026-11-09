# 0117 · An Instagram account connects through Meta

**Status:** Accepted by Ruben, 9 November 2026 ("Yes, build M1", on the Meta link PRD's recommendation for D1, D2, D3 and D13), and built as its first piece, the connection. Posting, trending sounds, comments and numbers are its later pieces, each its own change. No migration.

## Context

Decision 0001, step 8, connected a business's Instagram professional account through Instagram's own login: a 60-day token the sweep refreshes, `graph.instagram.com`, and DMs alone. What the content plan asks of the account next (a Reel posted with a trending sound, comments answered privately, each post's numbers) needs more of Meta than that login gives: Instagram's own login cannot reach the Audio API or ads at all.

Meta now offers three setups for the Instagram Platform, read on its pages on 8 and 9 November 2026 (the PRD, kept outside this repository, `docs/2026-11-08-meta-link-prd.md`, names each page). The one Meta names for new integrations, the Instagram API with Unified Login, signs the owner in with Instagram or Facebook in Facebook Login for Business's dialog, opened with the app's saved configuration (`config_id`). It needs no Facebook Page, and it answers with a Business Integration System User token that belongs to the business's portfolio and does not expire unless the configuration says so. It asks one thing the old login did not: a Meta business portfolio with the account in it.

## Decision

1. **One account, one row, whichever login connected it.** The Meta link writes the account's existing `tenant_channels` row (kind `instagram`, `external_id` the account's id) and its Vault slot, with `login: "meta"` on both. DMs route exactly as before; a row taken over from Instagram's own login keeps its id, its threads and its people.
2. **The way in is Unified Login.** The dashboard signs a state naming the workspace, the person and Meta, and sends the owner to `www.facebook.com/v27.0/dialog/oauth` with the app's `config_id`. The edge's door, `POST /api/admin/meta/connection`, trades the code with the Meta app's id and secret, asks `debug_token` what the token may do, reads the one account the business shared (`/me/assigned_instagram_accounts`; several are refused with the list, and Meta's own dialog is where one is chosen), and subscribes it on Facebook's host for the webhook fields its permissions allow. A token without the account and its DMs keeps nothing.
3. **Every call with the business's token carries `appsecret_proof`**, the token's HMAC-SHA256 keyed by the app's secret. A DM from such an account, and a person's profile read, go to `graph.facebook.com` with it; an account on Instagram's own login still goes to `graph.instagram.com`.
4. **The token is checked, not refreshed.** The Instagram token sweep asks `debug_token` once a day of a Meta token. One Meta no longer takes is said exactly as a lapsed Instagram token is; what it may still do is kept on the row as `scopes`.
5. **What the connection may do is made from the token, at read time, by one reader** (contracts `metaLinesOf`): messages, posting, trending sounds, comments, numbers. Connections says them as what Meta allowed, never as what works, until each is built.
6. **It is offered where a workspace's switch is on** (`content_preview`, contracts `contentPreviewOf`), read by the edge, since a member may not read the config. Off, Connections draws the Instagram row as before and the door refuses (`meta_off`). On for Chanlytics' own workspace until Meta's App Review passes.
7. **A working account is never quieted by a failed move.** A connect over this workspace's own row puts the row back as it was when the Vault will not keep the new token. Once Meta's subscription stands, the old login's is removed, best effort, so Meta sends each DM once; a duplicate is taken once by the replay gate meanwhile.

## What it does not change

The webhook door (`/api/instagram`), its signature check with either app's secret, the replay gate, the inbound shape, the reply window, Autonomy and the send door are as they were. A `changes[]` delivery (a comment, a mention, a story's numbers) is logged as its own kind and asks nothing of anyone until comments come into Inbox.

## Amends

Decision 0001, step 8: an Instagram account may be connected through Meta's Unified Login as well as Instagram's own, on the same row.
