import { Suspense } from 'react';
import { connection } from 'next/server';
import { LookupTerminal } from '@/components/LookupTerminal';
import { getDirectorySnapshot } from '@/lib/directory';
import type { DirectoryResponse } from '@/lib/types';

async function TerminalLoader() {
  await connection();
  let initialDirectory: DirectoryResponse | null = null;
  try {
    initialDirectory = await getDirectorySnapshot();
  } catch {
    initialDirectory = null;
  }
  return <LookupTerminal initialDirectory={initialDirectory} />;
}

export default function HomePage() {
  return (
    <Suspense fallback={<LookupTerminal initialDirectory={null} />}>
      <TerminalLoader />
    </Suspense>
  );
}
