import { NextResponse } from 'next/server';
import { resolveHyperliquid } from '@/lib/protocols/hyperliquid';
import { resolveLighter } from '@/lib/protocols/lighter';
import { resolveRisex } from '@/lib/protocols/risex';
import type { ProtocolId, ProtocolLookupResult } from '@/lib/types';

interface LookupRequestBody {
  query?: string;
  protocols?: ProtocolId[];
  lighterAuthToken?: string;
  autoQuickScan?: boolean;
}

const ALL_PROTOCOLS: ProtocolId[] = ['hyperliquid', 'lighter', 'risex'];

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as LookupRequestBody;
    const query = (body.query ?? '').trim();

    if (!query) {
      return NextResponse.json(
        { error: 'Query is required.' },
        { status: 400 }
      );
    }

    const requested = Array.isArray(body.protocols) && body.protocols.length > 0
      ? body.protocols.filter((p): p is ProtocolId => ALL_PROTOCOLS.includes(p))
      : ALL_PROTOCOLS;

    const protocols = requested.length > 0 ? requested : ALL_PROTOCOLS;
    const lighterAuthToken = body.lighterAuthToken?.trim() || undefined;
    const autoQuickScan = body.autoQuickScan !== false;

    const tasks = protocols.map((protocol): Promise<ProtocolLookupResult> => {
      switch (protocol) {
        case 'hyperliquid':
          return resolveHyperliquid(query, { autoQuickScan });
        case 'lighter':
          return resolveLighter(query, lighterAuthToken);
        case 'risex':
          return resolveRisex(query);
      }
    });

    const results = await Promise.all(tasks);

    return NextResponse.json({
      query,
      results,
      timestamp: Date.now(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Invalid lookup request.',
      },
      { status: 500 }
    );
  }
}
