# Ask Rewired against primary sources (25 Sep 2026)

Scope: the "Ask Rewired" proposal for the Chanlytics OS in-app assistant (⌘K palette; one Anthropic Messages API turn on `claude-sonnet-5`, `output_config.effort: "low"`, adaptive thinking, `output_config.format` for the answer, 26 non-strict tools every round, `tool_choice: auto` with `none` on the forced last round, ≤4 rounds in 45 s, streaming, two cache breakpoints, RLS reads, "act" tools that return a card, an application-level read set for citations). Every claim below is traced to the page that owns it; all pages were read on 25 September 2026. Where a claim rests on the bundled Anthropic skill reference (cached June 2026) rather than a live page it is marked "(bundled reference, June 2026)"; where the two disagree, the live docs win and the disagreement is stated.

## Verdicts in ten lines

1. Tool use: **CHANGE** — two-sentence descriptions are below the documented bar (at least 3–4 sentences, with when/when-not); ~35 tools sits past the documented 20-tool tool-search threshold and inside the 30–50 degradation band; the 20-strict/24-optional caps are undocumented (your 23 Sep measurement is the only source); the tool-search model table omits `claude-sonnet-5` — verify before relying on `defer_loading`.
2. Structured outputs + tools: **CONFIRM** the combination; **REFINE** for streaming (no partial-JSON guarantee for `output_config.format`; put the prose field first, parse tolerantly) and for the grammar-cache key (schema structure + tool set, frozen per role).
3. Prompt caching: **CONFIRM** a third breakpoint (4 allowed; sections that change at different rates are the documented reason); **CHANGE** its shape — Sonnet 5 has no `role: "system"` messages, and customer-authored rows must not sit in `system`; **REFINE** the `warm` route — `max_tokens: 0` is rejected with `output_config.format`, and a format-less warm may write an entry the real request never reads.
4. Context engineering: **CONFIRM** page-context prefetch as the documented hybrid ("some data up front for speed, more via tools"); **REFINE** the payload to identifiers + names + a few high-signal fields, with concise reader output.
5. Grounding: **CONFIRM** the application-level read set — API citations (document and `search_result` blocks) return 400 with `output_config.format`; **REFINE** by carrying rows in `search_result`/`document` envelopes with stable `source` ids and citations disabled.
6. Memory / multi-turn: **CONFIRM** that the memory tool, context editing and compaction are not for this assistant; **REFINE** replay — verbatim (append-only) while the cache is warm, a compact rebuild only on a cold reopen, then append-only.
7. Effort / adaptive thinking: **CONFIRM** `low` + adaptive on Sonnet 5; **REFINE** — pin effort per route (the warm included), never change it mid-thread (no per-message effort on Sonnet 5), steer per question with a user-turn phrase, keep a measured `medium` fallback route.
8. Evals: **REFINE** — the scripted-model CI run is a harness test, not an eval; the production gate needs the real model at production config on a held-out set with reps and confidence intervals, outcome grading, pass^k for must-never behaviours, a judge on a different model, Batch API for single-turn cases.
9. MCP: **REFINE** — do not build an MCP surface now (the Anthropic connector consumes tools only); keep the registry MCP-shaped (name/description/inputSchema, optional outputSchema, deterministic order) so a later `tools/list` is a projection; page context is conceptually an application-controlled MCP resource, and cards are MCP's mandated human-in-the-loop.
10. Latency: **REFINE** "first words ≤2 s" — the documented levers for Sonnet 5 are cache warmth on the shared prefix, `display: "omitted"` (already the default), low effort, a small schema and no tool on the hot path; fast mode is Opus-only and Priority Tier is not available on Sonnet 5.

---

## 1. Tool use: count, descriptions, tool search, strict caps, parallelism, streaming

### What the source says

