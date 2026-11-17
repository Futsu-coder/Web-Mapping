import { useEffect, useState } from "react";

/** flag เป็น true ค้างเกิน delay ms ค่อยคืน true — โหลดเสร็จเร็วจะไม่เห็น loading วูบขึ้นมา */
export function useDelayedFlag(flag: boolean, delay = 300): boolean {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!flag) {
      const off = setTimeout(() => setShown(false), 0);
      return () => clearTimeout(off);
    }
    const on = setTimeout(() => setShown(true), delay);
    return () => clearTimeout(on);
  }, [flag, delay]);
  return flag && shown;
}
