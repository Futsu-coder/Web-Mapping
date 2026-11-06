import { useCallback, useSyncExternalStore } from "react";

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (cb: () => void) => {
      const m = matchMedia(query);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    [query],
  );
  return useSyncExternalStore(subscribe, () => matchMedia(query).matches, () => false);
}

/** จอมือถือ = กว้างน้อยกว่า 768px (ตรงกับ breakpoint `md` ของ Tailwind) */
export const useIsMobile = () => useMediaQuery("(max-width: 767px)");