- Tool descriptions are "by far the most important factor in tool performance"; a description should say what the tool does, when it should and should not be used, what each parameter means, and its caveats, and should run to "at least 3–4 sentences for each tool description, more if the tool is complex" (the second quote is the one quote for this page). The page also tells you to consolidate related operations into fewer tools with an `action` parameter, namespace names by service, and design responses that return semantic, stable identifiers and only the fields Claude needs. `input_examples` (schema-validated, ~20–50 tokens simple, ~100–200 nested) are the second lever. Tool names must match `^[a-zA-Z0-9_-]{1,128}$`. Changing `tool_choice` invalidates cached message blocks while tools and system stay cached. Forced tool use (`any`/`tool`) is rejected only on Opus 5.5, Fable 5.1 and Mythos 5.1; on Sonnet 5 with adaptive thinking it works. https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools (read 25 Sep 2026)
- Tool search (`tool_search_tool_regex_20251119`, `tool_search_tool_bm25_20251119`): selection accuracy "degrades once you exceed 30–50 available tools"; use it when you have 10 or more tools, definitions over 10k tokens, or a growing library; standard calling fits under 10 tools. Keep the 3–5 most used tools non-deferred. `defer_loading: true` controls what enters context, not what you send: every definition is still sent every request; the API excludes deferred tools from the system-prompt prefix and appends a `tool_reference` inline, so "the prefix is untouched" and caching is preserved; a deferred tool cannot carry `cache_control` (400); search returns 5 tools by default; the search runs as a server tool inside the same response (`server_tool_use` → `tool_search_tool_result` → `tool_use`), so it costs a server-side step, not a client round; it is not metered separately and discovered definitions bill as input tokens. The model-compatibility table lists Fable 5.1/5, Mythos 5.1/5, Opus 5.5/5/4.8/4.7/4.6/4.5, Sonnet 4.6/4.5 and Haiku 4.5 — `claude-sonnet-5` is absent from it. https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool (read 25 Sep 2026)
- Sonnet 5 "supports ... the same set of tools and platform features as Claude Sonnet 4.6, except Priority Tier" — which implies tool search, contradicting the omission above. https://platform.claude.com/docs/en/models/sonnet-5/whats-new-sonnet-5 (read 25 Sep 2026)
- Manage tool context: tool search fits "large toolsets (20+ tools) where most tools aren't needed every turn"; it "trades a small amount of latency (one extra turn to look up a tool)"; the suggested order for a high-volume agent is caching on day one, tool search "once your toolset grows past roughly 20 tools", context editing when conversations run long, programmatic tool calling for repetitive chains. https://platform.claude.com/docs/en/agents-and-tools/tool-use/manage-tool-context (read 25 Sep 2026)
- Advanced tool use (24 Nov 2025): a five-server MCP setup burned ~55K tokens in definitions; tool search cut Opus 4 from 49% to 74% and Opus 4.5 from 79.5% to 88.1% on an MCP eval; `input_examples` moved a complex-parameter eval from 72% to 90%; keep the three to five most-used tools always loaded. https://www.anthropic.com/engineering/advanced-tool-use (read 25 Sep 2026)
- Writing tools for agents (11 Sep 2025): fewer, consolidated tools; namespacing; semantic identifiers over UUIDs ("significantly improves precision"); a `response_format` enum with `concise`/`detailed` (72 vs 206 tokens in the Slack example); pagination, filtering and truncation with sensible defaults (Claude Code caps tool results at 25,000 tokens); error messages that say what to do next; evaluate tools on realistic multi-call tasks against held-out sets. https://www.anthropic.com/engineering/writing-tools-for-agents (read 25 Sep 2026)
- Parallel tool use: Claude 4+ parallelises by default; return one `tool_result` per `tool_use`, all in one user message, `tool_result` blocks before any text; a separate user message per result "teaches" Claude to stop parallelising; `disable_parallel_tool_use` lives inside `tool_choice` and, with `auto`, means at most one call. https://platform.claude.com/docs/en/agents-and-tools/tool-use/parallel-tool-use (read 25 Sep 2026)
- Handle tool calls: `tool_result.content` may be a string or `text`, `image`, `document` or `search_result` blocks; write instructive errors; keep untrusted content inside `tool_result` blocks "rather than `system` prompts or plain user `text` blocks"; Claude retries an invalid call 2–3 times. https://platform.claude.com/docs/en/agents-and-tools/tool-use/handle-tool-calls (read 25 Sep 2026)
- Troubleshooting: differentiate tools by WHEN to use them; `strict: true` or `input_examples` for invented parameters; instructions delivered inside a `tool_result` are treated as potentially untrusted third-party content; `Unsupported regex feature in pattern field` is the only strict-mode 400 listed. No cap on the number of strict tools or optional parameters appears here. https://platform.claude.com/docs/en/agents-and-tools/tool-use/troubleshooting-tool-use (read 25 Sep 2026)
- Strict tool use: `strict: true` guarantees schema-valid inputs and valid names; schemas compile into grammars cached up to 24 hours; `strict` is refused on toolset entries; no numeric limit on strict tools or optional parameters is stated. https://platform.claude.com/docs/en/agents-and-tools/tool-use/strict-tool-use (read 25 Sep 2026)
- Tool reference: the optional per-tool properties are `cache_control`, `strict`, `defer_loading`, `allowed_callers`, `input_examples`, `eager_input_streaming`; "Tools with `defer_loading: true` are stripped from the rendered tools section before the cache key is computed"; no count limits. https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-reference (read 25 Sep 2026)
- API errors page: lists forced-tool-use, prefill, thinking and computer-use 400s; nothing about strict-tool or optional-parameter caps. https://platform.claude.com/docs/en/api/errors (read 25 Sep 2026)
- Overview: the tool-use system prompt costs 354 tokens on Sonnet 5 with `auto`/`none` (474 with `any`/`tool`); the trigger boundary is steerable from the system prompt. https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview (read 25 Sep 2026)
- Fine-grained streaming: `eager_input_streaming: true` per user-defined tool, GA on all models; it removes server-side buffering and validation so fragments of a large parameter arrive sooner, at the cost of possibly invalid or truncated JSON you must guard. https://platform.claude.com/docs/en/agents-and-tools/tool-use/fine-grained-tool-streaming (read 25 Sep 2026)
- Effort with tool use: lower effort combines operations into fewer tool calls, makes fewer calls, skips preamble. https://platform.claude.com/docs/en/build-with-claude/effort (read 25 Sep 2026)
- Sonnet 5 "is more agentic than Claude Sonnet 4.6 by default" and reaches for tools readily; with thinking disabled it is less likely to; `high`/`xhigh` show substantially more tool use. https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-sonnet-5 (read 25 Sep 2026)
- Bundled reference: "Limit tool count: Too many tools can confuse the model - keep the set focused"; be prescriptive about when to call a tool; default `eager_input_streaming: true` on streamed requests. The live fine-grained-streaming page frames the feature as a large-parameter latency lever, so the bundled "default on" rule is superseded for small-input tools (bundled reference, June 2026: `shared/tool-use-concepts.md`).
- Bundled reference: mid-conversation tool changes (`tool_addition`/`tool_removal`, beta `mid-conversation-tool-changes-2026-07-01`) are "not Claude Sonnet 5" (bundled reference, June 2026: `shared/tool-use-concepts.md`).
- The 24-optional-parameter 400 is mentioned only by a third-party post (answer.ai, 20 Jan 2026) surfaced by search; it is not a primary source and is recorded here only to say that no Anthropic page documents the cap.

### Implication for Ask Rewired

- **CHANGE** descriptions: not two sentences. Each tool gets 3–4+ sentences: what it reads, when to call it and when not (name the neighbouring tool), what it returns (ids + names + the fields), limits (page size, date range). Add `input_examples` to the 3–5 tools with format-sensitive inputs (date windows, channel enums).
- **CHANGE** the count: ~35 is past the 20-tool threshold at which the docs say to add tool search and near the 30–50 band where selection degrades. Two acceptable shapes: (a) consolidate to ≤20 per role with `action`-parameter tools (`people` with `action: search|get|timeline`), strict OFF; or (b) keep ~35 but mark the long tail `defer_loading: true` behind `tool_search_tool_bm25_20251119`, keeping the 3–5 hot readers loaded. Before choosing (b), send one probe request on `claude-sonnet-5` with a deferred tool: the tool-search page does not list Sonnet 5 even though the what's-new page implies support. Deferred tools cannot carry `cache_control`, so the tools breakpoint goes on the last non-deferred tool.
- **CONFIRM** "one deterministic set per role": send the same array, same order, deterministic JSON (`tools_changed` in cache diagnostics is exactly the failure this prevents). Never vary the set per person, page or surface.
- **CONFIRM** parallel reads with all results in one user message; do not set `disable_parallel_tool_use` (changing it also invalidates the messages cache).
- **CONFIRM** `tool_choice: none` on the forced last round, with its documented cost: that round misses the messages cache (tools+system still hit). For ≤4 short rounds this is small; measure `cache_read_input_tokens` on the last round before optimising it away.
- **REFINE** strict: keep OFF for the registry as measured; the caps are empirical, not documented, so re-measure after each API version rather than encoding "20/24" as a spec.
- **REFINE** `eager_input_streaming`: enable only on card ("act") tools whose inputs carry long text you want to render as it is written; validate before rendering; leave it off on readers.

## 2. Structured outputs combined with tools

### What the source says

