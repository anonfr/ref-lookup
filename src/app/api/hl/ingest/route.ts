import { NextResponse } from 'next/server';
import {
  markHyperliquidScanned,
  saveIndexState,
  upsertHyperliquidRecord,
} from '@/lib/cache';

interface IngestBody {
  records?: Array<{
    code: string;
    address: string;
    displayName?: string;
    source: 'referrer_state' | 'referred_by';
    accountValue?: string;
    cumVlm?: string;
    referredCount?: number;
  }>;
  scannedAddresses?: string[];
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as IngestBody;
    const records = Array.isArray(body.records) ? body.records : [];
    const scannedAddresses = Array.isArray(body.scannedAddresses)
      ? body.scannedAddresses
      : [];

    for (const rec of records.slice(0, 500)) {
      if (rec.code && rec.address) {
        await upsertHyperliquidRecord({
          code: rec.code,
          address: rec.address,
          displayName: rec.displayName,
          source: rec.source === 'referred_by' ? 'referred_by' : 'referrer_state',
          accountValue: rec.accountValue,
          cumVlm: rec.cumVlm,
          referredCount: rec.referredCount,
        });
      }
    }

    if (scannedAddresses.length > 0) {
      await markHyperliquidScanned(scannedAddresses.slice(0, 1000));
    }

    await saveIndexState();
    return NextResponse.json({ ok: true, ingested: records.length });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Failed to ingest scan batch.',
      },
      { status: 500 }
    );
  }
}
