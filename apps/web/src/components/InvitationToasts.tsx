import { UserPlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Invitation } from "../api";

/** การ์ดคำเชิญเข้า group (ล่างขวา เว้นที่ให้ปุ่มควบคุมมุมมอง) — ข้อมูลมาจาก useInvitations (ใช้ร่วมกับกระดิ่ง) */
export default function InvitationToasts({
  invitations,
  busyId,
  error,
  onAnswer,
}: {
  invitations: Invitation[];
  busyId: number | null;
  error: string | null;
  onAnswer: (inv: Invitation, action: "accept" | "reject") => void;
}) {
  if (invitations.length === 0 && !error) return null;

  return (
    <div
      className="fixed right-4 bottom-[calc(6rem_+_env(safe-area-inset-bottom,0px))] z-50 flex w-[min(20rem,calc(100vw-2rem))] flex-col gap-2 md:right-24 md:bottom-6"
      aria-live="polite"
    >
      {invitations.map((inv) => (
        <div key={inv.id} className="animate-invite-in rounded-xl border border-black/5 bg-card p-3 shadow-float">
          <div className="flex items-start gap-2">
            <UserPlusIcon className="mt-0.5 size-5 shrink-0 text-primary" />
            <p className="flex-1 text-sm">
              <strong>{inv.inviterName}</strong> ชวนคุณเข้า <strong>{inv.groupName}</strong>
            </p>
          </div>
          <p className="mt-1 ml-7 text-xs text-muted-foreground">ยอมรับแล้วจะย้ายออกจาก group ปัจจุบัน</p>
          <div className="mt-2 flex justify-end gap-2">
            <Button variant="ghost" size="sm" disabled={busyId === inv.id} onClick={() => onAnswer(inv, "reject")}>
              ปฏิเสธ
            </Button>
            <Button size="sm" disabled={busyId === inv.id} onClick={() => onAnswer(inv, "accept")}>
              ยอมรับ
            </Button>
          </div>
        </div>
      ))}
      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-2 text-xs text-red-800 shadow-float">
          {error}
        </p>
      )}
    </div>
  );
}