- `output_config.format` (`type: "json_schema"`) and `strict: true` share the same grammar pipeline; combined, "Claude may call the tool first (`tool_use`) or respond with JSON". Grammar compilation adds latency on the first use of a schema; compiled grammars are cached 24 hours from last use; the grammar cache is invalidated by a change to the schema structure or to the set of tools in the request (when both features are used), not by `name`/`description` edits. Structured outputs inject an extra system prompt (billed), and "Changing the `output_config.format` parameter will invalidate any prompt cache for that conversation thread". Supported: basic types, `enum` (primitives only), `const`, `anyOf`/`allOf` (no `allOf` with `$ref`), local `$ref`, `default`, `required`, `additionalProperties: false` (mandatory on objects), string formats `date-time`/`time`/`date`/`duration`/`email`/`hostname`/`uri`/`ipv4`/`ipv6`/`uuid`, `minItems` 0 or 1. Not supported: recursive schemas, external `$ref`, `minimum`/`maximum`/`multipleOf`, `minLength`/`maxLength`. No schema-size cap is documented. No beta header. `claude-sonnet-5` is in the supported list. https://platform.claude.com/docs/en/build-with-claude/structured-outputs (read 25 Sep 2026)
- Citations and structured outputs are incompatible: citations enabled on any `document` or `search_result` block together with `output_config.format` returns a 400. https://platform.claude.com/docs/en/build-with-claude/citations (read 25 Sep 2026)
- Streaming: `tool_use` inputs stream as `input_json_delta` partial-JSON strings; current models emit "one complete key and value property from `input` at a time"; parse with a partial-JSON parser or the SDK accumulators. The page says nothing about partial JSON for `output_config.format` text. https://platform.claude.com/docs/en/build-with-claude/streaming (read 25 Sep 2026)
- `max_tokens: 0` (pre-warm) is rejected with `output_config.format`; a compaction request rejects `output_config.format` too. https://platform.claude.com/docs/en/build-with-claude/prompt-caching and https://platform.claude.com/docs/en/build-with-claude/compaction-on-demand (read 25 Sep 2026)
- Refusals (`stop_reason: "refusal"`) may not match the schema; `max_tokens` truncates the JSON; the SDK `parse()` helpers strip unsupported constraints and validate client-side; works with Batches, streaming, token counting and thinking (bundled reference, June 2026: `shared/tool-use-concepts.md` § Structured Outputs).
- Sonnet 5 rejects assistant prefill; use structured outputs or system instructions instead. https://platform.claude.com/docs/en/models/sonnet-5/whats-new-sonnet-5 (read 25 Sep 2026)

### Implication for Ask Rewired

- **CONFIRM** one request shape with tools + `output_config.format`.
- **REFINE** streaming: order the schema so the user-visible prose field is the first property, keep it a flat string, and parse the `text_delta` stream with a tolerant partial-JSON parser; do not promise "first words" from the JSON stream until measured, because the docs give no partial-JSON guarantee for `output_config.format`.
- **REFINE** the grammar key: the answer schema and the tool set are one compiled artifact per role; changing either recompiles (first-request latency) and changing the format invalidates the thread's prompt cache. Freeze both per role; version them with the role prefix; do not add per-surface schema variants.
- **REFINE** the schema: no numeric bounds or string lengths (validate in the app, as the SDK does), `additionalProperties: false` everywhere, shallow nesting, enums of primitives for citation kinds.
- Handle `stop_reason: "refusal"` (HTTP 200) and `max_tokens` as non-JSON outcomes on the client.

## 3. Prompt caching: breakpoints, minimums, order, TTL, warm, system vs user

### What the source says

- Up to 4 `cache_control` breakpoints; minimum cacheable prefix 1,024 tokens on Sonnet 5 (512 on Opus 5.5/5, Fable 5.1/5); prefix hierarchy `tools` → `system` → `messages`; tool-definition changes invalidate everything, `tool_choice` and `disable_parallel_tool_use` and images invalidate messages, thinking and `output_config.effort` invalidate messages always and tools/system on some models, `speed` invalidates system and messages; the lookback window is 20 blocks with consecutive `tool_use` runs and consecutive `tool_result` runs each counting as one position; multiple breakpoints exist for "sections that change at different frequencies"; top-level `cache_control` auto-places a breakpoint on the last cacheable block; concurrent requests only read an entry after the first response begins; caches are per workspace; 5-minute default, `ttl: "1h"` must precede 5-minute entries; Sonnet 5 pricing $2.50/MTok 5m write, $4/MTok 1h write, $0.20/MTok read. Pre-warming: `max_tokens: 0` writes the cache and returns `content: []`; place the breakpoint on the last block shared with the follow-up, match thinking and effort, and it is rejected with `stream: true`, `thinking.type: "enabled"`, `output_config.format`, forced `tool_choice`, or inside a batch. Mid-conversation `role: "system"` messages: "This feature is not available on Claude Sonnet 5. Use the top-level `system` field instead." https://platform.claude.com/docs/en/build-with-claude/prompt-caching (read 25 Sep 2026)
- Mid-conversation system messages: supported on Fable 5.1/5, Mythos 5.1/5, Opus 5.5/4.8/5; explicitly not on Sonnet 5; they preserve the prefix, carry operator authority, and are the documented channel for per-turn context, state changes and turn-scoped reminders (`clear_at: "next_user_message"`). https://platform.claude.com/docs/en/build-with-claude/mid-conversation-system-messages (read 25 Sep 2026)
- Tool use with prompt caching: `cache_control` on the last tool caches the whole tools prefix; deferred tools are appended inline as `tool_reference`; server-tool results get an automatic 5-minute breakpoint. https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-use-with-prompt-caching (read 25 Sep 2026)
- Cache diagnostics (GA, Claude API only): send `diagnostics: {previous_message_id}` on every turn; the response's `cache_miss_reason` is one of `model_changed`, `system_changed`, `tools_changed`, `messages_changed`, `previous_message_not_found`, `unavailable` (the last also covers `tool_choice`/`thinking`/`output_config`/beta-header differences); the `cache-diagnosis-2026-04-07` header is no longer required. https://platform.claude.com/docs/en/build-with-claude/cache-diagnostics (read 25 Sep 2026)
- Effort/thinking: "The resolved effort value is rendered into the prompt, so changing it between requests invalidates cache breakpoints"; setting the default explicitly equals omitting it; per-message steering text in the newest user turn leaves earlier breakpoints intact. https://platform.claude.com/docs/en/build-with-claude/thinking-steering-and-cost (read 25 Sep 2026)
- Untrusted content belongs inside `tool_result` blocks, not `system` or plain user text (Handle tool calls, above); instructions inside tool results are treated as untrusted (Troubleshooting, above).
- Bundled reference: classify inputs by stability (never / per-session / per-turn / per-request) and render in that order; keep the system prompt frozen and inject dynamic context later; a per-user prefix means no cross-user sharing; don't cache prompts that differ from the first kilobyte; skip pre-warming when "you'd pre-warm many distinct prefixes speculatively"; for a request that carries `output_config.format` the keep-alive cannot be reshaped, so "use the 1-hour TTL instead"; the robust agent-loop combination is one explicit breakpoint on the static prefix plus top-level automatic caching for the tail (bundled reference, June 2026: `shared/prompt-caching.md`).

### Implication for Ask Rewired

