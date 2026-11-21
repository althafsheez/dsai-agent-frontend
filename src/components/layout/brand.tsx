export function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="grid size-9 shrink-0 place-items-center rounded-[9px] border border-[#28394e] bg-[linear-gradient(145deg,#202a39,#141a23)] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        <svg viewBox="0 0 32 32" className="size-[22px]" fill="none" aria-hidden="true">
          <defs><linearGradient id="brand-metal" x1="6" y1="4" x2="26" y2="29" gradientUnits="userSpaceOnUse"><stop stopColor="#faf9f7" /><stop offset="1" stopColor="#8e98a8" /></linearGradient></defs>
          <path d="M3 4h16c1.2 0 2.1.4 3 1.3l6 6c.7.7 1 1.5 1 2.5v8c0 1-.4 1.8-1.1 2.5l-5 4.5c-.8.8-1.8 1.2-3 1.2H3l20-9V10H9L3 4Z" fill="url(#brand-metal)" />
          <path d="M3 21l4-1.4v8L3 30v-9Zm6-2.2 4-1.4v7.5l-4 1.8v-7.9Zm6-2.2 4-1.4v6.9l-4 1.8v-7.3Z" fill="url(#brand-metal)" />
        </svg>
      </div>
      <span className="text-[18px] font-semibold tracking-[-0.02em] text-foreground">DSAI</span>
    </div>
  );
}

