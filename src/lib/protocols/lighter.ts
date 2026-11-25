import { loadIndexState, saveIndexState, upsertLighterRecord } from '../cache';
import { formatUsd, isEvmAddress } from './hyperliquid';
import type { ProtocolLookupResult, ResolutionMatch } from '../types';

const LIGHTER_API_BASE = 'https://mainnet.zklighter.elliot.ai/api/v1';

interface LighterAccount {
  index: number;
  account_index: number;
  l1_address: string;
  name?: string;
  collateral?: string;
  available_balance?: string;
  total_order_count?: number;
  status?: number;
}

export interface LighterLeaderboardEntry {
  rank: number;
  l1_address: string;
  account_value: number;
  pnl: number;
  roi: number;
  volume: number;
}

let lighterLbCache: { entries: LighterLeaderboardEntry[]; fetchedAt: number } | null = null;

export async function fetchLighterLeaderboard(): Promise<LighterLeaderboardEntry[]> {
  const now = Date.now();
  if (lighterLbCache && now - lighterLbCache.fetchedAt < 10 * 60 * 1000) {
    return lighterLbCache.entries;
  }
  const res = await fetch(`${LIGHTER_API_BASE}/pnlLeaderboard?limit=100`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return [];
  const json = (await res.json()) as { entries?: LighterLeaderboardEntry[] };
  const entries = json.entries ?? [];
  lighterLbCache = { entries, fetchedAt: now };
  return entries;
}

export async function fetchLighterAccount(
  by: 'l1_address' | 'index',
  value: string
): Promise<LighterAccount[]> {
  const url = `${LIGHTER_API_BASE}/account?by=${by}&value=${encodeURIComponent(value)}`;
  const res = await fetch(url, {
    cache: 'no-store',
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) return [];
  const json = (await res.json()) as { code?: number; accounts?: LighterAccount[] };
  return json.accounts ?? [];
}

export async function fetchLighterReferralByIndex(
  accountIndex: number,
  authToken: string
): Promise<{ referral_code?: string; code?: number; message?: string } | null> {
  const url = `${LIGHTER_API_BASE}/referral/get?account_index=${accountIndex}`;
  const res = await fetch(url, {
    headers: { Authorization: authToken },
    cache: 'no-store',
    signal: AbortSignal.timeout(8_000),
  });
  const json = (await res.json()) as {
    referral_code?: string;
    code?: number;
    message?: string;
  };
  return json;
}

function buildLighterAccountMatch(
  acc: LighterAccount,
  referralCode?: string,
  via = 'Lighter Public Account API (/api/v1/account)'
): ResolutionMatch {
  return {
    protocol: 'lighter',
    address: acc.l1_address,
    accountIndex: acc.index ?? acc.account_index,
    code: referralCode || undefined,
    displayName: acc.name || undefined,
    matchSource: referralCode ? 'referral_code' : 'wallet_address',
    verifiedVia: via,
    explorerUrl: `https://explorer.elliot.ai/accounts/${acc.index ?? acc.account_index}`,
    appReferralUrl: referralCode
      ? `https://app.lighter.xyz/?referral=${referralCode}`
      : undefined,
    metrics: [
      {
        label: 'Account Index',
        value: `#${acc.index ?? acc.account_index}`,
        mono: true,
      },
      ...(referralCode
        ? [
            {
              label: 'Referral Code',
              value: referralCode,
              mono: true,
              tone: 'accent' as const,
            },
          ]
        : []),
      {
        label: 'Collateral',
        value: formatUsd(acc.collateral),
        mono: true,
      },
      {
        label: 'Available Balance',
        value: formatUsd(acc.available_balance),
        mono: true,
      },
      {
        label: 'Total Orders',
        value: (acc.total_order_count ?? 0).toLocaleString(),
        mono: true,
      },
    ],
  };
}

export async function resolveLighter(
  rawQuery: string,
  authToken?: string
): Promise<ProtocolLookupResult> {
  const query = rawQuery.trim();
  if (!query) {
    return {
      protocol: 'lighter',
      status: 'not_found',
      matches: [],
      message: 'Enter a referral code, L1 address (0x...), or account index.',
    };
  }

  try {
    // 1. Direct L1 Address or Account Index lookup (Public)
    if (isEvmAddress(query) || /^\d+$/.test(query)) {
      const by = isEvmAddress(query) ? 'l1_address' : 'index';
      const accounts = await fetchLighterAccount(by, query);
      if (accounts.length === 0) {
        return {
          protocol: 'lighter',
          status: 'not_found',
          matches: [],
          message: `No Lighter account found for ${by === 'l1_address' ? 'L1 address' : 'account index'} "${query}".`,
        };
      }

      const matches: ResolutionMatch[] = [];
      for (const acc of accounts.slice(0, 5)) {
        let referralCode: string | undefined;
        let via = 'Lighter Public Account API (/api/v1/account)';
        if (authToken) {
          const refRes = await fetchLighterReferralByIndex(
            acc.index ?? acc.account_index,
            authToken
          );
          if (refRes?.referral_code) {
            referralCode = refRes.referral_code;
            via = 'Lighter Referral API (/api/v1/referral/get)';
            await upsertLighterRecord({
              code: referralCode,
              address: acc.l1_address,
              source: 'lighter_auth',
            });
          }
        }
        matches.push(buildLighterAccountMatch(acc, referralCode, via));
      }
      if (authToken) await saveIndexState();

      return {
        protocol: 'lighter',
        status: 'resolved',
        matches,
        message: authToken
          ? 'Resolved Lighter account and referral code.'
          : 'Resolved Lighter public account details. Add an optional Lighter Auth Token to also read its referral code.',
        requiresAuth: !authToken,
      };
    }

    // 2. Referral code lookup: check local index first
    const codeUpper = query.toUpperCase();
    const state = await loadIndexState();
    const cached = state.lighterCodes[codeUpper];
    if (cached) {
      const accounts = await fetchLighterAccount('l1_address', cached.address);
      const primary = accounts[0];
      return {
        protocol: 'lighter',
        status: 'resolved',
        matches: [
          primary
            ? buildLighterAccountMatch(
                primary,
                cached.code,
                'Cached Lighter Referral Index'
              )
            : {
                protocol: 'lighter',
                address: cached.address,
                code: cached.code,
                matchSource: 'referral_code',
                verifiedVia: 'Cached Lighter Referral Index',
                appReferralUrl: `https://app.lighter.xyz/?referral=${cached.code}`,
                metrics: [
                  {
                    label: 'Referral Code',
                    value: cached.code,
                    mono: true,
                    tone: 'accent',
                  },
                ],
              },
        ],
        message: `Resolved Lighter referral code "${cached.code}" to ${cached.address}.`,
      };
    }

    // 3. If authToken is provided, scan top leaderboard accounts via /api/v1/referral/get
    if (authToken) {
      const lb = await fetchLighterLeaderboard();
      for (const entry of lb.slice(0, 40)) {
        const accounts = await fetchLighterAccount('l1_address', entry.l1_address);
        const primary = accounts[0];
        if (!primary) continue;
        const refRes = await fetchLighterReferralByIndex(
          primary.index ?? primary.account_index,
          authToken
        );
        if (refRes?.code === 20013 || refRes?.code === 20001) {
          return {
            protocol: 'lighter',
            status: 'auth_required',
            requiresAuth: true,
            matches: [],
            message: `Lighter auth token rejected: ${refRes.message ?? 'invalid auth'}.`,
          };
        }
        if (refRes?.referral_code) {
          await upsertLighterRecord({
            code: refRes.referral_code,
            address: primary.l1_address,
            source: 'lighter_auth',
          });
          if (refRes.referral_code.trim().toUpperCase() === codeUpper) {
            await saveIndexState();
            return {
              protocol: 'lighter',
              status: 'resolved',
              matches: [
                buildLighterAccountMatch(
                  primary,
                  refRes.referral_code,
                  'Lighter Referral API (/api/v1/referral/get)'
                ),
              ],
              message: `Resolved Lighter referral code "${refRes.referral_code}" to ${primary.l1_address}.`,
            };
          }
        }
      }
      await saveIndexState();
      return {
        protocol: 'lighter',
        status: 'not_found',
        matches: [],
        message: `Code "${codeUpper}" was not found among the top 40 Lighter leaderboard accounts.`,
        hint: 'Lighter docs do not expose a global code-to-address endpoint; /api/v1/referral/get only accepts account_index.',
      };
    }

    // 4. Honest auth-gated response when no token is provided
    return {
      protocol: 'lighter',
      status: 'auth_required',
      requiresAuth: true,
      matches: [],
      message:
        'Lighter referral endpoints (/api/v1/referral/get) require an Authorization token and only query by account_index or l1_address.',
      hint: 'Supply an optional Lighter Auth Token in the header bar to scan leaderboard accounts by code, or enter an L1 address (0x...) or account_index directly for public lookup.',
    };
  } catch (error) {
    return {
      protocol: 'lighter',
      status: 'error',
      matches: [],
      message:
        error instanceof Error ? error.message : 'Failed to query Lighter API.',
    };
  }
}