- **CONFIRM** a third breakpoint: three sections that change at different rates (rules+facts: never; snapshot: every 20 s; page context: per palette open) is the textbook case, and four breakpoints are available.
- **CHANGE** the block's home: it cannot be a mid-conversation system message on Sonnet 5, and it should not be a system block at all, because it is built from rows that include customer-authored text (message bodies). Put the page context at the start of the first user turn as data — `document` blocks (type `text`, with `title`/`context`) or `search_result` blocks (citations disabled) — with `cache_control` on the last of them. `system` keeps rules, facts and the workspace snapshot; the clock/person block follows the context block, uncached.
- **REFINE** the `warm` route: it must omit `output_config.format` and `stream` (both rejected with `max_tokens: 0`) and match `thinking` and `effort` exactly. Because the docs say a format change invalidates the thread's cache and do not say where the format's injected system text renders, a format-less warm may write an entry the format-bearing request never reads. Measure once: warm, then a real request, and check `cache_read_input_tokens` covers tools+system+snapshot+context. If it does not, either warm with a real minimal request that carries the format (`max_tokens: 1`, non-streaming) or warm only the shared prefix (tools+system+snapshot) and send the page context uncached — it is small if kept to identifiers.
- **REFINE** the economics: a per-person breakpoint is never shared across people; it pays only if the same person asks again within the TTL. Instrument palette-open → question conversion; if most opens produce one question, the third breakpoint mostly writes (1.25× on the context tokens) and never reads — keep the context but drop its `cache_control`.
- **REFINE** the snapshot: make it byte-stable when data has not changed (no timestamps or counters inside it) so a 20-second cadence does not become a 20-second rewrite.
- **REFINE** telemetry: add `diagnostics.previous_message_id` in development and staging to prove all three breakpoints read; log `cache_read_input_tokens`, `cache_creation_input_tokens`, `input_tokens` per round.
- Minimum size is per prefix, not per block: the cumulative prefix at each breakpoint must be ≥1,024 tokens (already true after the tools block); Sonnet 5's tokenizer yields ~30% more tokens than Sonnet 4.6 for the same text.

## 4. Context engineering and agent design

### What the source says

- Effective context engineering (29 Sep 2025): context rot and a finite attention budget; the goal is "the smallest possible set of high-signal tokens"; two retrieval modes — pre-inference retrieval and just-in-time retrieval by lightweight identifiers (paths, queries, links) — and the hybrid: retrieve some data up front for speed, explore further at the agent's discretion; Claude Code pre-loads CLAUDE.md and uses grep/glob at runtime; JIT is slower but never stale, pre-loading is faster but risks staleness; tools should be a minimal, non-overlapping, token-efficient set; compaction, structured note-taking and sub-agents are for long horizons. https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents (read 25 Sep 2026)
- Building effective agents (19 Dec 2024): start with simple prompts and add agentic machinery only when simpler solutions fall short; workflows (routing, parallelisation, orchestrator-workers, evaluator-optimizer) versus agents; invest in the agent-computer interface as in a human interface, with examples and "poka-yoke" argument design; customer support is a natural fit. https://www.anthropic.com/engineering/building-effective-agents (read 25 Sep 2026)
- Harness design for long-running apps (24 Mar 2026): every harness component "encodes an assumption about what the model can't do on its own"; stress-test and remove components that stop being load-bearing as models improve; separate generator from evaluator. https://www.anthropic.com/engineering/harness-design-long-running-apps (read 25 Sep 2026)
- Effective harnesses for long-running agents (26 Nov 2025): initializer + progress files + feature lists across context windows; nothing here applies to a single-question assistant. https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents (read 25 Sep 2026)
- Scaling Managed Agents (8 Apr 2026): a session log outside the context window; the harness transforms context before each call; removing container provisioning cut TTFT p50 by ~60% and p95 by >90%. https://www.anthropic.com/engineering/managed-agents (read 25 Sep 2026)
- How we contain Claude (25 May 2026): "An agent with read-only DB access can be deployed far more broadly"; tool output is an attack surface even from trusted tools; users approved ~93% of permission prompts, so blanket approval prompts decay into fatigue. https://www.anthropic.com/engineering/how-we-contain-claude (read 25 Sep 2026)
- The "think" tool (20 Mar 2025): helps on policy-heavy sequential tool chains; no benefit for single or parallel calls. https://www.anthropic.com/engineering/claude-think-tool (read 25 Sep 2026)
- Code execution with MCP (4 Nov 2025): progressive disclosure of tool definitions and filtering results in code (150K → 2K tokens). https://www.anthropic.com/engineering/code-execution-with-mcp (read 25 Sep 2026)
- How tool use works: tools fit side effects, fresh data and structured shapes; they do not fit when "Tool-calling latency would dominate a trivial response". https://platform.claude.com/docs/en/agents-and-tools/tool-use/how-tool-use-works (read 25 Sep 2026)
- Customer support guide: RAG for large static context, tool use for real-time data, streaming for perceived latency, citations for grounding, human handoff as a task with its own accuracy target. https://platform.claude.com/docs/en/about-claude/use-case-guides/customer-support-chat (read 25 Sep 2026)
- Prompting best practices: explicit tool direction; parallel calls are default; long-context rule "put longform data at the top" and ground responses in quotes; context awareness on Sonnet 5. https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices (read 25 Sep 2026)
- Bundled reference: promote an action to a dedicated tool when you need to gate, render, audit or parallelise it; tool search appends rather than swaps definitions (bundled reference, June 2026: `shared/agent-design.md`).
- No engineering post between May and September 2026 changes the retrieval guidance; the newest engineering post on the index is 25 May 2026, and the 2026 newsroom entries (Code with Claude 6 May, Sonnet 5 30 Jun, Fable 5.1 1 Sep, Opus 5.5 22 Sep) are product launches. https://www.anthropic.com/engineering and https://www.anthropic.com/news (read 25 Sep 2026)

### Implication for Ask Rewired

- **CONFIRM** the page-context prefetch: it is the documented hybrid, and at `low` effort (fewer tool calls) it is what lets trivial questions finish in round one.
- **REFINE** its content: identifiers, display names and a handful of high-signal fields per on-screen row (status, last activity, owner), not full rows; the model fetches detail through readers. This is the "lightweight identifiers" half of the hybrid.
- **REFINE** readers' output: compact by default with a `detail: "concise" | "full"` parameter; stable semantic ids (`thread_…` plus the customer's display name); a hard page size and an explicit truncation note; error text that says what to try next.
- **CONFIRM** "act tools return a card": the docs promote gating side effects to dedicated tools and the containment post argues for read-only breadth plus explicit approval for writes. Keep approvals per card, not per read (approval fatigue is the documented failure).
- **REFINE** the plan's review loop: treat the prefetch, the third breakpoint and the tool registry as harness components to be stress-tested against Sonnet 5's baseline in the eval (Harness design, above); no think-tool, no sub-agents, no compaction for this shape.

## 5. Grounding and citations

### What the source says

- Citations work on `document` blocks (plain text, PDF, custom content) and on `search_result` blocks with `citations: {enabled: true}`; responses carry `char_location`, `page_location`, `content_block_location` or `search_result_location` citations with `cited_text` (not billed as output); all-or-nothing per request; "Citations and structured outputs are incompatible" — a 400 when citations are enabled on any document or search result alongside `output_config.format`. https://platform.claude.com/docs/en/build-with-claude/citations (read 25 Sep 2026)
- `search_result` blocks (`source`, `title`, `content: [text…]`, optional `citations`, optional `cache_control`) can be returned from custom tools or placed in user turns; citations are disabled by default; a `tool_result` containing any `search_result` must contain only `search_result` blocks; text-only; `source` can be any stable string such as `kb://article-1234`; user messages only. https://platform.claude.com/docs/en/build-with-claude/search-results (read 25 Sep 2026)
- Reduce hallucinations: give permission to say "I don't have enough information", extract quotes before answering, verify claims against sources and retract unsupported ones, restrict to provided documents. https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/reduce-hallucinations (read 25 Sep 2026)
- Customer support guide: use citations to ground responses in provided information (above).

