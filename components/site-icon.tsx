const PALETTE = [
  '#ff0033',
  '#24292f',
  '#a259ff',
  '#ff4500',
  '#5b5bd6',
  '#16a34a',
  '#efa14f',
  '#0ea5e9',
  '#db2777',
  '#7c3aed',
];

/**
 * Sites get a deterministic colored-initial badge instead of a fetched favicon — fetching real
 * favicons (even via Chrome's local `_favicon` cache) adds cross-browser inconsistency, and this
 * extension's whole pitch is minimizing what it reaches for over the network.
 */
export function siteIconColor(domain: string): string {
  let hash = 0;
  for (let i = 0; i < domain.length; i++) hash = (hash * 31 + domain.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

function siteInitial(domain: string): string {
  return domain.replace(/^www\./, '').charAt(0).toUpperCase();
}

export function SiteIcon({ domain, size = 30 }: { domain: string; size?: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-[9px] font-bold text-white"
      style={{ width: size, height: size, background: siteIconColor(domain), fontSize: size * 0.43 }}
    >
      {siteInitial(domain)}
    </span>
  );
}
