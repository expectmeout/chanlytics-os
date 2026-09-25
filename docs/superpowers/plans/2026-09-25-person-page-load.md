# A person's page loads as fast as it can

Measured on production, 25 Sep 2026 (`/w/melanys-beauty-salon#/clients/<id>`, desktop, one place), then fixed in
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
3. **The session verified locally**: `getClaims()` in the proxy, the route wrapper and the layout, over asymmetric
   signing keys (Ruben enables the keys in the Supabase dashboard; the code path works either way).
4. **MapLibre out of the boot chunk**: imported when the Leads map opens.
5. **One person, fewer round trips**: `contacts/[id]` runs its id-keyed queries in the first wave, not the third;
   `Server-Timing` on the answer.
6. **A shell summary** for the badge and the bell, instead of three lists.
7. **Field data**: web vitals from real devices (Ruben's call on Speed Insights).

The structural one — a real server route for a person, streamed — is Ruben's.

## Status

- [x] 1. Boot discipline
- [ ] 2. Preload and prefetch
- [ ] 3. getClaims
- [ ] 4. MapLibre lazy
- [ ] 5. Person in fewer waves
- [ ] 6. Shell summary
- [ ] 7. Field data
