'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  KeyRound,
  Loader2,
  Radar,
  Search,
  X,
} from 'lucide-react';
import type {
  DirectoryResponse,
  ProtocolId,
  ProtocolLookupResult,
} from '@/lib/types';
import { DirectorySection } from './DirectorySection';
import { ProtocolResultPanel } from './MatchCard';
import { PROTOCOL_META } from './ProtocolBadge';

const PROTOCOLS: ProtocolId[] = ['hyperliquid', 'lighter', 'risex'];

const QUICK_EXAMPLES: Array<{
  label: string;
  query: string;
  tag: string;
}> = [
  { label: 'HYPURRFUN', query: 'HYPURRFUN', tag: 'HL Code' },
  { label: 'ALPHA', query: 'ALPHA', tag: 'HL Code' },
  { label: 'tread', query: 'tread', tag: 'RISEx Builder' },
  { label: 'cypher', query: 'cypher', tag: 'RISEx Builder' },
  { label: 'test', query: 'test', tag: 'RISEx Trader' },
  {
    label: '0x1442…f568',
    query: '0x1442ad477ded1b0028b57621aa7b6f7eadb8f568',
    tag: 'HL Wallet',
  },
  {
    label: '0x9c07…9226',
    query: '0x9c07627d108455985FBCc15863E15C0B07Be9226',
    tag: 'Lighter #1',
  },
];

interface ScanProgress {
  scannedInRun: number;
  totalBatch: number;
  totalIndexed: number;
  totalScannedEver: number;
}

const TOKEN_KEY = 'lighter_auth_token';
const tokenListeners = new Set<() => void>();

function subscribeLighterToken(callback: () => void) {
  tokenListeners.add(callback);
  return () => {
    tokenListeners.delete(callback);
  };
}

function getLighterTokenSnapshot(): string {
  if (typeof window === 'undefined') return '';
  return window.sessionStorage.getItem(TOKEN_KEY) ?? '';
}

function getLighterTokenServerSnapshot(): string {
  return '';
}

function updateStoredLighterToken(value: string) {
  if (typeof window === 'undefined') return;
  if (value) window.sessionStorage.setItem(TOKEN_KEY, value);
  else window.sessionStorage.removeItem(TOKEN_KEY);
  for (const listener of tokenListeners) listener();
}

