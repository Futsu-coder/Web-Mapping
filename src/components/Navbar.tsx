export default function Navbar() {
  return (
    <header className="h-14 shrink-0 bg-white border-b border-slate-200 px-4 flex items-center gap-2 z-30">
      <span className="flex items-center justify-center w-8 h-8 rounded-md bg-teal-700 text-white">
        <span className="material-symbols-outlined text-[18px]">map</span>
      </span>
      <span className="font-semibold text-slate-900 tracking-tight">Web Mapping</span>
    </header>
  );
}
