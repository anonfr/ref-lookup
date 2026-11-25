import { formatUsd, isEvmAddress } from './hyperliquid';
import type { ProtocolLookupResult, ResolutionMatch } from '../types';

const RISEX_API_BASE = 'https://api.rise.trade';

export interface RisexBuilder {
  builder_id: number;
  slug: string;
  name: string;
  fee_recipient: string;
  is_active: boolean;
}

interface RisexTraderProfile {
  username: string;
  address: string;
  total_competitions: number;
  best_rank: string;
  avg_rank: number;
  total_volume: string;
  total_realized_pnl: string;
  avatar_url?: string;
  x_account?: {
    username?: string;
    name?: string;
  } | null;
}

let buildersCache: { items: RisexBuilder[]; fetchedAt: number } | null = null;

export async function fetchRisexBuilders(): Promise<RisexBuilder[]> {
  const now = Date.now();
  if (buildersCache && now - buildersCache.fetchedAt < 5 * 60 * 1000) {
    return buildersCache.items;
  }
  const res = await fetch(`${RISEX_API_BASE}/v1/builders`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    throw new Error(`RISEx /v1/builders returned ${res.status}`);
  }
  const json = (await res.json()) as { data?: { builders?: RisexBuilder[] } };
  const items = json.data?.builders ?? [];
  buildersCache = { items, fetchedAt: now };
  return items;
}

async function fetchRisexBuilderBySlug(slug: string): Promise<RisexBuilder | null> {
  const res = await fetch(
    `${RISEX_API_BASE}/v1/builders/${encodeURIComponent(slug)}`,
    {
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    }
  );
  if (!res.ok) return null;
  const json = (await res.json()) as {
    data?: { builder?: RisexBuilder } & Partial<RisexBuilder>;
  };
  const b = json.data?.builder ?? json.data;
  if (b && b.fee_recipient) {
    return b as RisexBuilder;
  }
  return null;
}

async function fetchRisexTrader(identifier: string): Promise<RisexTraderProfile | null> {
  const res = await fetch(
    `${RISEX_API_BASE}/v1/traders/${encodeURIComponent(identifier)}`,
    {
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    }
  );
  if (!res.ok) return null;
  const json = (await res.json()) as { data?: RisexTraderProfile };
  if (json.data?.address) return json.data;
  return null;
}

function builderToMatch(builder: RisexBuilder, via: string): ResolutionMatch {
  return {
    protocol: 'risex',
    address: builder.fee_recipient,
    code: builder.slug,
    displayName: builder.name,
    matchSource: 'builder_code',
    verifiedVia: via,
    explorerUrl: `https://explorer.risechain.com/address/${builder.fee_recipient}`,
    metrics: [
      { label: 'Builder Slug', value: builder.slug, mono: true, tone: 'accent' },
      { label: 'Builder ID', value: `#${builder.builder_id}`, mono: true },
      {
        label: 'Status',
        value: builder.is_active ? 'Active' : 'Inactive',
        tone: builder.is_active ? 'positive' : 'muted',
      },
      { label: 'Display Name', value: builder.name },
    ],
  };
}

function traderToMatch(
  trader: RisexTraderProfile,
  source: ResolutionMatch['matchSource']
): ResolutionMatch {
  const pnl = Number.parseFloat(trader.total_realized_pnl || '0');
  return {
    protocol: 'risex',
    address: trader.address,
    code: trader.username || undefined,
    displayName: trader.x_account?.username
      ? `@${trader.x_account.username}`
      : trader.username || undefined,
    matchSource: source,
    verifiedVia: 'RISEx REST API (/v1/traders/{id})',
    explorerUrl: `https://explorer.risechain.com/address/${trader.address}`,
    metrics: [
      {
        label: 'Username',
        value: trader.username || 'Unset',
        mono: true,
        tone: trader.username ? 'accent' : 'muted',
      },
      {
        label: 'Total Volume',
        value: formatUsd(trader.total_volume),
        mono: true,
      },
      {
        label: 'Realized PnL',
        value: formatUsd(trader.total_realized_pnl),
        mono: true,
        tone: pnl > 0 ? 'positive' : 'default',
      },
      {
        label: 'Best Rank',
        value: trader.best_rank && trader.best_rank !== '0' ? `#${trader.best_rank}` : '—',
        mono: true,
      },
    ],
  };
}

export async function resolveRisex(rawQuery: string): Promise<ProtocolLookupResult> {
  const query = rawQuery.trim();
  if (!query) {
    return {
      protocol: 'risex',
      status: 'not_found',
      matches: [],
      message: 'Enter a RISEx builder slug, trader username, or 0x address.',
    };
  }

  try {
    const normalized = query.toLowerCase();
    const matches: ResolutionMatch[] = [];
    const seenKeys = new Set<string>();

    const [builders, exactBuilder, trader] = await Promise.all([
      fetchRisexBuilders().catch(() => []),
      !isEvmAddress(query) ? fetchRisexBuilderBySlug(normalized) : Promise.resolve(null),
      fetchRisexTrader(query),
    ]);

    if (exactBuilder) {
      seenKeys.add(`builder:${exactBuilder.slug}`);
      matches.push(builderToMatch(exactBuilder, 'RISEx REST API (/v1/builders/{slug})'));
    }

    // Check if query matches any builder address, slug, or name
    for (const b of builders) {
      const key = `builder:${b.slug}`;
      if (seenKeys.has(key)) continue;
      if (
        b.slug.toLowerCase() === normalized ||
        b.fee_recipient.toLowerCase() === normalized ||
        b.name.toLowerCase().includes(normalized)
      ) {
        seenKeys.add(key);
        matches.push(builderToMatch(b, 'RISEx Builder Directory (/v1/builders)'));
      }
    }

    if (trader) {
      matches.push(
        traderToMatch(trader, isEvmAddress(query) ? 'wallet_address' : 'trader_username')
      );
    }

    if (matches.length > 0) {
      return {
        protocol: 'risex',
        status: 'resolved',
        matches,
        message: `Resolved ${matches.length} RISEx ${matches.length === 1 ? 'record' : 'records'} for "${query}".`,
        hint: 'RISEx Builder Codes (/v1/builders) and Trader Profiles (/v1/traders) resolve directly via public API. Referral V2 custom slugs are managed in the RISEx web UI without a public REST lookup endpoint.',
      };
    }

    return {
      protocol: 'risex',
      status: 'not_found',
      matches: [],
      message: `No RISEx builder slug or trader username matched "${query}".`,
      hint: 'Note: RISEx Referral V2 custom link slugs are UI-only and are not exposed by a public developer.rise.trade REST endpoint yet. Public resolution supports Builder Codes (/v1/builders/{slug}) and Trader Usernames (/v1/traders/{username}).',
    };
  } catch (error) {
    return {
      protocol: 'risex',
      status: 'error',
      matches: [],
      message:
        error instanceof Error ? error.message : 'Failed to query RISEx REST API.',
    };
  }
}
