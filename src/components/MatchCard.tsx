'use client';

import { useState } from 'react';
import {
  ArrowUpRight,
  Check,
  Copy,
  KeyRound,
  Radar,
  Search,
  UserCheck,
} from 'lucide-react';
import type { ProtocolLookupResult, ResolutionMatch } from '@/lib/types';
import { ProtocolBadge, StatusPill } from './ProtocolBadge';

const MATCH_SOURCE_LABELS: Record<ResolutionMatch['matchSource'], string> = {
  referral_code: 'Referral Code Owner',
  referred_by_referee: 'Discovered via Referred Account',
  builder_code: 'Builder Fee Recipient',
  trader_username: 'Trader Username',
  wallet_address: 'Direct Address Lookup',
  leaderboard_name: 'Leaderboard Display Name',
  account_index: 'Account Index',
};

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Ignore clipboard failures in restricted contexts
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs font-medium text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.08]"
      title="Copy to clipboard"
    >
      {copied ? (
        <>
          <Check className="h-3.5 w-3.5 text-emerald-400" />
          <span className="text-emerald-400">Copied</span>
        </>
      ) : (
        <>
          <Copy className="h-3.5 w-3.5 text-zinc-400" />
          <span>{label ?? 'Copy'}</span>
        </>
      )}
    </button>
  );
}

