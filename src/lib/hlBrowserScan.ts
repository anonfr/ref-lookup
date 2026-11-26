import type { IndexedReferralRecord } from './types';

const HL_INFO_URL = 'https://api.hyperliquid.xyz/info';
const LOCAL_CODES_KEY = 'hl_discovered_codes_v1';
const LOCAL_SCANNED_KEY = 'hl_scanned_addresses_v1';

interface HlAddressItem {
  address: string;
  displayName?: string;
  accountValue?: string;
}

interface HlApiReferralResp {
  referredBy?: {
    referrer: string;
    code: string;
  } | null;
  cumVlm?: string;
  referrerState?: {
    stage?: string;
    data?: {
      code?: string;
      nReferrals?: number;
      referralStates?: Array<{ user: string }>;
    };
  };
}

export interface BrowserScanProgress {
  scannedInRun: number;
  totalPool: number;
  totalIndexed: number;
  totalScannedEver: number;
  rateLimited: boolean;
  foundRecord?: IndexedReferralRecord;
}

export function loadLocalHlCodes(): Record<string, IndexedReferralRecord> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(LOCAL_CODES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, IndexedReferralRecord>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function saveLocalHlCodes(
  map: Record<string, IndexedReferralRecord>
): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LOCAL_CODES_KEY, JSON.stringify(map));
  } catch {
    // Ignore storage quota issues
  }
}

function loadLocalScannedSet(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(LOCAL_SCANNED_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function saveLocalScannedSet(set: Set<string>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      LOCAL_SCANNED_KEY,
      JSON.stringify(Array.from(set).slice(-60000))
    );
  } catch {
    // Ignore storage quota issues
  }
}

export async function runBrowserHlScan(options: {
  targetCode?: string;
  signal: AbortSignal;
  onProgress: (progress: BrowserScanProgress) => void;
  onCodesDiscovered: (codes: Record<string, IndexedReferralRecord>) => void;
}): Promise<{ found?: IndexedReferralRecord; scannedInRun: number }> {
  const targetUpper = options.targetCode?.trim().toUpperCase();
  const localCodes = loadLocalHlCodes();
  const localScanned = loadLocalScannedSet();

  if (targetUpper && localCodes[targetUpper]) {
    return { found: localCodes[targetUpper], scannedInRun: 0 };
  }

  let offset = 0;
  const pageLimit = 2000;
  let totalUniverse = 52000;
  let scannedInRun = 0;
  let paceMs = 60;
  let rateLimited = false;
  let found: IndexedReferralRecord | undefined;

  const pendingIngestRecords: IndexedReferralRecord[] = [];
  const pendingIngestScanned: string[] = [];

  const flushIngest = async () => {
    if (
      pendingIngestRecords.length === 0 &&
      pendingIngestScanned.length === 0
    ) {
      return;
    }
    const recordsBatch = pendingIngestRecords.splice(0, pendingIngestRecords.length);
    const scannedBatch = pendingIngestScanned.splice(0, pendingIngestScanned.length);
    saveLocalHlCodes(localCodes);
    saveLocalScannedSet(localScanned);
    options.onCodesDiscovered({ ...localCodes });
    try {
      await fetch('/api/hl/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          records: recordsBatch,
          scannedAddresses: scannedBatch,
        }),
      });
    } catch {
      // Server sync is best-effort
    }
  };

  while (!options.signal.aborted && !found) {
    const pageRes = await fetch(
      `/api/hl/addresses?offset=${offset}&limit=${pageLimit}&skipScanned=1`,
      { signal: options.signal, cache: 'no-store' }
    );
    if (!pageRes.ok) break;
    const pageData = (await pageRes.json()) as {
      totalUniverse: number;
      items: HlAddressItem[];
    };
    totalUniverse = pageData.totalUniverse || totalUniverse;
    const items = pageData.items ?? [];
    if (items.length === 0) break;

    for (const item of items) {
      if (options.signal.aborted || found) break;
      const addrLower = item.address.toLowerCase();
      if (localScanned.has(addrLower)) continue;

      for (let attempt = 0; attempt < 4 && !options.signal.aborted; attempt++) {
        try {
          const res = await fetch(HL_INFO_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'referral', user: item.address }),
            signal: options.signal,
          });

          if (res.status === 429) {
            rateLimited = true;
            // Hyperliquid Info API sustains ~60 referral requests/min per IP after initial burst
            paceMs = Math.min(1200, Math.max(1050, paceMs * 2));
            options.onProgress({
              scannedInRun,
              totalPool: totalUniverse,
              totalIndexed: Object.keys(localCodes).length,
              totalScannedEver: localScanned.size,
              rateLimited: true,
            });
            await new Promise((r) => setTimeout(r, 2500 * (attempt + 1)));
            continue;
          }

          rateLimited = false;
          if (!res.ok) break;
          const data = (await res.json()) as HlApiReferralResp | null;
          localScanned.add(addrLower);
          pendingIngestScanned.push(item.address);

          if (data) {
            const ownCode = data.referrerState?.data?.code?.trim();
            if (ownCode) {
              const codeUpper = ownCode.toUpperCase();
              const rec: IndexedReferralRecord = {
                protocol: 'hyperliquid',
                code: ownCode,
                codeUpper,
                address: item.address,
                displayName: item.displayName,
                source: 'referrer_state',
                accountValue: item.accountValue,
                cumVlm: data.cumVlm,
                referredCount:
                  data.referrerState?.data?.nReferrals ??
                  data.referrerState?.data?.referralStates?.length ??
                  0,
                updatedAt: Date.now(),
              };
              localCodes[codeUpper] = rec;
              pendingIngestRecords.push(rec);
              if (targetUpper && codeUpper === targetUpper) {
                found = rec;
              }
            }

            if (data.referredBy?.code && data.referredBy?.referrer) {
              const codeUpper = data.referredBy.code.trim().toUpperCase();
              const existing = localCodes[codeUpper];
              if (!existing || existing.source !== 'referrer_state') {
                const rec: IndexedReferralRecord = {
                  protocol: 'hyperliquid',
                  code: data.referredBy.code.trim(),
                  codeUpper,
                  address: data.referredBy.referrer,
                  source: 'referred_by',
                  updatedAt: Date.now(),
                };
                localCodes[codeUpper] = rec;
                pendingIngestRecords.push(rec);
              }
              if (targetUpper && codeUpper === targetUpper && !found) {
                found = localCodes[codeUpper];
              }
            }
          }
          break;
        } catch {
          break;
        }
      }

      scannedInRun++;
      if (scannedInRun % 15 === 0 || found) {
        options.onProgress({
          scannedInRun,
          totalPool: totalUniverse,
          totalIndexed: Object.keys(localCodes).length,
          totalScannedEver: localScanned.size,
          rateLimited,
          foundRecord: found,
        });
      }
      if (scannedInRun % 40 === 0 || found) {
        await flushIngest();
      }

      if (!found && !options.signal.aborted) {
        await new Promise((r) => setTimeout(r, paceMs));
      }
    }

    offset += items.length;
  }

  await flushIngest();
  options.onProgress({
    scannedInRun,
    totalPool: totalUniverse,
    totalIndexed: Object.keys(localCodes).length,
    totalScannedEver: localScanned.size,
    rateLimited: false,
    foundRecord: found,
  });

  return { found, scannedInRun };
}
