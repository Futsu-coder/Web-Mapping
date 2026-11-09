import { useCallback, useEffect, useState } from "react";
import { answerInvitation, listInvitations, type Invitation } from "../api";
import { message } from "./featureMeta";
import { subscribeInvitations } from "./realtime";

/**
 * คำเชิญที่รอเราตอบ — ใช้ร่วมกันระหว่างการ์ดมุมขวาล่างกับกระดิ่ง (ตอบที่ไหนก็หายจากทั้งสองที่)
 * userId = null (ยังไม่ login) → ว่าง
 */
export function useInvitations(userId: string | null, onAccepted: () => void) {
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    listInvitations()
      .then(setInvitations)
      .catch((err) => setError(message(err)));
  }, []);

  useEffect(() => {
    if (!userId) return;
    load();
    return subscribeInvitations(userId, load);
  }, [userId, load]);

  const answer = async (inv: Invitation, action: "accept" | "reject") => {
    setBusyId(inv.id);
    setError(null);
    try {
      await answerInvitation(inv.id, action);
      setInvitations((list) => list.filter((i) => i.id !== inv.id));
      if (action === "accept") onAccepted();
    } catch (err) {
      setError(message(err));
      load(); // คำเชิญอาจถูกตอบไปแล้วจากอีกแท็บ
    } finally {
      setBusyId(null);
    }
  };

  return { invitations: userId ? invitations : [], busyId, error, answer };
}