function MatchCard({
  match,
  onInspectQuery,
}: {
  match: ResolutionMatch;
  onInspectQuery: (value: string) => void;
}) {
  return (
    <div className="rounded-lg border border-white/[0.07] bg-[#14171f] p-4 transition hover:border-white/[0.14]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <span className="rounded bg-white/[0.06] px-2 py-0.5 text-[11px] font-medium text-zinc-300">
              {MATCH_SOURCE_LABELS[match.matchSource]}
            </span>
            {match.displayName && (
              <span className="text-xs font-medium text-zinc-400">
                {match.displayName}
              </span>
            )}
            <span className="text-[11px] text-zinc-500">
              via {match.verifiedVia}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <code className="break-all font-mono text-sm font-semibold tracking-tight text-white sm:text-[15px]">
              {match.address}
            </code>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <CopyButton text={match.address} label="Copy Address" />
          <button
            type="button"
            onClick={() => onInspectQuery(match.address)}
            className="inline-flex items-center gap-1.5 rounded-md border border-[#7c5cff]/35 bg-[#7c5cff]/12 px-2.5 py-1 text-xs font-medium text-[#c4b5fd] transition hover:border-[#7c5cff]/60 hover:bg-[#7c5cff]/20"
            title="Inspect this address across all protocols"
          >
            <Search className="h-3.5 w-3.5" />
            <span>Inspect</span>
          </button>
          {match.explorerUrl && (
            <a
              href={match.explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1 text-xs font-medium text-zinc-300 transition hover:border-white/20 hover:text-white"
            >
              <span>Explorer</span>
              <ArrowUpRight className="h-3.5 w-3.5 text-zinc-400" />
            </a>
          )}
        </div>
      </div>

      {match.metrics.length > 0 && (
        <div className="mt-3.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {match.metrics.map((m) => (
            <div
              key={m.label}
              className="rounded-md border border-white/[0.05] bg-[#0f1116] px-3 py-2"
            >
              <div className="text-[11px] text-zinc-500">{m.label}</div>
              <div
                className={`mt-0.5 truncate text-xs font-medium tabular-nums sm:text-[13px] ${
                  m.mono ? 'font-mono' : ''
                } ${
                  m.tone === 'positive'
                    ? 'text-emerald-400'
                    : m.tone === 'accent'
                      ? 'text-[#b4a3ff]'
                      : m.tone === 'muted'
                        ? 'text-zinc-500'
                        : 'text-zinc-100'
                }`}
                title={m.value}
              >
                {m.value}
              </div>
            </div>
          ))}
        </div>
      )}

      {match.referredBy && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-white/[0.05] bg-[#0f1116] px-3 py-2 text-xs">
          <div className="flex flex-wrap items-center gap-2 text-zinc-400">
            <UserCheck className="h-3.5 w-3.5 text-[#50e3c2]" />
            <span>Referred by code</span>
            <button
              type="button"
              onClick={() => onInspectQuery(match.referredBy!.code)}
              className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[11px] font-medium text-white hover:bg-white/[0.12]"
            >
              {match.referredBy.code}
            </button>
            <span>→</span>
            <button
              type="button"
              onClick={() => onInspectQuery(match.referredBy!.referrer)}
              className="font-mono text-zinc-200 underline decoration-white/20 underline-offset-2 hover:text-white"
            >
              {match.referredBy.referrer}
            </button>
          </div>
          <CopyButton text={match.referredBy.referrer} label="Copy Referrer" />
        </div>
      )}

      {match.referredUsers && match.referredUsers.length > 0 && (
        <div className="mt-3 rounded-md border border-white/[0.05] bg-[#0f1116] p-3">
          <div className="mb-2 flex items-center justify-between text-[11px] font-medium text-zinc-400">
            <span>Top Referred Addresses ({match.referredUsers.length} shown)</span>
            <span className="font-mono text-zinc-500">Volume / Rewards</span>
          </div>
          <div className="divide-y divide-white/[0.05]">
            {match.referredUsers.slice(0, 5).map((ref) => (
              <div
                key={ref.address}
                className="flex items-center justify-between gap-3 py-1.5 text-xs"
              >
                <button
                  type="button"
                  onClick={() => onInspectQuery(ref.address)}
                  className="truncate font-mono text-zinc-300 hover:text-white"
                >
                  {ref.address}
                </button>
                <div className="flex shrink-0 items-center gap-3 font-mono text-[11px] tabular-nums">
                  <span className="text-zinc-400">{ref.volume}</span>
                  <span className="text-emerald-400">{ref.feesRewarded}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function ProtocolResultPanel({
  result,
  onInspectQuery,
  onTriggerDeepScan,
  onOpenAuthModal,
  isScanning,
}: {
  result: ProtocolLookupResult;
  onInspectQuery: (value: string) => void;
  onTriggerDeepScan: () => void;
  onOpenAuthModal: () => void;
  isScanning: boolean;
}) {
  return (
    <section className="rounded-xl border border-white/[0.08] bg-[#0f1116] p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2.5">
          <ProtocolBadge protocol={result.protocol} />
          <StatusPill status={result.status} />
        </div>
        <p className="text-xs text-zinc-400">{result.message}</p>
      </div>

      {result.matches.length > 0 && (
        <div className="mt-4 space-y-3">
          {result.matches.map((match, idx) => (
            <MatchCard
              key={`${match.protocol}-${match.address}-${match.matchSource}-${idx}`}
              match={match}
              onInspectQuery={onInspectQuery}
            />
          ))}
        </div>
      )}

      {(result.hint || result.canDeepScan || result.requiresAuth) && (
        <div className="mt-3.5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/[0.06] bg-[#14171f]/70 px-3.5 py-2.5">
          <p className="text-xs leading-relaxed text-zinc-400">
            {result.hint ??
              'Add an optional Lighter Auth Token to query referral codes on Lighter.'}
          </p>
          <div className="flex shrink-0 items-center gap-2">
            {result.canDeepScan && (
              <button
                type="button"
                onClick={onTriggerDeepScan}
                disabled={isScanning}
                className="inline-flex items-center gap-1.5 rounded-md border border-[#50e3c2]/30 bg-[#50e3c2]/12 px-3 py-1.5 text-xs font-medium text-[#50e3c2] transition hover:bg-[#50e3c2]/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Radar className="h-3.5 w-3.5" />
                <span>
                  {isScanning ? 'Scanning…' : 'Deep Scan (+400 Wallets)'}
                </span>
              </button>
            )}
            {result.requiresAuth && (
              <button
                type="button"
                onClick={onOpenAuthModal}
                className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/12 px-3 py-1.5 text-xs font-medium text-amber-300 transition hover:bg-amber-500/20"
              >
                <KeyRound className="h-3.5 w-3.5" />
                <span>Set Lighter Token</span>
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
