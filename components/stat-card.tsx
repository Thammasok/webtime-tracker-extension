export function StatCard({
  label,
  value,
  sub,
  accent = false,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div className={accent ? 'rounded-2xl bg-brand p-4 text-white' : 'rounded-2xl border border-border bg-card p-4'}>
      <div className={`text-xs font-semibold tracking-wide uppercase ${accent ? 'text-white/75' : 'text-faint'}`}>
        {label}
      </div>
      <div className="mt-1.5 font-display text-[26px] font-bold tracking-tight tabular-nums">{value}</div>
      {sub && <div className={`mt-1 text-xs font-medium ${accent ? 'text-white/85' : 'text-faint'}`}>{sub}</div>}
    </div>
  );
}