export function LookupTerminal({
  initialDirectory,
}: {
  initialDirectory: DirectoryResponse | null;
}) {
  const [query, setQuery] = useState('');
  const [selectedProtocols, setSelectedProtocols] =
    useState<ProtocolId[]>(PROTOCOLS);
  const [results, setResults] = useState<ProtocolLookupResult[] | null>(null);
  const [lastQuery, setLastQuery] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [directory, setDirectory] = useState<DirectoryResponse | null>(
    initialDirectory
  );
  const lighterToken = useSyncExternalStore(
    subscribeLighterToken,
    getLighterTokenSnapshot,
    getLighterTokenServerSnapshot
  );
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [tokenDraft, setTokenDraft] = useState('');

  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState<ScanProgress | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const refreshDirectory = useCallback(async () => {
    try {
      const res = await fetch('/api/directory', { cache: 'no-store' });
      if (res.ok) {
        const data = (await res.json()) as DirectoryResponse;
        setDirectory(data);
      }
    } catch {
      // Non-blocking refresh
    }
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === '/' &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA'
      ) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      eventSourceRef.current?.close();
    };
  }, []);

  const runLookup = useCallback(
    async (overrideQuery?: string) => {
      const target = (overrideQuery ?? query).trim();
      if (!target) return;
      if (overrideQuery !== undefined) {
        setQuery(overrideQuery);
      }
      setIsLoading(true);
      setErrorMsg(null);
      setLastQuery(target);

      try {
        const res = await fetch('/api/lookup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: target,
            protocols: selectedProtocols,
            lighterAuthToken: lighterToken || undefined,
            autoQuickScan: true,
          }),
        });
        const data = (await res.json()) as {
          results?: ProtocolLookupResult[];
          error?: string;
        };
        if (!res.ok) {
          throw new Error(data.error || 'Lookup failed');
        }
        setResults(data.results ?? []);
        refreshDirectory();
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Lookup failed.');
      } finally {
        setIsLoading(false);
      }
    },
    [lighterToken, query, refreshDirectory, selectedProtocols]
  );

  const toggleProtocol = (id: ProtocolId) => {
    setSelectedProtocols((prev) => {
      if (prev.includes(id)) {
        return prev.length === 1 ? prev : prev.filter((p) => p !== id);
      }
      return [...prev, id];
    });
  };

  const startDeepScan = useCallback(
    (targetCode?: string, batchSize = 400) => {
      if (isScanning) return;
      eventSourceRef.current?.close();
      setIsScanning(true);
      setScanProgress({
        scannedInRun: 0,
        totalBatch: batchSize,
        totalIndexed: directory?.hyperliquid.indexedCount ?? 0,
        totalScannedEver: directory?.hyperliquid.scannedTradersCount ?? 0,
      });

      const params = new URLSearchParams({
        batchSize: String(batchSize),
      });
      if (targetCode) params.set('targetCode', targetCode);

      const es = new EventSource(`/api/hl/scan?${params.toString()}`);
      eventSourceRef.current = es;

      es.addEventListener('progress', (ev) => {
        try {
          const payload = JSON.parse(ev.data) as ScanProgress;
          setScanProgress(payload);
        } catch {
          // ignore malformed progress
        }
      });

      es.addEventListener('done', async (ev) => {
        es.close();
        setIsScanning(false);
        try {
          const payload = JSON.parse(ev.data) as {
            found?: { code: string };
            totalIndexed: number;
            totalScannedEver: number;
            scannedInRun: number;
          };
          setScanProgress((prev) =>
            prev
              ? {
                  ...prev,
                  scannedInRun: payload.scannedInRun,
                  totalIndexed: payload.totalIndexed,
                  totalScannedEver: payload.totalScannedEver,
                }
              : null
          );
          await refreshDirectory();
          if (payload.found?.code || targetCode) {
            await runLookup(targetCode || payload.found?.code);
          }
        } catch {
          await refreshDirectory();
        }
      });

      es.addEventListener('error', () => {
        es.close();
        setIsScanning(false);
      });
    },
    [directory, isScanning, refreshDirectory, runLookup]
  );

  const saveLighterToken = () => {
    const clean = tokenDraft.trim();
    updateStoredLighterToken(clean);
    setShowAuthModal(false);
    if (lastQuery) {
      void runLookup(lastQuery);
    }
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#090a0d] pb-[env(safe-area-inset-bottom)] text-[#ededed]">
      {/* Clean RISEx-style top header */}
      <header className="sticky top-0 z-30 border-b border-white/[0.07] bg-[#090a0d]/85 backdrop-blur-md">
        <div className="mx-auto flex min-h-14 max-w-5xl items-center justify-between gap-2 px-3.5 py-2 sm:px-6">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[#7c5cff]/40 bg-[#7c5cff]/15">
              <span className="h-2.5 w-2.5 rotate-45 rounded-[2px] bg-[#8b6fff]" />
            </div>
            <span className="shrink-0 text-sm font-semibold tracking-tight text-white">
              ref.lookup
            </span>
            <span className="hidden rounded border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-zinc-400 sm:inline-block">
              HL · Lighter · RISEx
            </span>
            <a
              href="https://x.com/anonfrxbt"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex shrink-0 items-center gap-1 rounded-full border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 text-[10px] font-medium text-zinc-400 transition hover:border-[#7c5cff]/50 hover:text-white sm:px-2.5 sm:text-[11px]"
            >
              <span>made by</span>
              <span className="font-mono text-[#b4a3ff]">anonfrxbt</span>
            </a>
          </div>

          <div className="flex shrink-0 items-center gap-2.5">
            <div className="hidden items-center gap-3 font-mono text-[11px] text-zinc-400 md:flex">
              <span>
                HL:{' '}
                <strong className="font-medium text-zinc-200 tabular-nums">
                  {directory?.hyperliquid.indexedCount ?? 0}
                </strong>{' '}
                codes
              </span>
              <span className="text-white/15">|</span>
              <span>
                RISEx:{' '}
                <strong className="font-medium text-zinc-200 tabular-nums">
                  {directory?.risex.buildersCount ?? 0}
                </strong>{' '}
                builders
              </span>
            </div>

            <button
              type="button"
              onClick={() => {
                setTokenDraft(lighterToken);
                setShowAuthModal(true);
              }}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
                lighterToken
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                  : 'border-white/[0.09] bg-[#0f1116] text-zinc-300 hover:border-white/20 hover:text-white'
              }`}
            >
              <KeyRound className="h-3.5 w-3.5 shrink-0" />
              <span className="sm:hidden">
                {lighterToken ? 'Token Set' : 'Auth'}
              </span>
              <span className="hidden sm:inline">
                {lighterToken ? 'Lighter Token Set' : 'Lighter Auth'}
              </span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-3.5 py-6 sm:px-6 sm:py-14">
        {/* Hero Search Terminal */}
        <div className="mx-auto max-w-3xl text-center">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-[#0f1116] px-3 py-1 text-[11px] font-medium text-zinc-400">
            <span className="h-1.5 w-1.5 rounded-full bg-[#8b6fff]" />
            <span>Multi-venue referral &amp; builder address resolver</span>
          </div>

          <h1 className="text-[22px] font-semibold leading-tight tracking-tight text-white sm:text-4xl">
            Find Address from Referral Code
          </h1>
          <p className="mt-2 text-[13px] leading-relaxed text-zinc-400 sm:mt-2.5 sm:text-[15px]">
            Query referral codes, builder slugs, trader usernames, or{' '}
            <code className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-xs text-zinc-200">
              0x
            </code>{' '}
            addresses across Hyperliquid, Lighter, and RISEx.
          </p>

          <div className="mt-3 flex items-center justify-center gap-3 font-mono text-[11px] text-zinc-400 md:hidden">
            <span>
              HL:{' '}
              <strong className="font-medium text-zinc-200 tabular-nums">
                {directory?.hyperliquid.indexedCount ?? 0}
              </strong>{' '}
              codes
            </span>
            <span className="text-white/15">|</span>
            <span>
              RISEx:{' '}
              <strong className="font-medium text-zinc-200 tabular-nums">
                {directory?.risex.buildersCount ?? 0}
              </strong>{' '}
              builders
            </span>
          </div>
        </div>

        {/* Search Input Form */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void runLookup();
          }}
          className="mx-auto mt-5 max-w-3xl sm:mt-7"
        >
          <div className="relative flex items-center rounded-xl border border-white/[0.11] bg-[#0f1116] p-1.5 shadow-[0_0_0_1px_rgba(255,255,255,0.02)] transition focus-within:border-[#7c5cff]/70 focus-within:ring-2 focus-within:ring-[#7c5cff]/20">
            <Search className="ml-2.5 h-4 w-4 shrink-0 text-zinc-500 sm:ml-3" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              enterKeyHint="search"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="Code, builder slug, username, or 0x..."
              className="h-11 min-w-0 flex-1 bg-transparent px-2.5 font-mono text-base text-white placeholder:font-sans placeholder:text-sm placeholder:text-zinc-500 focus:outline-none sm:px-3 sm:text-sm"
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  inputRef.current?.focus();
                }}
                className="mr-1 rounded-md p-2 text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-200 sm:mr-1.5 sm:p-1.5"
                aria-label="Clear query"
              >
                <X className="h-4 w-4" />
              </button>
            )}
            <button
              type="submit"
              disabled={isLoading || !query.trim()}
              className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg bg-[#7c5cff] px-3.5 text-xs font-semibold text-white transition hover:bg-[#6d4aff] disabled:cursor-not-allowed disabled:opacity-45 sm:gap-2 sm:px-5 sm:text-sm"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="hidden sm:inline">Resolving</span>
                </>
              ) : (
                <span>Resolve</span>
              )}
            </button>
          </div>

          {/* Protocol Filter Bar & Quick Samples */}
          <div className="mt-3.5 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div className="grid grid-cols-4 gap-1.5 sm:flex sm:flex-wrap sm:items-center">
              <button
                type="button"
                onClick={() => setSelectedProtocols(PROTOCOLS)}
                className={`rounded-lg border px-2 py-1.5 text-center text-xs font-medium transition sm:px-2.5 sm:py-1 ${
                  selectedProtocols.length === PROTOCOLS.length
                    ? 'border-white/20 bg-white/[0.09] text-white'
                    : 'border-white/[0.07] bg-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                All
              </button>
              {PROTOCOLS.map((id) => {
                const active = selectedProtocols.includes(id);
                const meta = PROTOCOL_META[id];
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => toggleProtocol(id)}
                    className={`inline-flex items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-medium transition sm:px-2.5 sm:py-1 ${
                      active
                        ? 'border-white/20 bg-[#14171f] text-white'
                        : 'border-white/[0.06] bg-transparent text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                        active ? meta.dotColor : 'bg-zinc-600'
                      }`}
                    />
                    <span className="truncate">{meta.name}</span>
                  </button>
                );
              })}
            </div>

            <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0">
              <span className="shrink-0 text-[11px] text-zinc-500">Try:</span>
              {QUICK_EXAMPLES.map((ex) => (
                <button
                  key={`${ex.tag}-${ex.label}`}
                  type="button"
                  onClick={() => void runLookup(ex.query)}
                  className="inline-flex shrink-0 items-center gap-1 rounded-md border border-white/[0.07] bg-[#0f1116] px-2.5 py-1.5 text-[11px] text-zinc-300 transition hover:border-white/20 hover:text-white sm:px-2 sm:py-0.5"
                >
                  <span className="font-mono">{ex.label}</span>
                  <span className="text-[10px] text-zinc-500">{ex.tag}</span>
                </button>
              ))}
            </div>
          </div>
        </form>

        {/* Live Scan Progress Bar */}
        {isScanning && scanProgress && (
          <div className="mx-auto mt-5 max-w-3xl rounded-xl border border-[#50e3c2]/25 bg-[#0f1116] p-3.5 sm:p-4">
            <div className="flex flex-col gap-2 text-xs sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 font-medium text-[#50e3c2]">
                <Radar className="h-4 w-4 shrink-0 animate-pulse" />
                <span>Scanning Hyperliquid Leaderboard…</span>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[11px] text-zinc-400 tabular-nums sm:justify-end sm:gap-3">
                <span>
                  {scanProgress.scannedInRun} / {scanProgress.totalBatch} wallets
                </span>
                <span>{scanProgress.totalIndexed} codes</span>
                <button
                  type="button"
                  onClick={() => {
                    eventSourceRef.current?.close();
                    setIsScanning(false);
                  }}
                  className="rounded border border-white/10 px-2.5 py-1 text-zinc-300 hover:bg-white/[0.06] sm:py-0.5"
                >
                  Stop
                </button>
              </div>
            </div>
            <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className="h-full rounded-full bg-[#50e3c2] transition-all duration-200"
                style={{
                  width: `${Math.min(
                    100,
                    Math.round(
                      (scanProgress.scannedInRun /
                        Math.max(scanProgress.totalBatch, 1)) *
                        100
                    )
                  )}%`,
                }}
              />
            </div>
          </div>
        )}

        {/* Error Alert */}
        {errorMsg && (
          <div className="mx-auto mt-6 max-w-3xl rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-300">
            {errorMsg}
          </div>
        )}

        {/* Lookup Results */}
        {results && (
          <div className="mt-8 space-y-4">
            <div className="flex items-center justify-between text-xs text-zinc-500">
              <span>
                Results for{' '}
                <code className="font-mono text-zinc-200">{lastQuery}</code>
              </span>
              <span className="font-mono">
                {results.reduce((acc, r) => acc + r.matches.length, 0)} match(es)
              </span>
            </div>

            {results.map((result) => (
              <ProtocolResultPanel
                key={result.protocol}
                result={result}
                onInspectQuery={(val) => void runLookup(val)}
                onTriggerDeepScan={() => startDeepScan(lastQuery, 400)}
                onOpenAuthModal={() => {
                  setTokenDraft(lighterToken);
                  setShowAuthModal(true);
                }}
                isScanning={isScanning}
              />
            ))}
          </div>
        )}

        {/* Directory & Protocol Capabilities */}
        <DirectorySection
          directory={directory}
          onSelectQuery={(q) => void runLookup(q)}
          onScanMore={() => startDeepScan(undefined, 300)}
          isScanning={isScanning}
        />
      </main>

      {/* Lighter Auth Modal */}
      {showAuthModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-white/[0.1] bg-[#0f1116] p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-[#7dd3fc]" />
                <h2 className="text-sm font-semibold text-white">
                  Lighter Authorization Token (Optional)
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowAuthModal(false)}
                className="rounded-md p-1 text-zinc-400 hover:bg-white/[0.06] hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="mt-2.5 text-xs leading-relaxed text-zinc-400">
              Lighter&apos;s <code>/api/v1/referral/get</code> endpoint requires an{' '}
              <code>Authorization</code> token. Your token is stored only in{' '}
              <code>sessionStorage</code> and forwarded solely to{' '}
              <code>mainnet.zklighter.elliot.ai</code> when resolving Lighter queries.
            </p>

            <input
              type="password"
              value={tokenDraft}
              onChange={(e) => setTokenDraft(e.target.value)}
              placeholder="Paste Lighter auth token..."
              className="mt-4 h-10 w-full rounded-lg border border-white/[0.1] bg-[#14171f] px-3 font-mono text-base text-white placeholder:text-sm placeholder:text-zinc-500 focus:border-[#7c5cff]/60 focus:outline-none sm:text-xs"
            />

            <div className="mt-4 flex items-center justify-end gap-2">
              {lighterToken && (
                <button
                  type="button"
                  onClick={() => {
                    setTokenDraft('');
                    updateStoredLighterToken('');
                    setShowAuthModal(false);
                  }}
                  className="mr-auto rounded-lg border border-red-500/25 px-3 py-1.5 text-xs font-medium text-red-300 hover:bg-red-500/10"
                >
                  Clear Token
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowAuthModal(false)}
                className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-white/[0.05]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveLighterToken}
                className="rounded-lg bg-[#7c5cff] px-3.5 py-1.5 text-xs font-medium text-white hover:bg-[#6d4aff]"
              >
                Save Token
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
