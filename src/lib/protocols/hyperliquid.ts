import {
  loadIndexState,
  markHyperliquidScanned,
  saveIndexState,
  upsertHyperliquidRecord,
} from '../cache';
import type {
  IndexedReferralRecord,
  ProtocolLookupResult,
  ResolutionMatch,
} from '../types';

const HL_INFO_URL = 'https://api.hyperliquid.xyz/info';
const HL_LEADERBOARD_URL = 'https://stats-data.hyperliquid.xyz/Mainnet/leaderboard';
const HL_VAULTS_URL = 'https://stats-data.hyperliquid.xyz/Mainnet/vaults';

export interface HlLeaderboardRow {
  ethAddress: string;
  accountValue: string;
  displayName?: string | null;
  windowPerformances: Array<
    [
      string,
      {
        pnl: string;
        roi: string;
        vlm: string;
      },
    ]
  >;
}

interface HlReferralResponse {
  referredBy?: {
    referrer: string;
    code: string;
  } | null;
  cumVlm?: string;
  unclaimedRewards?: string;
  claimedRewards?: string;
  builderRewards?: string;
  referrerState?: {
    stage: string;
    data?: {
      code?: string;
      referralStates?: Array<{
        cumVlm: string;
        cumRewardedFeesSinceReferred: string;
        cumFeesRewardedToReferrer: string;
        timeJoined: number;
        user: string;
      }>;
    };
  };
}

let cachedLeaderboard: { rows: HlLeaderboardRow[]; fetchedAt: number } | null = null;
let cachedPool: { rows: HlLeaderboardRow[]; fetchedAt: number } | null = null;

export function isEvmAddress(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value.trim());
}

export function formatUsd(raw?: string | number | null): string {
  if (raw === undefined || raw === null || raw === '') return '$0.00';
  const num = typeof raw === 'number' ? raw : Number.parseFloat(raw);
  if (!Number.isFinite(num)) return '$0.00';
  if (Math.abs(num) >= 1_000_000_000) return `$${(num / 1_000_000_000).toFixed(2)}B`;
  if (Math.abs(num) >= 1_000_000) return `$${(num / 1_000_000).toFixed(2)}M`;
  if (Math.abs(num) >= 1_000) return `$${(num / 1_000).toFixed(2)}K`;
  return `$${num.toFixed(2)}`;
}

export async function fetchHlLeaderboard(): Promise<HlLeaderboardRow[]> {
  const now = Date.now();
  if (cachedLeaderboard && now - cachedLeaderboard.fetchedAt < 10 * 60 * 1000) {
    return cachedLeaderboard.rows;
  }
  const res = await fetch(HL_LEADERBOARD_URL, {
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new Error(`Hyperliquid leaderboard returned ${res.status}`);
  }
  const json = (await res.json()) as { leaderboardRows?: HlLeaderboardRow[] };
  const rows = (json.leaderboardRows ?? []).slice().sort((a, b) => {
    const valA = Number.parseFloat(a.accountValue || '0') || 0;
    const valB = Number.parseFloat(b.accountValue || '0') || 0;
    return valB - valA;
  });
  cachedLeaderboard = { rows, fetchedAt: now };
  return rows;
}

export async function fetchHlAddressPool(): Promise<HlLeaderboardRow[]> {
  const now = Date.now();
  if (cachedPool && now - cachedPool.fetchedAt < 10 * 60 * 1000) {
    return cachedPool.rows;
  }
  const [lbRows, vaultsRes] = await Promise.all([
    fetchHlLeaderboard(),
    fetch(HL_VAULTS_URL, {
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    }).catch(() => null),
  ]);

  const seen = new Set<string>();
  const combined: HlLeaderboardRow[] = [];

  for (const row of lbRows) {
    const key = row.ethAddress.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      combined.push(row);
    }
  }

  if (vaultsRes && vaultsRes.ok) {
    const vaults = (await vaultsRes.json()) as Array<{
      summary?: { leader?: string; name?: string };
    }>;
    for (const v of vaults ?? []) {
      const leader = v?.summary?.leader;
      if (!leader) continue;
      const key = leader.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        combined.push({
          ethAddress: leader,
          accountValue: '0',
          displayName: v.summary?.name || null,
          windowPerformances: [],
        });
      }
    }
  }

  cachedPool = { rows: combined, fetchedAt: now };
  return combined;
}

