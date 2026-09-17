-- A template's news is not the number's news.
--
-- Every alertable thing Meta says about a WhatsApp account arrived on the bell
-- as kind 'number', which the product draws with a shield, in warn amber, over
-- a door to Connections. That is right for a quality rating flagged or a
-- messaging limit lowered. It is wrong for "Template “save_our_number”
-- approved" — good news, wearing a warning's colour, pointing at the wrong
-- page. And since Today began sorting warnings above everything else, an
-- approval outranked real news and could push a genuine warning off the card.
--
-- Two kinds, so the look follows the meaning and nothing has to be inferred
-- from the title's spelling: one for a template that can now be sent, one for a
-- template that cannot.

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('handoff','deadman','call','number','sweep','job_failed','playbook','calendar_people','alert','review','billing','template_ready','template_blocked'));
