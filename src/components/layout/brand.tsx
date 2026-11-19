export function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="grid size-8 shrink-0 place-items-center rounded-[9px] border border-border-strong bg-[linear-gradient(145deg,#1d1f23,#101114)] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        <svg viewBox="0 0 32 32" className="size-[20px]" fill="none" aria-hidden="true">
          {/* DSAI faceted monogram icon */}
          <rect x="5" y="6" width="9" height="20" rx="2" fill="#f3f1ed" fillOpacity="0.95" />
          <path d="M14 6h4.5a8.5 8.5 0 0 1 8.5 8.5v0a8.5 8.5 0 0 1-8.5 8.5H14V6Z" stroke="#f3f1ed" strokeWidth="2.5" strokeLinejoin="round" />
          <circle cx="21" cy="16" r="2.5" fill="#74a892" />
        </svg>
      </div>
      <span className="text-[15px] font-semibold tracking-[-0.02em] text-foreground">DSAI</span>
    </div>
  );
}

