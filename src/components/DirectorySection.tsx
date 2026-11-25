'use client';

import { useMemo, useState } from 'react';
import { ArrowUpRight, Database, Layers, Radar, ShieldAlert } from 'lucide-react';
import type { DirectoryResponse } from '@/lib/types';
import { PROTOCOL_META } from './ProtocolBadge';

type DirectoryTab = 'hl' | 'risex' | 'matrix';

export function DirectorySection({
  directory,
  onSelectQuery,
  onScanMore,
  isScanning,
}: {
  directory: DirectoryResponse | null;
  onSelectQuery: (query: string) => void;
  onScanMore: () => void;
  isScanning: boolean;
}) {
  const [tab, setTab] = useState<DirectoryTab>('hl');
  const [filter, setFilter] = useState('');

  const filteredHl = useMemo(() => {
    const records = directory?.hyperliquid.records ?? [];
    const q = filter.trim().toLowerCase();
    if (!q) return records;
    return records.filter(
      (r) =>
        r.code.toLowerCase().includes(q) ||
        r.address.toLowerCase().includes(q) ||
        (r.displayName && r.displayName.toLowerCase().includes(q))
    );
  }, [directory, filter]);

  const filteredRisex = useMemo(() => {
    const builders = directory?.risex.builders ?? [];
    const q = filter.trim().toLowerCase();
    if (!q) return builders;
    return builders.filter(
      (b) =>
        b.slug.toLowerCase().includes(q) ||
        b.name.toLowerCase().includes(q) ||
        b.feeRecipient.toLowerCase().includes(q)
    );
  }, [directory, filter]);

  return (
    <section className="mt-10 rounded-xl border border-white/[0.08] bg-[#0f1116]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setTab('hl')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
              tab === 'hl'
                ? 'bg-white/[0.09] text-white'
                : 'text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200'
            }`}
          >
            <Database className="h-3.5 w-3.5 text-[#50e3c2]" />
            <span>Hyperliquid Index</span>
            <span className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10px] text-zinc-300 tabular-nums">
              {directory?.hyperliquid.indexedCount ?? 0}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setTab('risex')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
              tab === 'risex'
                ? 'bg-white/[0.09] text-white'
                : 'text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200'
            }`}
          >
            <Layers className="h-3.5 w-3.5 text-[#8b6fff]" />
            <span>RISEx Builders</span>
            <span className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10px] text-zinc-300 tabular-nums">
              {directory?.risex.buildersCount ?? 0}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setTab('matrix')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
              tab === 'matrix'
                ? 'bg-white/[0.09] text-white'
                : 'text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200'
            }`}
          >
            <ShieldAlert className="h-3.5 w-3.5 text-zinc-400" />
            <span>API Capabilities</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          {tab !== 'matrix' && (
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter code or 0x..."
              className="h-8 w-44 rounded-lg border border-white/[0.08] bg-[#14171f] px-2.5 text-xs text-zinc-200 placeholder:text-zinc-500 focus:border-[#7c5cff]/60 focus:outline-none sm:w-56"
            />
          )}
          {tab === 'hl' && (
            <button
              type="button"
              onClick={onScanMore}
              disabled={isScanning}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#50e3c2]/30 bg-[#50e3c2]/10 px-3 text-xs font-medium text-[#50e3c2] transition hover:bg-[#50e3c2]/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Radar className="h-3.5 w-3.5" />
              <span>{isScanning ? 'Scanning…' : 'Index +300 Traders'}</span>
            </button>
          )}
        </div>
      </div>

      {tab === 'hl' && (
        <div className="overflow-x-auto">
          {filteredHl.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <p className="text-sm text-zinc-300">
                No Hyperliquid referral codes indexed locally yet.
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                Search any referral code or click &ldquo;Index +300 Traders&rdquo; to populate the local index from Hyperliquid&apos;s leaderboard.
              </p>
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-white/[0.06] text-[11px] uppercase tracking-wider text-zinc-500">
                  <th className="px-5 py-2.5 font-medium">Code</th>
                  <th className="px-4 py-2.5 font-medium">Address</th>
                  <th className="px-4 py-2.5 font-medium">Trader</th>
                  <th className="px-4 py-2.5 font-medium">Referred</th>
                  <th className="px-5 py-2.5 text-right font-medium">Discovery</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {filteredHl.slice(0, 40).map((row) => (
                  <tr
                    key={`${row.codeUpper}-${row.address}`}
                    onClick={() => onSelectQuery(row.code)}
                    className="cursor-pointer transition hover:bg-white/[0.03]"
                  >
                    <td className="px-5 py-2.5 font-mono font-medium text-[#50e3c2]">
                      {row.code}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-zinc-200">
                      {row.address}
                    </td>
                    <td className="px-4 py-2.5 text-zinc-400">
                      {row.displayName || '—'}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-zinc-300 tabular-nums">
                      {row.referredCount ?? '—'}
                    </td>
                    <td className="px-5 py-2.5 text-right">
                      <span className="rounded bg-white/[0.05] px-2 py-0.5 text-[10px] font-medium text-zinc-400">
                        {row.source === 'referrer_state'
                          ? 'Direct Owner'
                          : 'via Referee'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'risex' && (
        <div className="overflow-x-auto">
          {filteredRisex.length === 0 ? (
            <div className="px-5 py-10 text-center text-xs text-zinc-500">
              No RISEx builders matched your filter.
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-white/[0.06] text-[11px] uppercase tracking-wider text-zinc-500">
                  <th className="px-5 py-2.5 font-medium">Builder Slug</th>
                  <th className="px-4 py-2.5 font-medium">Name</th>
                  <th className="px-4 py-2.5 font-medium">Fee Recipient Address</th>
                  <th className="px-5 py-2.5 text-right font-medium">ID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {filteredRisex.map((b) => (
                  <tr
                    key={b.builderId}
                    onClick={() => onSelectQuery(b.slug)}
                    className="cursor-pointer transition hover:bg-white/[0.03]"
                  >
                    <td className="px-5 py-2.5 font-mono font-medium text-[#b4a3ff]">
                      {b.slug}
                    </td>
                    <td className="px-4 py-2.5 text-zinc-200">{b.name}</td>
                    <td className="px-4 py-2.5 font-mono text-zinc-300">
                      {b.feeRecipient}
                    </td>
                    <td className="px-5 py-2.5 text-right font-mono text-zinc-500">
                      #{b.builderId}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'matrix' && (
        <div className="divide-y divide-white/[0.06] p-5 text-xs">
          <div className="grid gap-4 pb-4 sm:grid-cols-3">
            <div>
              <div className="font-medium text-white">Hyperliquid</div>
              <a
                href={PROTOCOL_META.hyperliquid.docsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-[#50e3c2] hover:underline"
              >
                <span>Official API Docs</span>
                <ArrowUpRight className="h-3 w-3" />
              </a>
            </div>
            <div className="text-zinc-300 sm:col-span-2">
              <p>
                <code>POST /info</code> (<code>{`{ type: "referral", user }`}</code>) queries by address and returns both{' '}
                <code>referrerState.data.code</code> and <code>referredBy.referrer</code>. Because Hyperliquid has no native reverse code endpoint, this app pairs direct address/name lookups with a concurrent leaderboard scanner &amp; local index.
              </p>
            </div>
          </div>

          <div className="grid gap-4 py-4 sm:grid-cols-3">
            <div>
              <div className="font-medium text-white">Lighter</div>
              <a
                href={PROTOCOL_META.lighter.docsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-[#7dd3fc] hover:underline"
              >
                <span>Official API Docs</span>
                <ArrowUpRight className="h-3 w-3" />
              </a>
            </div>
            <div className="text-zinc-300 sm:col-span-2">
              <p>
                <code>GET /api/v1/account</code> publicly resolves any <code>l1_address</code> or <code>account_index</code>. Referral endpoints (<code>/api/v1/referral/get</code>, <code>userReferrals</code>) require an <code>Authorization</code> token and do not provide a global reverse code endpoint; adding an optional token unlocks authenticated lookup &amp; leaderboard scanning.
              </p>
            </div>
          </div>

          <div className="grid gap-4 pt-4 sm:grid-cols-3">
            <div>
              <div className="font-medium text-white">RISEx</div>
              <a
                href={PROTOCOL_META.risex.docsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-[#b4a3ff] hover:underline"
              >
                <span>Official API Docs</span>
                <ArrowUpRight className="h-3 w-3" />
              </a>
            </div>
            <div className="text-zinc-300 sm:col-span-2">
              <p>
                <code>GET /v1/builders/{'{slug}'}</code> publicly resolves builder slugs directly to their <code>fee_recipient</code> address, and <code>GET /v1/traders/{'{username}'}</code> resolves trader usernames to wallet addresses. Referral V2 custom slugs are UI-managed and not exposed via public REST endpoints yet.
              </p>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