### Implication for Ask Rewired

- **CONFIRM** the application-level read set as the mechanism: with `output_config.format` in the request, API citations are unavailable by rule, so a server-side check that every cited id is in the rows returned this turn is the standard and only option.
- **REFINE** the envelope: return rows as `search_result` blocks with citations disabled (or `document` blocks), one per row, `source` = the stable row reference the schema's citation field must echo (`thread://<id>`, `call://<id>`, …), `title` = the display name. This gives the 12 citation kinds one uniform shape, keeps customer text inside a data block, and leaves the door open to API citations if a prose-only mode ever drops the schema.
- **REFINE** the prompt: allow "not enough information" as a first-class answer kind; a citation outside the read set is a hard failure the eval counts.

## 6. Memory and multi-turn

### What the source says

- Memory tool (`memory_20250818`, client-side, `/memories`): for context across sessions; when present the API injects "ALWAYS VIEW YOUR MEMORY DIRECTORY BEFORE DOING ANYTHING ELSE", i.e. a tool round at the start of every task; pair with context editing or compaction for long-running agents. https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool (read 25 Sep 2026)
- Context editing (`clear_tool_uses_20250919`, `clear_thinking_20251015`, beta `context-management-2025-06-27`): for long agentic sessions; clearing invalidates the cache from that point; server-side compaction is the recommended primary strategy. https://platform.claude.com/docs/en/build-with-claude/context-editing (read 25 Sep 2026)
- Compaction: for conversations approaching the window; on-demand (`compact-2026-09-04`, top-level `compaction`) returns a signed block that goes first in `messages`; the summarisation call rejects `output_config.format`; Sonnet 5 is supported. https://platform.claude.com/docs/en/build-with-claude/compaction and https://platform.claude.com/docs/en/build-with-claude/compaction-on-demand (read 25 Sep 2026)
- Thinking preservation: Sonnet 4.6 and later Sonnet models keep all prior thinking blocks; pass them back unmodified; within a tool-use turn they are required; on Fable 5.1/Opus 5.5 (and accounts created after 31 Aug 2026) a replayed thinking block is bound to an unchanged prefix, so integrations should be append-only regardless of model. https://platform.claude.com/docs/en/build-with-claude/thinking (read 25 Sep 2026)
- Cache diagnostics: `messages_changed` means history was truncated, edited or re-serialised — "Treat the history as append-only; echo assistant `content` and tool results back verbatim". https://platform.claude.com/docs/en/build-with-claude/cache-diagnostics (read 25 Sep 2026)
- Bundled reference: context editing is a context-window tool, not a savings lever; in the measured short run it cost more than it saved (bundled reference, June 2026: `shared/cost-optimization.md` § 2.3).

### Implication for Ask Rewired

- **CONFIRM** leaving the memory tool, context editing and compaction out: each is built for long-running agents and each would add a round or a cache miss to a two-second assistant.
- **REFINE** thread replay: while a thread is live (turns within the 5-minute TTL, or 1 hour if you pay the 2× write), replay the exact assistant content and tool results — that is what keeps the cache and the thinking blocks valid. When a thread is reopened cold (next day), rebuilding history compactly from the stored cards/outcomes/cited ids is legitimate because there is no cache to lose — but from that rebuild on, the session is append-only again. Never rewrite earlier turns inside a live session. Bound what is replayed (last N turns) rather than the full 90 days.

## 7. Effort and adaptive thinking on Sonnet 5

### What the source says

- Sonnet 5 defaults to `high`; `low` is "For high-volume or latency-sensitive workloads. Suitable for chat and non-coding use cases"; `medium` ≈ Sonnet 4.6 at `high`; effort affects text, tool calls and thinking; lower effort means fewer, terser tool calls; changing top-level effort between requests invalidates caching; per-message effort (`mid-conversation-output-config-2026-07-01`) exists only on Fable 5.1, Mythos 5.1, Opus 5.5 and Opus 5. https://platform.claude.com/docs/en/build-with-claude/effort (read 25 Sep 2026)
- Prompting Sonnet 5: adaptive thinking is on by default (`thinking: {type: "disabled"}` turns it off); Sonnet 5 "respects effort levels strictly, especially at the low end" with "some risk of under-thinking" on moderately complex tasks at `low`; raise effort rather than prompt around it, or add a targeted "think carefully" line if `low` must stay; with thinking disabled it is less likely to reach for tools; the new tokenizer needs larger `max_tokens`; sampling parameters return 400; it follows instructions literally. https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-sonnet-5 (read 25 Sep 2026)
- Thinking: interleaved thinking between tool calls is automatic with adaptive thinking; `display` defaults to `"omitted"` on Sonnet 5, and omitted display gives "faster time-to-first-text-token when streaming"; forced `tool_choice` works with adaptive thinking on Sonnet 5; one thinking configuration per assistant turn; in a tool loop the first request carries most of the reasoning and follow-ups may skip thinking. https://platform.claude.com/docs/en/build-with-claude/thinking and https://platform.claude.com/docs/en/build-with-claude/thinking-steering-and-cost (read 25 Sep 2026)
- Cost-and-intelligence guide: on research/knowledge work `low` gave up 1–3 points for a third to a half off the cost; `medium` matched default accuracy at 70–87% of the cost. https://platform.claude.com/docs/en/about-claude/models/optimizing-for-cost-and-intelligence (read 25 Sep 2026)

### Implication for Ask Rewired

- **CONFIRM** `effort: "low"` with adaptive thinking on for a short, scoped, latency-sensitive assistant.
- **REFINE**: pin `output_config.effort` and `thinking` per route and use the same values in the warm; do not vary effort across the ≤4 rounds or between threads on the same prefix. Steer hard questions with a phrase appended to the newest user turn rather than an effort change. Keep a second route at `medium` (its own cache prefix) for question kinds the eval shows under-thought at `low`. Set `max_tokens` with headroom for thinking plus a JSON answer under the new tokenizer. Leave `display` at its default (`omitted`).

## 8. Evals

### What the source says

