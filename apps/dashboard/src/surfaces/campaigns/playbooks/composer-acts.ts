/**
 * The playbook composer's verbs: choose a moment, a message or a language, add the moment's own message, and save
 * (moved from legacy/pages/playbook-composer.jsx, decision 0015). Plain functions over what the sheet holds, called as
 * it draws, so the handlers close over the same render's values as the one component's did.
 */
import type { Dispatch, SetStateAction } from "react";
import { templates } from "../templates/verbs";
import { rowIn } from "./composer-model";
import type { Fields, Model } from "./composer-model";
import type { PlaybookCardVM } from "./surface";
import { playbooks } from "./verbs";

interface ActsIn {
  m: Model;
  f: Fields;
  editing: PlaybookCardVM | null;
  adding: boolean;
  setTrigger: Dispatch<SetStateAction<string>>;
  setTplId: Dispatch<SetStateAction<string>>;
  setPicked: Dispatch<SetStateAction<boolean>>;
  setBusy: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setAdding: Dispatch<SetStateAction<boolean>>;
  /** The server took it: there is nothing left to keep of the words. */
  done: () => void;
  onDone: (d: { name?: string }, changed: boolean) => void;
}

export function composerActs(a: ActsIn) {
  const { m, f, editing, adding, setTrigger, setTplId, setPicked, setBusy, setError, setAdding, done, onDone } = a;
  const { triggers, tpl, slotsOf, groups, group, starter } = m;
  // A moment moved to keeps the message the owner chose when it can send it; one it cannot gives way to that moment's own.
  const chooseMoment = (id: string) => {
    if (id === f.trigger) return;
    const t = triggers.find((x) => x.id === id) || null;
    if (f.picked && tpl && slotsOf(tpl, t) === null) setPicked(false);
    setTrigger(id);
  };
  const chooseMessage = (id: string) => {
    const r = rowIn(groups.find((g) => g.name === id) || null, tpl ? tpl.language : null);
    if (!r) return;
    setPicked(true);
    setTplId(r.id);
  };
  const chooseLanguage = (lang: string) => {
    const r = group ? group.rows.find((x) => x.language === lang) : null;
    if (!r) return;
    setPicked(true);
    setTplId(r.id);
  };
  const addStarter = async () => {
    if (!starter || adding) return;
    setAdding(true);
    setError(null);
    const r = await templates.addStarters({ keys: [starter.key], languages: ["en_US"] });
    setAdding(false);
    if (!r.ok) setError(r.message || "It could not be added.");
  };
  const save = async () => {
    if (!m.ready || !tpl) return;
    setBusy(true);
    setError(null);
    // A list by its token: one of People's is its id (list_key), one of the workspace's own its list (list_id).
    const onWhich =
      m.onList && f.listId
        ? f.listId.startsWith("seg:")
          ? { list_key: f.listId.slice(4) }
          : { list_id: f.listId.slice(5) }
        : {};
    const body = {
      name: f.name === null || !f.name.trim() ? null : f.name.trim(),
      trigger: f.trigger,
      ...onWhich,
      ...(m.onList ? { policy_class: f.cls } : {}),
      template_id: tpl.id,
      params: m.specs,
      run_hour: Number(f.hour),
      cap_per_run: m.capN,
      gap_days: Number(f.gap),
      cadence_days: Number(f.cadence),
    };
    const r = editing ? await playbooks.update(editing.id, body) : await playbooks.create(body);
    setBusy(false);
    if (!r.ok) {
      setError(r.message || "It could not be saved.");
      return;
    }
    done();
    onDone(r.data, !!editing);
  };
  return { chooseMoment, chooseMessage, chooseLanguage, addStarter, save };
}
