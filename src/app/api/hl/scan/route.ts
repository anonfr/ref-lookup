import type { NextRequest } from 'next/server';
import { scanHlBatch } from '@/lib/protocols/hyperliquid';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const targetCode = searchParams.get('targetCode')?.trim() || undefined;
  const batchSizeRaw = Number.parseInt(searchParams.get('batchSize') || '300', 10);
  const batchSize = Number.isFinite(batchSizeRaw) ? batchSizeRaw : 300;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };

      try {
        send('start', { batchSize, targetCode: targetCode ?? null });

        const result = await scanHlBatch({
          batchSize,
          concurrency: 20,
          targetCode,
          onProgress: (progress) => {
            send('progress', progress);
          },
        });

        send('done', result);
      } catch (error) {
        send('error', {
          message:
            error instanceof Error ? error.message : 'Hyperliquid scan failed.',
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