- Demystifying evals for AI agents (9 Jan 2026): capability evals (low pass rate, headroom) versus regression evals (~100%, catch breakage), with graduation between them; start with 20–50 tasks from real failures; a good task is one where two experts reach the same verdict; grade outputs, not paths — tool-call verification is "too rigid"; isolated trials; pass@k versus pass^k, the latter for customer-facing agents; LLM judges need rubrics, calibration against humans and an "Unknown" escape; stack CI evals, production monitoring, A/B tests, user feedback and transcript review; read transcripts before trusting scores. https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents (read 25 Sep 2026)
- Quantifying infrastructure noise (5 Feb 2026): resource configuration alone moved Terminal-Bench 2.0 by 6 points; treat differences under ~3 points as noise without matched configuration; run several times. https://www.anthropic.com/engineering/infrastructure-noise (read 25 Sep 2026)
- Develop tests: task-specific cases including edge cases, automate grading, "volume over quality", exact-match/similarity/ROUGE/LLM-graded methods, use a different model as judge. https://platform.claude.com/docs/en/test-and-evaluate/develop-tests (read 25 Sep 2026)
- Define success criteria: specific, measurable, achievable, relevant; multidimensional (accuracy, safety, latency such as "95% response time < 200ms", cost). https://platform.claude.com/docs/en/test-and-evaluate/define-success (read 25 Sep 2026)
- Message Batches: 50% off all tokens; "Large-scale evaluations" is a listed use; most batches finish within an hour, all within 24; tools allowed but each request is single-shot, no `stream`, no `max_tokens: 0`, no fast mode; prefer the 1-hour cache TTL for shared prefixes. https://platform.claude.com/docs/en/build-with-claude/batch-processing (read 25 Sep 2026)
- Writing tools for agents: evaluate tools on realistic multi-call tasks; track accuracy, runtime, tool-call count, tokens and errors; hold out a test set (above).
- Bundled reference: noise floor ≈ 1/√(n·reps) for a pass rate (25 cases × 2 reps ≈ ±14 points); random stratified train/test split, never by score; judge via structured outputs on a model other than the one under test; oracle and null runs before the first paid pass; infra failures in a sidecar, never scored as 0; the runner must call the real entry point and match production config; both-directions coverage ("searches when it should" and "doesn't when it shouldn't"); a tool loop cannot run inside a batch (bundled reference, June 2026: `shared/evals/build-eval.md`, `eval-audit.md`, `eval-hillclimb.md`, `cost-optimization.md` § 2.5).

### Implication for Ask Rewired

- **REFINE** the two-tier plan. Keep the scripted model in CI, but call it what it is: a harness test that proves routing, RLS, read-set enforcement, card assembly and cache-prefix stability with zero model variance. The production gate is a separate real-model eval: `claude-sonnet-5` at the exact production config, per surface, 20–50 cases per surface drawn from real palette questions, a held-out slice, ≥2–3 reps, confidence intervals, and a "smallest change worth shipping" written down before the run.
- Grade outcomes: answer correctness (judge with a rubric on a different model, structured output, calibrated on a few dozen human labels), cited ids ⊆ read set (programmatic), card kind and payload (programmatic), latency and tokens from `usage`; never the tool trajectory. Report pass^k for must-never behaviours (foreign id, action without a card) and pass@1 for helpfulness.
- Include both directions: questions that need no tool, questions that need one, questions that must decline.
- Run single-turn cases through the Message Batches API at half price with the 1-hour TTL; multi-round cases run interactively (a batch request cannot loop).
- Feed production: sample transcripts weekly, promote real failures to cases, graduate saturated capability cases to the regression suite.

## 9. Page-aware assistants and MCP

### What the source says

- MCP spec 2026-07-28: three server primitives with distinct control — prompts (user-controlled), resources (application-controlled: the host may "implement automatic context inclusion, based on heuristics or the AI model's selection"), tools (model-controlled); a tool has `name`, `title`, `description`, `inputSchema`, optional `outputSchema`, `annotations` (behaviour hints that clients MUST treat as untrusted unless the server is trusted), `icons`; results carry `content` (`text`, `image`, `audio`, `resource_link`, embedded `resource`) and optional `structuredContent` conforming to `outputSchema`; execution errors go in `isError: true` results so the model can self-correct; hosts SHOULD keep a human in the loop with confirmation for operations; servers SHOULD return tools in deterministic order because it "improves LLM prompt cache hit rates"; `tools/list` and `resources/read` results carry `ttlMs`/`cacheScope`; resources have URIs, templates (RFC 6570), subscriptions and `audience`/`priority`/`lastModified` annotations; tool names 1–128 chars (letters, digits, `_`, `-`, `.`). https://modelcontextprotocol.io/specification/latest, /specification/2026-07-28/server, /server/tools, /server/resources (read 25 Sep 2026)
- MCP Apps (extension `io.modelcontextprotocol/ui`, stable 2026-01-26): a tool declares `_meta.ui.resourceUri` pointing at a `ui://` resource of type `text/html;profile=mcp-app`; the host renders it in a sandboxed (double) iframe; the app talks JSON-RPC over `postMessage` (`ui/initialize`, `ui/notifications/tool-input`, `tools/call`, `ui/update-model-context`, display modes, theme/locale); supported by Claude and Claude Desktop among others. https://modelcontextprotocol.io/extensions/apps/overview and https://raw.githubusercontent.com/modelcontextprotocol/ext-apps/main/specification/2026-01-26/apps.mdx (read 25 Sep 2026)
- Anthropic MCP connector (beta `mcp-client-2025-11-20`): remote HTTPS servers only, "only tool calls are currently supported" of the MCP feature set; `mcp_toolset` with `default_config`/`configs`, `enabled`, `defer_loading`; a pinned tool list under `mcp-client-2026-09-15`; denylisting write tools is recommended for read-only assistants or when a human confirmation step is wanted; SDK helpers convert MCP prompts and resources client-side. https://platform.claude.com/docs/en/agents-and-tools/mcp-connector (read 25 Sep 2026)

### Implication for Ask Rewired

- **REFINE**: no MCP surface now. The API-side connector cannot consume resources or prompts, so shaping readers as MCP resources buys nothing for the in-app assistant today.
- Keep the registry MCP-shaped so a future `tools/list` is a projection: `name` (within `^[a-zA-Z0-9_-]{1,128}$`, which is also valid MCP), `description`, `inputSchema` (the zod-generated JSON schema), an optional `outputSchema` that documents the reader's compact result, a read-only/destructive flag per tool, deterministic ordering. "One read layer" shared by REST and tools is the same seam an MCP server would sit on.
- Page context is, conceptually, an application-controlled resource: the host (the app) decides what enters context. The proposal already has that shape; nothing to change.
- Cards are MCP's human-in-the-loop made concrete; if a Claude-Desktop-facing surface is ever wanted, a card is a natural MCP App.

## 10. Latency

### What the source says

