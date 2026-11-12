export function Brand() {
  return <div className="flex items-center gap-2.5">
    <div className="grid size-8 shrink-0 place-items-center rounded-[9px] border border-border-strong bg-[linear-gradient(145deg,#1d1f23,#101114)] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <svg viewBox="0 0 32 32" className="size-[22px]" fill="none" aria-hidden="true">
        <path d="M4.5 23.3 12.8 8.9c1.4-2.4 4.9-2.4 6.3 0l8.4 14.4c.7 1.2-.2 2.7-1.6 2.7h-1.7c-.7 0-1.4-.4-1.8-1.1L16 13.8 9.6 24.9c-.4.7-1 1.1-1.8 1.1H6.1c-1.4 0-2.3-1.5-1.6-2.7Z" fill="#f3f1ed" />
        <path d="m16 13.8 6.4 11.1c.4.7 1 1.1 1.8 1.1h1.7c1.4 0 2.3-1.5 1.6-2.7l-5.7-9.8c-2.2-.9-4.2-.7-5.8.3Z" fill="#8e9094" />
      </svg>
    </div>
    <span className="text-[15px] font-medium tracking-[-0.02em] text-foreground">Atelier AI</span>
  </div>;
}
