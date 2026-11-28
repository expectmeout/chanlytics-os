/**
 * Ask's tools by their names today (D13): every old tool maps once to a tool and action the registry has, every old
 * call made by its new name answers the bytes the old tool answered, and the report reads People once either way.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { withoutWholeDays } from "../charts/_whole-days.mjs";
import {
  ACT_DEFS,
  CASES,
  DAY,
  ESCALATION_HALVES,
  FIXTURE,
  INVITE,
  MOMENTS_RETIRED,
  NAMES,
  OLD_TOOLS,
  P1,
  PROPOSAL_SPECS,
  RPCS,
  THROUGH_THE_HUNDRED,
  TPL,
  WHOSE,
  againstOffered,
  ago,
  answer,
  inWords,
  pageModesOf,
  quietReceptionist,
  renamed,
  roleAtLeast,
  withCallDirection,
  withCampaignReads,
  withCampaignWord,
  withCampaigns,
  withCampaignsLabel,
  withChannelReads,
  withChannels,
  withEachSequencesMode,
  withHeldListWord,
  withHold,
  withHowItAnswers,
  withLastThirtyDays,
  withNoHeldDraft,
  withNobodyNamed,
  withNothingHeld,
  withOccasionsNote,
  withPeople,
  withPeopleReads,
  withReachOuts,
  withReceptionist,
  withReceptionistReads,
  withReviewReads,
  withReviews,
  withTheClocksHour,
  withTheHomes,
  withTheOneCount,
  withThePlansWords,
  withTheSequencesStart,
  withTheUndosWords,
  withTheVerbsWords,
  withTheYesItself,
  withoutDealLists,
  withoutPersonState,
  withoutRightNowDetail,
  withoutStoredWords,
  withoutVisitIds,
} from "./_tool-names.mjs";

test("the mapping names every old tool once, each to a tool and action the registry has, but the invitation, gone", () => {
  assert.deepEqual(
    [...OLD_TOOLS].filter((old) => !(old in NAMES)),
    [INVITE],
    "the invitation is the Team page's alone",
  );
  assert.equal(Object.keys(NAMES).length, 25, "the twenty-five old tools that are an action still");
  assert.equal(new Set(Object.values(NAMES)).size, 25, "each to its own name.action");
  assert.deepEqual(
    [...new Set(CASES.map(([old]) => old))].sort(),
    [...Object.keys(NAMES), INVITE].sort(),
    "every old tool is called here at least once",
  );
});

test("every old tool's call, made by its new name and action, answers the bytes the old tool answered at 7405e34b, and makes the same reads", async () => {
  assert.equal(FIXTURE.length, CASES.length, "one frozen answer per call");
  for (let i = 0; i < CASES.length; i++) {
    const [old, input, role = "owner"] = CASES[i];
    const { call: frozen, ...want } = FIXTURE[i];
    assert.deepEqual(frozen, [old, input, role], `case ${i} is the call the fixture froze`);
    if (old === INVITE) {
      // The invitation's tool is gone with it (Ruben, 15 Oct 2026): refused as any unknown tool, before anything is read.
      const gone = await answer("propose_team", { action: "invite", ...input }, role);
      assert.deepEqual(
        [gone.isError, JSON.parse(gone.result).error, gone.reads],
        [true, "unknown tool propose_team", []],
      );
      continue;
    }
    const call = renamed(old, input);
    const got = withoutWholeDays(NAMES[old], withoutPersonState(old, await answer(call.name, call.input, role)));
    // 2 Oct 2026: a moment no longer offered for a new playbook (contracts MOMENTS_RETIRED) is not one of the tool's
    // triggers: the schema refuses it, naming the ones that are, before anything is read (the check refuses it in the
    // moment's own words if it gets that far, which broadcasts/core-campaigns/ runs).
    if (call.name === "propose_campaign" && String(call.input.trigger) in MOMENTS_RETIRED) {
      assert.equal(got.isError, true, `${old}: a retired moment is refused`);
      assert.match(got.result, /expected one of/, `${old}: by the schema, naming the moments there are`);
      assert.deepEqual(got.reads, [], `${old}: before anything is read`);
      continue;
    }
    // A refusal that named an old tool names its new one: the one change to the bytes, applied to every old name.
    // 7 Oct 2026: the frozen world's WhatsApp number was a US one, and Meta's pause on marketing messages to US numbers
    // (contracts whatsapp-offers.ts) would now hold every offer these tools count; the world's number is a UK one, and the
    // one place the frozen bytes say the number (workspace.settings) is rewritten to it. The pause itself is ask-turn's to prove.
    // 7 Oct 2026 (the calendar's setup, said once): what Reports says with no calendar link names the link, where it
    // said "Connect your calendar" to a business whose bookings arrive by email (contracts BOOKED_NEEDS_A_LINK).
    let result = want.result
      .replaceAll("+19295550100", "+442079460100")
      .replaceAll(
        "Connect your calendar under Settings › Business",
        "Add a calendar link under Settings › Hours & booking",
      )
      // 11 Oct 2026 (decision 0051): saying it is an AI assistant is no longer a switch, and Ask says so.
      .replaceAll(
        "says it is an AI assistant when asked",
        "always says it is the business's AI assistant, never a person",
      );
    for (const [from, to] of Object.entries(NAMES))
      result = result.replace(new RegExp(`\\b${from}\\b`, "g"), inWords(to));
    if (NAMES[old] === "report")
      result = withPeople(withReceptionist(withReachOuts(withReviews(withCampaigns(withHold(result))))));
    if (NAMES[old] === "inbox.list" && input.filter === "held") result = withNothingHeld(result);
    if (old === "get_today") result = withTheOneCount(result);
    // 19 Oct 2026 (decision 0064, step 2): Today says what goes on its own later today unless it is stopped, as its Going
    // today draws it, before the searches that wait: nothing in this world.
    if (old === "get_today") result = result.replace('"searches_waiting":', '"going_today":[],"searches_waiting":');
    if (old === "get_settings") result = withHowItAnswers(result);
    if (NAMES[old] === "campaigns.moments") result = withEachSequencesMode(result);
    // 10 Nov 2026 (decision 0119; Ruben: Ask proposes the three moments an occasion starts): the moments' note says what
    // their mark means, a moment with no count because it names nobody ahead of time. This world has no calendar, so it
    // is offered none of the three: the note is the one change to its bytes.
    if (NAMES[old] === "campaigns.moments") result = withOccasionsNote(result);
    if (old === "list_threads" || old === "get_thread") result = withNoHeldDraft(result);
    if (NAMES[old] === "calls.list" || NAMES[old] === "calls.get") result = withCallDirection(result);
    if (NAMES[old] === "campaigns.lists")
      result = withoutDealLists(withTheYesItself(withHeldListWord(withChannels(result))));
    if (NAMES[old].startsWith("propose_campaign.")) result = withTheVerbsWords(result);
    // 8 Oct 2026: a playbook's hour by the product's clock (withTheClocksHour): the campaigns' own answers and cards,
    // in their result and in the card they propose.
    const campaignsOwn = NAMES[old].startsWith("sequences.") || NAMES[old].startsWith("propose_campaign.");
    if (campaignsOwn) result = withTheClocksHour(result);
    // 9 Oct 2026: and a playbook card's title says "Campaign" (withCampaignWord), in its result and in the card.
    const playbookCard = NAMES[old] === "propose_campaign.moment";
    if (playbookCard) result = withNobodyNamed(withTheSequencesStart(withCampaignWord(result)));
    // 11 Oct 2026: a plan's sentence and its kind (withThePlansWords), in the result and in the card.
    const leadPlan = NAMES[old] === "propose_lead_search.find";
    if (leadPlan) result = withThePlansWords(result);
    const worded =
      campaignsOwn && typeof want.proposal === "string"
        ? {
            proposal: playbookCard
              ? withNobodyNamed(withTheSequencesStart(withCampaignWord(withTheClocksHour(want.proposal))))
              : withTheClocksHour(want.proposal),
          }
        : leadPlan && typeof want.proposal === "string"
          ? { proposal: withThePlansWords(want.proposal) }
          : {};
    // 9 Nov 2026: a card's undo in a person's words (withTheUndosWords).
    const proposal = worded.proposal ?? want.proposal;
    const card = typeof proposal === "string" ? { proposal: withTheUndosWords(proposal) } : worded;
    // An action above the caller is refused by the registry first since PR 4.3 (the Phase 4 plan, D2), in its words,
    // before anything is read, as its builder refused it: the other change to these bytes.
    const act = ACT_DEFS.find((x) => x.name === call.name)?.actions[call.input.action ?? ""];
    const needs = act && call.input.action ? PROPOSAL_SPECS[act.kind].needs : null;
    if (needs && !roleAtLeast(role, needs))
      result = JSON.stringify({ error: `${call.name}: action ${call.input.action} is ${WHOSE[needs]}` });
    // The threads' messages are one call since 00258 (newest_messages): the old tools that read through the conversations
    // reader made that read, and no other of the table: the one change to the reads, with the bytes unchanged.
    const reads00 = THROUGH_THE_HUNDRED.has(old)
      ? want.reads.map((r) => (r === "messages.select" ? "rpc:newest_messages" : r))
      : want.reads;
    // 7 Oct 2026 (lane 1, T6): Ask reads the message a proposal's template names through core's readCampaignMessage (db
    // listMessageVersionRows: the version, then every row of its message), where it read the one WhatsApp row: one `templates`
    // read more for a template this workspace holds. A template it does not hold answers at the version, one read as before.
    const readsRows =
      NAMES[old].startsWith("propose_campaign.") && input.template_id === TPL && reads00.includes("templates.select");
    const reads0 = readsRows ? [...reads00, "templates.select"] : reads00;
    // 3 Oct 2026 (One message, every channel, step 3): the playbooks reader asks whether the workspace can send on each
    // channel (server/campaigns/channels-ready.ts): the WhatsApp number and the texting line, after the turn's tenants
    // reads (the mailbox only where the deployment sends email, which this one does not). The one change to its reads.
    // A campaign proposed (a broadcast, a playbook) asks the same of WhatsApp alone, the one channel Ask names: whether
    // its number can send. One read more, in any order; a call refused before, at its template, never gets that far.
    const proposes = String(NAMES[old]).startsWith("propose_campaign.") && !want.isError;
    // 7 Oct 2026 (lane 1, T5): a playbook's check reads the message the template's id names (db listMessageVersionRows: the
    // version, then every row of it, on any channel), where it read the one WhatsApp row: a playbook proposed on a
    // template, which reached the check after Ask's own read of the row, makes one `templates` read more.
    const readsMessage =
      proposes &&
      NAMES[old] === "propose_campaign.moment" &&
      reads00.filter((r) => r === "templates.select").length >= 2;
    const counted =
      NAMES[old] === "campaigns.moments"
        ? withChannelReads(reads0)
        : proposes
          ? [...reads0, "tenant_channels.select", ...(readsMessage ? ["templates.select"] : [])]
          : reads0;
    // 3 Oct 2026 (the review's item 7): People's rows say who can be sent what against what the workspace can send on, so
    // a tool that reads the people's pool or a page of them asks for it once a turn (readers/facts.ts channelsReady): the
    // number's row and the texting line's, in any order among the rest. Answers and cards are unchanged.
    // A call refused before it reads the people (a list that is no token, a template that is not there) never gets that far.
    const readsReach =
      ["search_people", "list_audiences", "propose_broadcast", "propose_playbook"].includes(old) &&
      counted.includes("rpc:people_list");
    const reached = readsReach ? [...counted, "tenant_channels.select", "lines.select"] : counted;
    // 8 Oct 2026 (Ask names channels; the spec of that day, decision 5): a playbook proposed with no channel named goes
    // by what the composer would tick for it (contracts newCampaignChannels), so it asks what the workspace can send on
    // before its check (act/playbook/playbook.ts unnamedChannels, over readers/facts.ts channelsReady: the number's row and the
    // texting line's, the read the people's pool makes once a turn). A call that goes on to count its people makes no
    // read more; one the CHECK refuses never got that far, and makes those two. The one change to its reads; the bytes
    // are unchanged, this workspace's default being WhatsApp alone.
    const refusedAtTheCheck =
      old === "propose_playbook" && input.channels === undefined && want.result === '{"error":"List not found."}';
    const reachReads = refusedAtTheCheck ? [...reached, "tenant_channels.select", "lines.select"] : reached;
    // 6 Oct 2026 (#1431): a person's page reads the decisions recorded about them, not only those on their threads
    // (packages/db listPersonDecisions), so people.get reads `decisions` once even for a person with no thread, or none at all.
    // The one change to its reads; its bytes are unchanged.
    const withDecisions =
      NAMES[old] === "people.get" && !reachReads.includes("decisions.select")
        ? [...reachReads, "decisions.select"]
        : reachReads;
    // 7 Oct 2026 (00344, decision 0034 step 4): a person's page reads the open doubts naming them (person_doubts) in the
    // same round, so people.get makes that one read more; its bytes are unchanged, the tool not saying them yet.
    const withDoubts0 = NAMES[old] === "people.get" ? [...withDecisions, "person_doubts.select"] : withDecisions;
    // 12 Oct 2026 (#1566, decision 0052): and the signers of their replies still offered or taken (db listSigners), in the
    // same round; its bytes are unchanged, the tool not saying them. This world's person names no lead, so the business
    // they work at reads nothing.
    // 15 Oct 2026 (decision 0060, S5): and the sequences they are in now (db listSequencesOfPerson); none here, so no names.
    // 9 Nov 2026 (decision 0119): and what an occasion enrolled them for and has not sent yet, in the same read.
    const withDoubts =
      NAMES[old] === "people.get"
        ? [...withDoubts0, "sequence_replies.select", "sequence_enrollments.select", "sequence_occasions.select"]
        : withDoubts0;
    // 7 Oct 2026 (00345, bookings arrive by email): the calendar's reader reads the record beside the feed -- the
    // appointments over the span, the notices' health line (the latest, and the held count) and the workspace's mailbox
    // -- so calendar.week makes those reads more. Its bytes are unchanged: this workspace has no calendar and no
    // booking has arrived, and with no feed to read nothing of the record's taken time is asked. Since 00397 the span's
    // record is two reads (db findVisitsOver: the bookings whole, and the feed's rows by key), so five more.
    const withCalendar =
      NAMES[old] === "calendar.week"
        ? [
            ...withDoubts,
            "appointments.select",
            "appointments.select",
            "appointment_notices.select",
            "appointment_notices.select",
            "mailboxes.select",
          ]
        : withDoubts;
    // 7 Oct 2026 (00349): the Inbox's read and a page of People say what the member asking has seen of each person they
    // hold (server/people/person-seen.ts), for the rows that say who is new to them: one call to the door more, where
    // the read holds anyone; the Inbox's hundred make it, and a search of People with no list (a list is counted over
    // the pool), which since 00625 reads its own people's reply modes, not every policy. Bytes unchanged: none says it.
    const readsSeen = THROUGH_THE_HUNDRED.has(old) || (old === "search_people" && !input.list);
    const withSeen = readsSeen ? [...withCalendar.map(pageModesOf(old)), "rpc:contact_seen"] : withCalendar;
    // 7 Oct 2026 (Reports phase C, lens 1, T4): the report reads the Reviews lens too: six reads more (withReviewReads).
    // 8 Oct 2026 (a conversation begins from the Inbox): a thread nothing has come to from the person's side is answered
    // where our own written words last went (server/shared/verbs.ts replyChannelOf, db findOurLastWire), never on WhatsApp by default:
    // one `messages` read more for a reply drafted on such a thread. This workspace's one inbound message names a sender
    // the reader does not count as the person's own, so the draft that reaches the read makes it. Its bytes are unchanged.
    const readsOurWire = NAMES[old] === "propose_reply.draft" && withSeen.includes("messages.select");
    const withOurWire = readsOurWire ? [...withSeen, "messages.select"] : withSeen;
    // 9 Oct 2026 (a moment holds many campaigns, lane 1, task 14): the playbooks reader asks the database what each
    // playbook's runs earned (00374 playbook_totals, db getPlaybookTotals: one call) and reads the playbooks' rows alone,
    // where it read every run's row beside them to sum it in TypeScript: one `broadcasts` read fewer and one call to the
    // function more. Its bytes are unchanged (GET playbooks answers the same bytes, playbooks/totals/playbook-totals.test.mjs).
    const countsInTheDatabase = NAMES[old] === "campaigns.moments" && withOurWire.includes("sequence_batches.select");
    const withTotals = countsInTheDatabase
      ? [...withOurWire.toSpliced(withOurWire.indexOf("sequence_batches.select"), 1), "rpc:playbook_totals"]
      : withOurWire;
    // 9 Oct 2026 (the moment spec, D9): a playbook proposed is held to the running ones on its moment, list and message
    // (packages/db listRunningTwins): one `playbooks` read more for a call that reaches its card.
    const readsTwins = NAMES[old] === "propose_campaign.moment" && !want.isError;
    const withTwins = readsTwins ? [...withTotals, "sequence_steps.select"] : withTotals;
    // 10 Oct 2026 (a moment holds many campaigns: the month's allowance, one rule): a playbook proposed is counted against
    // the week's touches as the page's pools are (server/campaigns/playbooks.ts getRecentTouches, db listTouchesSince: the week's
    // runs, and the workspace's zone a waiting run is judged by), where it was counted with nobody touched: two reads more
    // for a call that reaches its card, and no read of the runs' people where the week holds no run. Its bytes are
    // unchanged: nobody here heard from a campaign this week.
    const withWeek = readsTwins ? [...withTwins, "sequence_batches.select", "tenants.select"] : withTwins;
    // 11 Oct 2026 (a one-off send honours the breath): a broadcast proposed leaves out whoever heard this week, as the
    // composer counts them and the route skips them (db getRecentTouches over listTouchesSince): the same two reads more for a
    // call that reaches its card, and for the audiences listing, which counts as the card does. Their bytes are unchanged:
    // nobody here heard from a campaign this week.
    const readsBreath = (NAMES[old] === "propose_campaign.once" && !want.isError) || NAMES[old] === "campaigns.lists";
    const withBreath = readsBreath ? [...withWeek, "sequence_batches.select", "tenants.select"] : withWeek;
    // 10 Oct 2026 (Reports, the Receptionist lens, C2 T13): and the Receptionist lens's own: one rpc more (withReceptionistReads).
    // 10 Oct 2026 (Reports, the People lens, C3 T13): and the People lens's: its series and the channels the book is judged against.
    // 11 Oct 2026 (Reports, the Campaigns lens, C4 T16): and the Campaigns lens's ledger, what is stuck and the number (withCampaignReads).
    // 13 Oct 2026 (the wiring's second audit, R2): the open escalations are read in two halves (readers/escalations.ts: the
    // holds that wait on a person, and the hand-backs), one read more where the old tool read them through the reader; and
    // Today reads the runs waiting for approval (readers/broadcasts.ts waitingRuns), one `broadcasts` read more. Its bytes
    // gain the one count's parts (withTheOneCount).
    const halves =
      ESCALATION_HALVES.has(old) && withBreath.includes("escalations.select")
        ? [...withBreath, "escalations.select"]
        : withBreath;
    // 13 Oct 2026 (Ruben: held emails count): and the going runs, whose check may hold emails for your say (db
    // listWaitingRuns): one `broadcasts` read more. Nobody here has a going reach-out run, so no held count is asked.
    // 19 Oct 2026 (decision 0064, step 2): and the runs set to go before the day ends (db listRunsGoingBetween), one more.
    // 31 Oct 2026 (decision 0079, L5): and the leads who tried their own receptionist (db listPreviewsTriedSince), one more.
    // Its bytes are unchanged: nobody here tried one.
    const withRunsWaiting =
      old === "get_today"
        ? [
            ...halves,
            "sequence_batches.select",
            "sequence_batches.select",
            "sequence_batches.select",
            "lead_previews.select",
          ]
        : halves;
    // 13 Oct 2026 (the wiring's second audit, R3, S5-3): a person the workspace does not show is asked once more whether
    // they were combined into another (db findKeptPerson), so their old address opens the person they became: one
    // `contacts` read more where the profile is refused. Its bytes are unchanged for nobody combined.
    const followsACombine =
      NAMES[old] === "people.get" && want.isError ? [...withRunsWaiting, "contacts.select"] : null;
    const withKept = followsACombine ?? withRunsWaiting;
    // 16 Oct 2026 (a question handed back unanswered still waits): the conversations reader asks each thread's newest
    // closed hold beside its messages (db listLastClosedHolds), so a thread whose customer wrote last can say nobody answered
    // them: one `escalations` read more for each read of the threads' messages. The bytes are unchanged: no tool says it yet.
    const withClosedHolds = [
      ...withKept,
      ...withKept.filter((r) => r === "rpc:newest_messages").map(() => "escalations.select"),
    ];
    // 18 Oct 2026 (0008, amended: every workspace has deals): where a tool read how the workspace's customers buy
    // (tenants.sells_by), it reads what it needs of what replaced it. People's page and a playbook's card say the
    // workspace's word (one `tenants` read, as before), and People's rows ask whether a deal was ever recorded (one
    // `deals` read more); a pool or a list asks the second alone; the settings and the report ask neither. This world
    // records no deal, so the moments ask whether there is one where they read its pace and its proposals out. Their
    // bytes are unchanged, the deal lists aside (withoutDealLists).
    const pool =
      readsReach &&
      (old === "list_audiences" || old === "propose_broadcast" || (old === "search_people" && !!input.list));
    const dealt = [...withClosedHolds, ...(readsReach ? ["deals.select"] : [])];
    const drop = (r, x) => (r.includes(x) ? r.toSpliced(r.indexOf(x), 1) : r);
    const withoutBuys =
      pool || NAMES[old] === "report" || NAMES[old] === "workspace.settings" ? drop(dealt, "tenants.select") : dealt;
    const withOneDealRead = NAMES[old] === "campaigns.moments" ? drop(withoutBuys, "deals.select") : withoutBuys;
    // 0076: Today reads what was booked (bookings.ts); 00512: a lead plan, the month's allowance. Bytes unchanged.
    // 14 Nov 2026 (decision 0132): and the number's row, for what WhatsApp holds against it (metrics.ts whatsappHeld): one
    // `tenant_channels` read more. Its bytes are unchanged: this world's number is held by nothing.
    // 21 Nov 2026 (W1, W2): and AI's bookings, the stop and the member's last look (today.ts aiBeside). Bytes unchanged.
    const ai = ["appointments.select", "tenant_config.select", "memberships.select"];
    // 22 Nov 2026 (00680): and the form entries held for a look that nobody has looked at in three days, read beside
    // the requests nobody has answered (readers/forms.ts formRequestsOpen): one `form_entries` read more. Bytes
    // unchanged: this world has no form.
    // 23 Nov 2026 (00699): and the comments on the posts that wait on the owner (readers/results.ts commentsWaiting): one
    // `touches` read more. Bytes unchanged: this world has no post.
    const held = ["form_entries.select", "touches.select"];
    const booked =
      old === "get_today" ? ["events.select", "appointments.select", "tenant_channels.select", ...ai, ...held] : [];
    const allowance = leadPlan && !want.isError ? ["rpc:lead_allowance"] : [];
    const reads =
      NAMES[old] === "report"
        ? withCampaignReads(withPeopleReads(withReceptionistReads(withReviewReads(withOneDealRead))))
        : [...withOneDealRead, ...booked, ...allowance];
    const [gotResult, wantResult] = withoutStoredWords(
      old,
      ...(NAMES[old] === "campaigns.moments"
        ? againstOffered(got.result, withTheHomes(withLastThirtyDays(result)))
        : [
            withoutVisitIds(old, got.result),
            withTheHomes(NAMES[old] === "people.get" ? withoutRightNowDetail(result) : result),
          ]),
    );
    // 2 Oct 2026: a win-back proposed asks first whether a calendar is connected (check-playbook's calendarOn), from the
    // zone and settings the turn reads once: the same reads as before, those two earlier.
    // Reads asked at once land in any order: People's list has read the workspace beside its rows since e32aaf29c,
    // so every call's reads are compared as a set of counts, the win-back's and the channels' among them.
    const inOrder = (r) => [...r].sort();
    assert.deepEqual(
      { ...got, result: gotResult, reads: inOrder(got.reads) },
      { ...withCampaignsLabel(want), ...card, result: wantResult, reads: inOrder(reads) },
      `${old} -> ${NAMES[old]} ${JSON.stringify(input)}`,
    );
  }
});

test("the report finds the people its booking link went to only where the link went to someone, and reads People once either way: the turn's one read (readers/everyone.ts), filtered", async () => {
  const peopleReads = (reads) => reads.filter((r) => r === "rpc:people_list").length;
  const none = await answer("report", { period: "7d" });
  assert.equal(none.isError, false, none.result);
  assert.equal(peopleReads(none.reads), 1, "no link sent: nobody to find");
  assert.equal(none.reads.filter((r) => r === "rpc:receptionist_series").length, 1, "the lens's read, once");
  // The People lens counts the same People: its series is its one call more, and the book is the turn's one read, counted.
  assert.equal(none.reads.filter((r) => r === "rpc:people_series").length, 1, "the People lens's read, once");
  // The Campaigns lens's ledger and what is stuck: one call each, whether or not the sends could be read.
  assert.deepEqual(
    ["rpc:campaign_ledger", "rpc:campaign_stuck"].map((rpc) => none.reads.filter((r) => r === rpc).length),
    [1, 1],
    "the Campaigns lens's ledger and what is stuck, once each",
  );
  // The channels: the People lens judges its book against the turn's one read of them (the number's row and the texting
  // line's), and the Campaigns lens reads the connected number's row once more, to say its health (the reader's own read,
  // the channel's stored config): two reads of the number's row, one of the texting line's.
  assert.deepEqual(
    ["tenant_channels.select", "lines.select"].map((q) => none.reads.filter((r) => r === q).length),
    [2, 1],
    "and the channels: the book's judgment, once, and the number's health, once",
  );

  const link = (a) => quietReceptionist(a, { links: { total: 1, people: [{ c: P1, at: ago(DAY) }] } });
  const sent = await answer("report", { period: "7d" }, "owner", { ...RPCS, receptionist_series: link });
  assert.equal(sent.isError, false, sent.result);
  assert.equal(peopleReads(sent.reads), 1, "a link sent to Rosa: People is read whole once, then filtered to her");
  // This workspace keeps no calendar link: the calendar cannot say who booked, and the line says why, never a count.
  assert.equal(
    JSON.parse(sent.result).ai.link,
    "1 person was sent the booking link. Add a calendar link under Settings › Hours & booking to see who booked.",
  );
});
