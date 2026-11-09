/**
 * Cold email: the road to a mailbox. A mailbox is required, so this is the one thing a new account cannot skip. Stands
 * here until Task 10 draws its sheets; a press goes to Connections, where one is connected today.
 */
import { useEffect } from "react";
import { navigate } from "../../frame-verbs";
import { useRecordFold } from "../../kit/record/hooks";
import { recFolds } from "../../kit/record/registry";

export function ConnectSheets(_props: { again: () => void }) {
  const fold = useRecordFold("connect", { dirty: false });
  useEffect(() => recFolds.drawn("connect"), []);
  useEffect(() => {
    if (!fold.open) return;
    fold.close();
    navigate("admin/integrations");
  }, [fold]);
  return null;
}
