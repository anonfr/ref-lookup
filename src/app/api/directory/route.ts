import { NextResponse } from 'next/server';
import { getDirectorySnapshot } from '@/lib/directory';

export async function GET() {
  try {
    const payload = await getDirectorySnapshot();
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Failed to load directory.',
      },
      { status: 500 }
    );
  }
}