export async function fetchHlReferralByUser(
  address: string
): Promise<HlReferralResponse | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(HL_INFO_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'referral', user: address }),
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    });
    if (res.status === 429 && attempt === 0) {
      await new Promise((r) => setTimeout(r, 1500));
      continue;
    }
    if (!res.ok) return null;
    const data = (await res.json()) as HlReferralResponse | null;
    return data;
  }
  return null;
}

async function indexHlResponse(
  address: string,
  data: HlReferralResponse,
  row?: HlLeaderboardRow
): Promise<void> {
  const ownCode = data.referrerState?.data?.code?.trim();
  if (ownCode) {
    await upsertHyperliquidRecord(
      {
        code: ownCode,
        address,
        displayName: row?.displayName || undefined,
        source: 'referrer_state',
        accountValue: row?.accountValue,
        cumVlm: data.cumVlm,
        referredCount: data.referrerState?.data?.referralStates?.length ?? 0,
      },
      address
    );
  }
  if (data.referredBy?.code && data.referredBy?.referrer) {
    await upsertHyperliquidRecord({
      code: data.referredBy.code.trim(),
      address: data.referredBy.referrer,
      source: 'referred_by',
    });
  }
}

function buildMatchFromReferral(
  address: string,
  data: HlReferralResponse,
  matchSource: ResolutionMatch['matchSource'],
  verifiedVia: string,
  row?: HlLeaderboardRow
): ResolutionMatch {
  const ownCode = data.referrerState?.data?.code?.trim();
  const referrals = data.referrerState?.data?.referralStates ?? [];
  const totalRewards =
    (Number.parseFloat(data.unclaimedRewards || '0') || 0) +
    (Number.parseFloat(data.claimedRewards || '0') || 0);

  return {
    protocol: 'hyperliquid',
    address,
    code: ownCode || undefined,
    displayName: row?.displayName || undefined,
    matchSource,
    verifiedVia,
    explorerUrl: `https://app.hyperliquid.xyz/explorer/address/${address}`,
    appReferralUrl: ownCode ? `https://app.hyperliquid.xyz/join/${ownCode}` : undefined,
    metrics: [
      {
        label: 'Own Referral Code',
        value: ownCode || (data.referrerState?.stage ?? 'None'),
        mono: true,
        tone: ownCode ? 'accent' : 'muted',
      },
      {
        label: 'Referred Users',
        value: referrals.length.toLocaleString(),
        mono: true,
      },
      {
        label: 'Cumulative Volume',
        value: formatUsd(data.cumVlm),
        mono: true,
      },
      {
        label: 'Total Referral Rewards',
        value: formatUsd(totalRewards),
        mono: true,
        tone: totalRewards > 0 ? 'positive' : 'default',
      },
      ...(row?.accountValue
        ? [
            {
              label: 'Account Equity',
              value: formatUsd(row.accountValue),
              mono: true,
            },
          ]
        : []),
    ],
    referredBy: data.referredBy
      ? {
          referrer: data.referredBy.referrer,
          code: data.referredBy.code,
        }
      : undefined,
    referredUsers: referrals.map((ref) => ({
      address: ref.user,
      volume: formatUsd(ref.cumVlm),
      feesRewarded: formatUsd(ref.cumFeesRewardedToReferrer),
      joinedAt: ref.timeJoined,
    })),
  };
}