- Reduce latency: measure baseline latency and TTFT; the levers are model choice (Haiku 4.5 fastest), shorter prompts and outputs, `max_tokens` as a blunt cap, and streaming. https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/reduce-latency (read 25 Sep 2026)
- Streaming: SSE events; SDKs require streaming when `max_tokens` > 21,333; non-streaming requests are validated against a 10-minute timeout. https://platform.claude.com/docs/en/build-with-claude/streaming and https://platform.claude.com/docs/en/api/errors (read 25 Sep 2026)
- Prompt caching improves time-to-first-token for long prompts, and pre-warming "targets time-to-first-token". https://platform.claude.com/docs/en/build-with-claude/prompt-caching (read 25 Sep 2026)
- `display: "omitted"` (default on Sonnet 5) yields faster time to first text token when streaming. https://platform.claude.com/docs/en/build-with-claude/thinking (read 25 Sep 2026)
- Fast mode (`speed: "fast"`, beta `fast-mode-2026-02-01`, research preview): Opus 5.5, Opus 5 and Opus 4.8 only; up to 2.5× output tokens per second; "focused on output tokens per second (OTPS), not time to first token (TTFT)"; switching speed invalidates the cache. https://platform.claude.com/docs/en/build-with-claude/fast-mode (read 25 Sep 2026)
- Service tiers: Priority Tier commitments are no longer sold, and Priority Tier "is not available on Claude Sonnet 5". https://platform.claude.com/docs/en/api/service-tiers and https://platform.claude.com/docs/en/models/sonnet-5/whats-new-sonnet-5 (read 25 Sep 2026)
- Structured outputs add first-use grammar compilation latency, cached 24 hours (above). Tool search adds a server-side search step before the first client tool call (above). Every client tool call is a full round trip (How tool use works, above).
- Sonnet 5 launch (30 Jun 2026): positioned as "The best combination of speed and intelligence"; no API latency numbers. https://www.anthropic.com/news/claude-sonnet-5 and https://platform.claude.com/docs/en/models/sonnet-5/overview (read 25 Sep 2026)

### Implication for Ask Rewired

- **REFINE** "first words ≤2 s": it is reachable only on turns that answer from the page context without a tool round, or if the UI shows something before the JSON answer starts. The documented levers, in order: a warm shared prefix (tools+system+snapshot), `low` effort, `display` omitted, a compact answer schema, no tool search on the hot path, small `input_examples`, and a daily request that keeps the grammar compiled. Fast mode and Priority Tier are not available to Sonnet 5, so do not budget for them. Measure TTFT (first SSE byte), first text token and first complete answer field separately, per round count.

---

## Changes to the proposal, ranked

1. **Tool descriptions**: replace "two-sentence descriptions" with 3–4+ sentences each — what it reads, when to call it and when to prefer a sibling, what it returns, its limits — plus `input_examples` on the format-sensitive tools. (§1)
2. **Tool count**: ~35 tools is past the documented 20-tool threshold. Either consolidate to ≤20 per role with `action` parameters (strict stays OFF), or defer the long tail behind `tool_search_tool_bm25_20251119` after a one-request probe confirms Sonnet 5 supports tool search (the tool-search page omits it). Keep the 3–5 hot readers loaded; put the tools breakpoint on the last non-deferred tool. (§1)
3. **Page-context block placement**: not a system block, not a `role: "system"` message (unsupported on Sonnet 5), because it contains customer-authored text. Deliver it as `search_result`/`document` blocks at the start of the first user turn with `cache_control` on the last one; keep `system` for rules, facts and the snapshot. (§3, §5)
4. **`warm` route**: it cannot carry `output_config.format` or `stream` with `max_tokens: 0`, must match `thinking`/`effort`, and may write an entry the format-bearing request never reads. Prove it with `cache_read_input_tokens` on the first real request; fall back to a real `max_tokens: 1` warm with the format, or warm only the shared prefix. Instrument palette-open → question conversion before paying a per-person cache write on every open. (§3)
5. **Page-context content**: identifiers + display names + a few high-signal fields, not rows; readers get a `detail` switch, stable semantic ids, a page cap and a truncation note. (§4)
6. **Structured output + streaming**: prose field first in the schema, tolerant partial-JSON client, no numeric/string bounds, schema and tool set frozen per role (grammar cache key). (§2)
7. **Effort pinning**: same `effort`/`thinking` on every round and in the warm; steer per question by text; a measured `medium` route as fallback; `max_tokens` headroom for the new tokenizer. (§7)
8. **Thread replay**: verbatim and append-only while warm; compact rebuild only on a cold reopen; bounded turn count. (§6)
9. **Evals**: scripted-model CI = harness test; production gate = real model, production config, held-out set, reps + CIs, outcome grading, pass^k for must-never behaviours, judge on another model, Batch API for single-turn cases, weekly transcript sampling into the case set. (§8)
10. **Citations envelope**: rows as `search_result`/`document` blocks with citations disabled and stable `source` ids; server-side read-set validation stays; "not enough information" as an answer kind. (§5)
11. **Telemetry**: per-round `cache_read_input_tokens` / `cache_creation_input_tokens` / `input_tokens`, `diagnostics.previous_message_id` in dev/staging, TTFT vs first-text vs first-answer-field. (§3, §10)
12. **MCP**: don't build; keep the registry MCP-shaped (deterministic order, optional `outputSchema`, read-only flag). (§9)
13. **`eager_input_streaming`**: only on card tools with long text inputs, validated before render. (§1)
14. **`tool_choice: none` last round**: keep, knowing it misses the messages cache for that round; measure before changing. (§1, §3)
15. **Snapshot stability**: byte-identical when data is unchanged, so the 20-second cadence does not rewrite the second breakpoint. (§3)

## Sources

All read 25 Sep 2026. None of the URLs below failed to fetch; the `.md` variants of the platform docs served the same content as the HTML pages.

