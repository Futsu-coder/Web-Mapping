export default function SidebarToggleIcon({
  direction,
  className,
}: {
  direction: "left" | "right";
  className?: string;
}) {
  const chevron = direction === "left" ? "17,8 13,12 17,16" : "13,8 17,12 13,16";
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="6" stroke="currentColor" strokeWidth="2" />
      <rect x="3" y="3" width="6" height="18" rx="3" fill="currentColor" fillOpacity="0.15" stroke="none" />
      <path d="M9 3v18" stroke="currentColor" strokeWidth="2" />
      <polyline points={chevron} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