export async function scanHlBatch(options: {
  batchSize?: number;
  concurrency?: number;
  targetCode?: string;
  onProgress?: (progress: {
    scannedInRun: number;
    totalBatch: number;
    totalIndexed: number;
    totalScannedEver: number;
    found?: IndexedReferralRecord;
  }) => void;
}): Promise<{
  scannedInRun: number;
  found?: IndexedReferralRecord;
  totalIndexed: number;
  totalScannedEver: number;
}> {
  const batchSize = Math.min(Math.max(options.batchSize ?? 120, 10), 1500);
  const concurrency = Math.min(Math.max(options.concurrency ?? 18, 1), 30);
  const targetUpper = options.targetCode?.trim().toUpperCase();

  const [state, leaderboard] = await Promise.all([
    loadIndexState(),
    fetchHlAddressPool(),
  ]);

  if (targetUpper && state.hlCodes[targetUpper]) {
    return {
      scannedInRun: 0,
      found: state.hlCodes[targetUpper],
      totalIndexed: Object.keys(state.hlCodes).length,
      totalScannedEver: state.hlScannedAddresses.length,
    };
  }

  const scannedSet = new Set(state.hlScannedAddresses);
  const pending = leaderboard
    .filter((r) => !scannedSet.has(r.ethAddress.toLowerCase()))
    .slice(0, batchSize);

  let cursor = 0;
  let scannedInRun = 0;
  let found: IndexedReferralRecord | undefined;
  const newlyScanned: string[] = [];

  async function worker(): Promise<void> {
    while (cursor < pending.length && !found) {
      const idx = cursor++;
      const row = pending[idx];
      if (!row) break;
      try {
        const data = await fetchHlReferralByUser(row.ethAddress);
        newlyScanned.push(row.ethAddress);
        if (data) {
          await indexHlResponse(row.ethAddress, data, row);
          if (targetUpper && state.hlCodes[targetUpper]) {
            found = state.hlCodes[targetUpper];
          }
        }
      } catch {
        // Skip transient errors during parallel scan
      } finally {
        scannedInRun++;
        if (scannedInRun % 10 === 0 || scannedInRun === pending.length || found) {
          options.onProgress?.({
            scannedInRun,
            totalBatch: pending.length,
            totalIndexed: Object.keys(state.hlCodes).length,
            totalScannedEver: state.hlScannedAddresses.length + newlyScanned.length,
            found,
          });
        }
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  await markHyperliquidScanned(newlyScanned);
  await saveIndexState();

  return {
    scannedInRun,
    found,
    totalIndexed: Object.keys(state.hlCodes).length,
    totalScannedEver: state.hlScannedAddresses.length,
  };
}

export async function resolveHyperliquid(
  rawQuery: string,
  options?: { autoQuickScan?: boolean }
): Promise<ProtocolLookupResult> {
  const query = rawQuery.trim();
  if (!query) {
    return {
      protocol: 'hyperliquid',
      status: 'not_found',
      matches: [],
      message: 'Enter a referral code, trader name, or 0x address.',
    };
  }

  try {
    // 1. Direct EVM address lookup
    if (isEvmAddress(query)) {
      const [data, leaderboard] = await Promise.all([
        fetchHlReferralByUser(query),
        fetchHlLeaderboard().catch(() => []),
      ]);
      const row = leaderboard.find(
        (r) => r.ethAddress.toLowerCase() === query.toLowerCase()
      );
      if (!data) {
        return {
          protocol: 'hyperliquid',
          status: 'not_found',
          matches: [],
          message: 'No Hyperliquid referral profile returned for this address.',
        };
      }
      await indexHlResponse(query, data, row);
      await saveIndexState();

      const matches: ResolutionMatch[] = [
        buildMatchFromReferral(
          query,
          data,
          'wallet_address',
          'Hyperliquid Info API (type: referral)',
          row
        ),
      ];

      // Also surface the referrer if this wallet was referred by someone
      if (data.referredBy?.referrer) {
        const refData = await fetchHlReferralByUser(data.referredBy.referrer);
        const refRow = leaderboard.find(
          (r) => r.ethAddress.toLowerCase() === data.referredBy!.referrer.toLowerCase()
        );
        if (refData) {
          await indexHlResponse(data.referredBy.referrer, refData, refRow);
          await saveIndexState();
          matches.push(
            buildMatchFromReferral(
              data.referredBy.referrer,
              refData,
              'referred_by_referee',
              `Referrer of ${query.slice(0, 8)}… via code "${data.referredBy.code}"`,
              refRow
            )
          );
        }
      }

      return {
        protocol: 'hyperliquid',
        status: 'resolved',
        matches,
        message: 'Resolved Hyperliquid referral profile from wallet address.',
      };
    }

    // 2. Referral code lookup against persistent index
    const codeUpper = query.toUpperCase();
    const state = await loadIndexState();
    let indexed = state.hlCodes[codeUpper];

    // 3. Also check leaderboard displayName match
    const leaderboard = await fetchHlLeaderboard().catch(() => []);
    const nameMatch = leaderboard.find(
      (r) => r.displayName && r.displayName.trim().toLowerCase() === query.toLowerCase()
    );

    if (nameMatch) {
      const data = await fetchHlReferralByUser(nameMatch.ethAddress);
      if (data) {
        await indexHlResponse(nameMatch.ethAddress, data, nameMatch);
        await saveIndexState();
        return {
          protocol: 'hyperliquid',
          status: 'resolved',
          matches: [
            buildMatchFromReferral(
              nameMatch.ethAddress,
              data,
              'leaderboard_name',
              'Hyperliquid Leaderboard Display Name -> Info API',
              nameMatch
            ),
          ],
          message: `Resolved trader "${nameMatch.displayName}" on Hyperliquid leaderboard.`,
        };
      }
    }

    // 4. If not cached yet and autoQuickScan is enabled, scan a fast initial batch
    if (!indexed && options?.autoQuickScan !== false) {
      const scanRes = await scanHlBatch({
        batchSize: 120,
        concurrency: 20,
        targetCode: codeUpper,
      });
      if (scanRes.found) {
        indexed = scanRes.found;
      }
    }

    if (indexed) {
      const [liveData] = await Promise.all([
        fetchHlReferralByUser(indexed.address),
      ]);
      const row = leaderboard.find(
        (r) => r.ethAddress.toLowerCase() === indexed.address.toLowerCase()
      );
      if (liveData) {
        await indexHlResponse(indexed.address, liveData, row);
        await saveIndexState();
        return {
          protocol: 'hyperliquid',
          status: 'resolved',
          matches: [
            buildMatchFromReferral(
              indexed.address,
              liveData,
              indexed.source === 'referred_by' ? 'referred_by_referee' : 'referral_code',
              indexed.source === 'referred_by'
                ? 'Discovered via referredBy.referrer on Hyperliquid Info API'
                : 'Verified via referrerState.data.code on Hyperliquid Info API',
              row
            ),
          ],
          message: `Resolved Hyperliquid code "${indexed.code}" to ${indexed.address}.`,
        };
      }
      return {
        protocol: 'hyperliquid',
        status: 'resolved',
        matches: [
          {
            protocol: 'hyperliquid',
            address: indexed.address,
            code: indexed.code,
            displayName: indexed.displayName,
            matchSource:
              indexed.source === 'referred_by' ? 'referred_by_referee' : 'referral_code',
            verifiedVia: 'Cached Hyperliquid Referral Index',
            explorerUrl: `https://app.hyperliquid.xyz/explorer/address/${indexed.address}`,
            appReferralUrl: `https://app.hyperliquid.xyz/join/${indexed.code}`,
            metrics: [
              { label: 'Referral Code', value: indexed.code, mono: true, tone: 'accent' },
              ...(indexed.cumVlm
                ? [{ label: 'Volume', value: formatUsd(indexed.cumVlm), mono: true }]
                : []),
            ],
          },
        ],
        message: `Resolved Hyperliquid code "${indexed.code}" from local index.`,
      };
    }

  return {
    protocol: 'hyperliquid',
    status: 'not_found',
    matches: [],
    canDeepScan: true,
    message: `Code "${codeUpper}" not yet found across ${state.hlScannedAddresses.length.toLocaleString()} scanned addresses.`,
    hint: `Hyperliquid has no direct code-to-address endpoint; click "Scan All HL Wallets" to scan continuously across all ~${leaderboard.length.toLocaleString()} leaderboard & vault leader wallets from your browser, or enter any wallet address that used this code.`,
  };
  } catch (error) {
    return {
      protocol: 'hyperliquid',
      status: 'error',
      matches: [],
      message:
        error instanceof Error
          ? error.message
          : 'Failed to query Hyperliquid Info API.',
    };
  }
}