Platform docs (platform.claude.com):
- https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview — tool-use contract, client vs server tools, `disable_parallel_tool_use`, per-model tool-use system-prompt tokens.
- https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools — description best practices (3–4 sentences), consolidation, namespacing, `input_examples`, `tool_choice` and its cache effect, forced tool use by model.
- https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool — variants, `defer_loading`, thresholds (10+, 20+, 30–50), cache preservation, limits, model table (no Sonnet 5).
- https://platform.claude.com/docs/en/agents-and-tools/tool-use/manage-tool-context — the four context levers and the ~20-tool threshold.
- https://platform.claude.com/docs/en/agents-and-tools/tool-use/parallel-tool-use — all results in one user message; prompting for parallelism.
- https://platform.claude.com/docs/en/agents-and-tools/tool-use/handle-tool-calls — `tool_result` content types (incl. `search_result`), errors, untrusted content placement.
- https://platform.claude.com/docs/en/agents-and-tools/tool-use/strict-tool-use — strict mode, 24-hour grammar cache; no count caps.
- https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-reference — optional tool properties; `defer_loading` stripped before the cache key.
- https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-use-with-prompt-caching — invalidation table for tools, `tool_choice`, `disable_parallel_tool_use`, effort.
- https://platform.claude.com/docs/en/agents-and-tools/tool-use/fine-grained-tool-streaming — `eager_input_streaming`.
- https://platform.claude.com/docs/en/agents-and-tools/tool-use/programmatic-tool-calling — `allowed_callers`, container lifecycle (not adopted).
- https://platform.claude.com/docs/en/agents-and-tools/tool-use/how-tool-use-works — when tools do and do not fit.
- https://platform.claude.com/docs/en/agents-and-tools/tool-use/troubleshooting-tool-use — symptom tables; strict `pattern` error; untrusted tool-result instructions.
- https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool — `memory_20250818`, injected memory protocol.
- https://platform.claude.com/docs/en/agents-and-tools/mcp-connector — tools-only support, `mcp_toolset`, pinned lists.
- https://platform.claude.com/docs/en/build-with-claude/structured-outputs — `output_config.format`, grammar cache, schema limits, cache invalidation on format change.
- https://platform.claude.com/docs/en/build-with-claude/prompt-caching — breakpoints, minimums, TTLs, pre-warm rules, mid-conversation system messages not on Sonnet 5.
- https://platform.claude.com/docs/en/build-with-claude/mid-conversation-system-messages — model list, placement rules, uses.
- https://platform.claude.com/docs/en/build-with-claude/cache-diagnostics — `diagnostics.previous_message_id`, miss reasons.
- https://platform.claude.com/docs/en/build-with-claude/streaming — event types, partial JSON for tool input.
- https://platform.claude.com/docs/en/build-with-claude/thinking — adaptive thinking, `display`, interleaved thinking, preservation, caching rules.
- https://platform.claude.com/docs/en/build-with-claude/thinking-steering-and-cost — effort levels and thinking; effort change invalidates cache.
- https://platform.claude.com/docs/en/build-with-claude/thinking-tool-workflows — passing thinking blocks back in tool loops.
- https://platform.claude.com/docs/en/build-with-claude/effort — levels, Sonnet 5 guidance, effort with tools, per-message effort model list.
- https://platform.claude.com/docs/en/build-with-claude/context-editing — strategies, cache effects.
- https://platform.claude.com/docs/en/build-with-claude/compaction and https://platform.claude.com/docs/en/build-with-claude/compaction-on-demand — kinds of compaction, rejected parameters.
- https://platform.claude.com/docs/en/build-with-claude/citations — document types, incompatibility with structured outputs.
- https://platform.claude.com/docs/en/build-with-claude/search-results — `search_result` schema and rules.
- https://platform.claude.com/docs/en/build-with-claude/context-windows — 1M window, context awareness on Sonnet 5.
- https://platform.claude.com/docs/en/build-with-claude/batch-processing — 50% discount, limits, unsupported params.
- https://platform.claude.com/docs/en/build-with-claude/fast-mode — Opus-only research preview, OTPS not TTFT.
- https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices — tool use, parallel calls, thinking, agentic sections.
- https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-sonnet-5 — effort calibration, tool triggering, literalism.
- https://platform.claude.com/docs/en/models/overview, https://platform.claude.com/docs/en/models/sonnet-5/overview, https://platform.claude.com/docs/en/models/sonnet-5/whats-new-sonnet-5 — Sonnet 5 specs, release 30 Jun 2026, pricing, feature parity note.
- https://platform.claude.com/docs/en/about-claude/models/optimizing-for-cost-and-intelligence — effort curves, caching as first lever.
- https://platform.claude.com/docs/en/api/service-tiers — Priority Tier status and model exclusions.
- https://platform.claude.com/docs/en/api/errors — validation errors, long-request guidance.
- https://platform.claude.com/docs/en/build-with-claude/handling-stop-reasons — stop reasons incl. `refusal`, `pause_turn`.
- https://platform.claude.com/docs/en/test-and-evaluate/develop-tests, https://platform.claude.com/docs/en/test-and-evaluate/define-success — eval and success-criteria guidance.
- https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/reduce-latency, …/reduce-hallucinations — latency levers; grounding techniques.
- https://platform.claude.com/docs/en/about-claude/use-case-guides/customer-support-chat — RAG vs tools, streaming, citations, success criteria.
- https://platform.claude.com/llms.txt — docs index used to find the eval and latency pages.

Anthropic engineering and news:
- https://www.anthropic.com/engineering — index; newest post 25 May 2026.
- https://www.anthropic.com/engineering/building-effective-agents (19 Dec 2024).
- https://www.anthropic.com/engineering/claude-think-tool (20 Mar 2025).
- https://www.anthropic.com/engineering/writing-tools-for-agents (11 Sep 2025).
- https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents (29 Sep 2025).
- https://www.anthropic.com/engineering/code-execution-with-mcp (4 Nov 2025).
- https://www.anthropic.com/engineering/advanced-tool-use (24 Nov 2025).
- https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents (26 Nov 2025).
- https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents (9 Jan 2026).
- https://www.anthropic.com/engineering/infrastructure-noise (5 Feb 2026).
- https://www.anthropic.com/engineering/harness-design-long-running-apps (24 Mar 2026).
- https://www.anthropic.com/engineering/managed-agents (8 Apr 2026).
- https://www.anthropic.com/engineering/how-we-contain-claude (25 May 2026).
- https://www.anthropic.com/news — 2026 listing (Opus 5.5 22 Sep, Fable 5.1 1 Sep, Accenture embedded evaluation 18 Sep).
- https://www.anthropic.com/news/claude-sonnet-5 (30 Jun 2026).

MCP:
- https://modelcontextprotocol.io/specification/latest (2026-07-28) and /specification/2026-07-28/server, /server/tools, /server/resources.
- https://modelcontextprotocol.io/extensions/apps/overview and https://raw.githubusercontent.com/modelcontextprotocol/ext-apps/main/specification/2026-01-26/apps.mdx (SEP-1865, stable 2026-01-26).

Bundled Anthropic reference (June 2026), `C:\Users\Ruben\AppData\Local\Temp\claude\bundled-skills\2.1.280\816a7939edc76e2ec6cbaf3b29f82322\claude-api\shared\`: `agent-design.md`, `tool-use-concepts.md`, `prompt-caching.md`, `cost-optimization.md`, `evals/build-eval.md`, `evals/eval-audit.md`, `evals/eval-hillclimb.md`. Differences from live docs noted above: the bundled "default `eager_input_streaming: true`" rule (live page frames it as a large-parameter lever); the bundled caching guide's own note that sources conflict on Sonnet 5 mid-conversation system messages (live pages say unsupported; treated as unsupported here).

Not primary, mentioned only to mark a gap: a third-party post (answer.ai, 20 Jan 2026) reporting a 400 with a 24-optional-parameter limit; no Anthropic page documents the 20-strict/24-optional caps.

## Outdated thinking in the proposal

Most of the proposal reads as current: one model turn with tools plus `output_config.format`, streaming, `low` effort with adaptive thinking, an application-level read set, cards for actions, deterministic tool sets, and the omission of memory/compaction/context-editing all match the 2026 docs and posts. Five points are stale or unsupported by the sources and should be corrected before build: "two-sentence descriptions" contradicts the documented 3–4-sentence minimum; a page-context "system block" ignores both Sonnet 5's lack of mid-conversation system messages and the rule that third-party text (customer messages) belongs in `tool_result`/data blocks, not `system`; the 20-strict/24-optional caps are an empirical finding with no documentary basis and must not be treated as a spec; `defer_loading` + tool search cannot be assumed on Sonnet 5 until a probe confirms it, since the tool-search page omits the model; and any latency budgeting that leans on fast mode or Priority Tier is misplaced, because neither exists for Sonnet 5. Everything else is a refinement, not a reversal.
