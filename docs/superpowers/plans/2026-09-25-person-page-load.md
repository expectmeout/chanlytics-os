# A person's page loads as fast as it can

Measured on production, 25 Sep 2026 (`/w/<slug>#/clients/<id>` on the first customer's workspace, desktop, one place), then fixed in
the order of what each costs the reader. Approved by Ruben the same day ("continue as you best suggest").

## What a cold load looked like

| Moment                  |    ms | What is happening                                                      |
| ----------------------- | ----: | ---------------------------------------------------------------------- |
| First byte of HTML      |    26 | Vercel's edge                                                          |
| HTML complete           |   941 | The `(os)` layout awaits `supabase.auth.getUser()` before the body     |
| Hydrated                | 1,086 |                                                                        |
| Legacy chunk starts     | 1,361 | A `dynamic()` import, after hydration; 762 KB brotli, 2.65 MB raw      |
| Shell mounts, first API | 2,033 | Nothing was fetched before this                                        |
| Ten reads in flight     | 2,113 | Every surface boots, four lanes at a time                              |
| The person lands        | 5,300 | `contacts/<id>` took 3,236 ms in that crowd; 773 ms on its own         |

26 to 30 API calls, ~520 KB of JSON; conversations, calls, templates and the person read twice. Every request pays
two round trips to Supabase Auth on the server (`proxy.ts` and `with-route.ts` both `getUser()`), the page a third.
With a warm HTTP cache the shell mounts at ~450 ms and the person lands at ~1.2 s.

## The sequence

Each is one PR, merged on green, measured again on production after it lands.

1. **Boot discipline** (`surface-runner.ts`, `people-detail.ts`): the boot is two passes. The page's own surfaces
   (who is looking, its own, what it draws beside it) first; the strangers once those and the page's own read
   (`bootWaitsFor`) are in, or after the route's wait. — this PR
2. **Nothing waits for hydration to start**: the legacy chunk preloaded as the framework's chunks load; the route's
   own reads started from the document head and adopted by the bridge.
3. **The session verified locally**: `getClaims()` in the proxy, the route wrapper and the layout, over the project's
   asymmetric signing keys (it already had them; `getUser()` was paying a round trip it never needed).
4. **MapLibre out of the boot chunk**: imported when the Leads map opens.
5. **`Server-Timing` on every answer**: the session check and the handler, apart (the person route already ran its
   id-keyed queries in one round; only the thread reads wait for the conversation ids).
6. **A shell summary** for the badge and the bell, instead of three lists.
7. **Field data**: web vitals from real devices (Ruben's call on Speed Insights).

The structural one — a real server route for a person, streamed — is Ruben's.

## What it looks like now

Measured again on production after 1, 2, 3 and 5 landed (f38665a4; the tab in front, an empty cache, one place):

| Moment                    |        Before |                                           Now |
| ------------------------- | ------------: | --------------------------------------------: |
| First API request leaves  |      2,033 ms |          1,097 ms, with the HTML (the head's) |
| Shell chunk downloads     | 1,361–1,806 ms |                                 1,223–1,516 ms |
| Person read               | 3,236 ms among ten |                       1,709 ms, read once |
| The person lands          |        ~5.3 s |                                        ~2.8 s |
| Boot                      | 25 surfaces at once | the page's own first; the rest at 3.5 s |

`Server-Timing` on a warm function instance: `auth;dur=2, app;dur=205` for the person, so the session check is already
local (the project signs with asymmetric keys; the first call on a fresh instance pays the JWKS fetch, ~120 ms) and the
handler itself is a fifth of a second. The cold-load figures above were taken right after a deploy, on cold function
instances; a warm read of the person answers the browser in ~300 ms.

Still to be had: the HTML completes ~1.1 s after its 30 ms first byte (a cold page function; the layout's check is no
longer the reason), the person's ~18 queries run in one round from `iad1` against the database's region, and the
shell's badge and bell still read three full lists (6).

## Status

- [x] 1. Boot discipline (#1070)
- [x] 2. Preload and prefetch (#1071)
- [x] 3. getClaims (#1072); the project already signs with asymmetric keys, so it is local from the first deploy
- [x] 4. MapLibre lazy (#1074)
- [x] 5. Server-Timing (#1075); the person route already ran in one round, so this is the visibility, not fewer waves
- [ ] 6. Shell summary
- [ ] 7. Field data
