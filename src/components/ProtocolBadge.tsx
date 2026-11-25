'use client';

import type { ProtocolId, ResolutionStatus } from '@/lib/types';

export const PROTOCOL_META: Record<
  ProtocolId,
  {
    name: string;
    short: string;
    dotColor: string;
    badgeClass: string;
    docsUrl: string;
  }
> = {
  hyperliquid: {
    name: 'Hyperliquid',
    short: 'HL',
    dotColor: 'bg-[#50e3c2]',
    badgeClass: 'border-[#50e3c2]/25 bg-[#50e3c2]/10 text-[#50e3c2]',
    docsUrl: 'https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api',
  },
  lighter: {
    name: 'Lighter',
    short: 'LTR',
    dotColor: 'bg-[#7dd3fc]',
    badgeClass: 'border-[#7dd3fc]/25 bg-[#7dd3fc]/10 text-[#7dd3fc]',
    docsUrl: 'https://docs.lighter.xyz/',
  },
  risex: {
    name: 'RISEx',
    short: 'RISE',
    dotColor: 'bg-[#8b6fff]',
    badgeClass: 'border-[#8b6fff]/30 bg-[#8b6fff]/12 text-[#b4a3ff]',
    docsUrl: 'https://docs.risechain.com/docs/risex',
  },
};

export function ProtocolBadge({ protocol }: { protocol: ProtocolId }) {
  const meta = PROTOCOL_META[protocol];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium tracking-wide ${meta.badgeClass}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dotColor}`} />
      {meta.name}
    </span>
  );
}

export function StatusPill({ status }: { status: ResolutionStatus }) {
  switch (status) {
    case 'resolved':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-400">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          Resolved
        </span>
      );
    case 'auth_required':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/25 bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-medium text-amber-300">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
          Auth Required
        </span>
      );
    case 'not_found':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-0.5 text-[11px] font-medium text-zinc-400">
          <span className="h-1.5 w-1.5 rounded-full bg-zinc-500" />
          Not Found
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/25 bg-red-500/10 px-2.5 py-0.5 text-[11px] font-medium text-red-400">
          <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
          Error
        </span>
      );
  }
}
