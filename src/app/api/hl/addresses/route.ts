import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { loadIndexState } from '@/lib/cache';
import { fetchHlAddressPool } from '@/lib/protocols/hyperliquid';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const offset = Math.max(
      0,
      Number.parseInt(searchParams.get('offset') || '0', 10) || 0
    );
    const limit = Math.min(
      5000,
      Math.max(100, Number.parseInt(searchParams.get('limit') || '2000', 10) || 2000)
    );
    const skipScanned = searchParams.get('skipScanned') !== '0';

    const [pool, state] = await Promise.all([
      fetchHlAddressPool(),
      loadIndexState(),
    ]);

    const scannedSet = skipScanned
      ? new Set(state.hlScannedAddresses)
      : new Set<string>();
    const filtered = skipScanned
      ? pool.filter((item) => !scannedSet.has(item.ethAddress.toLowerCase()))
      : pool;

    return NextResponse.json({
      totalUniverse: pool.length,
      remaining: filtered.length,
      alreadyScanned: state.hlScannedAddresses.length,
      offset,
      items: filtered.slice(offset, offset + limit).map((item) => ({
        address: item.ethAddress,
        displayName: item.displayName || undefined,
        accountValue: item.accountValue,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to load Hyperliquid address pool.',
      },
      { status: 500 }
    );
  }
}
