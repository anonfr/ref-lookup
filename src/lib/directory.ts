import { loadIndexState } from './cache';
import { fetchHlLeaderboard } from './protocols/hyperliquid';
import { fetchRisexBuilders } from './protocols/risex';
import type { DirectoryResponse } from './types';

export async function getDirectorySnapshot(): Promise<DirectoryResponse> {
  const [state, hlLeaderboard, risexBuilders] = await Promise.all([
    loadIndexState(),
    fetchHlLeaderboard().catch(() => []),
    fetchRisexBuilders().catch(() => []),
  ]);

  const hlRecords = Object.values(state.hlCodes).sort((a, b) => {
    const refDiff = (b.referredCount ?? 0) - (a.referredCount ?? 0);
    if (refDiff !== 0) return refDiff;
    const valA = Number.parseFloat(a.accountValue || '0') || 0;
    const valB = Number.parseFloat(b.accountValue || '0') || 0;
    return valB - valA;
  });

  const lighterRecords = Object.values(state.lighterCodes).sort(
    (a, b) => b.updatedAt - a.updatedAt
  );

  return {
    hyperliquid: {
      indexedCount: hlRecords.length,
      scannedTradersCount: state.hlScannedAddresses.length,
      leaderboardTotal: hlLeaderboard.length,
      records: hlRecords.slice(0, 100),
    },
    risex: {
      buildersCount: risexBuilders.length,
      builders: risexBuilders.map((b) => ({
        builderId: b.builder_id,
        slug: b.slug,
        name: b.name,
        feeRecipient: b.fee_recipient,
        isActive: b.is_active,
      })),
    },
    lighter: {
      indexedCount: lighterRecords.length,
      records: lighterRecords.slice(0, 100),
    },
  };
}
