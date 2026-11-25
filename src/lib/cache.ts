import fs from 'node:fs/promises';
import path from 'node:path';
import type { IndexedReferralRecord, IndexFileState } from './types';

const DATA_DIR = path.join(process.cwd(), 'data');
const INDEX_FILE = path.join(DATA_DIR, 'referral-index.json');

const EMPTY_STATE: IndexFileState = {
  version: 1,
  hlScannedAddresses: [],
  hlCodes: {},
  lighterCodes: {},
  updatedAt: 0,
};

let memoryState: IndexFileState | null = null;
let writeQueue: Promise<void> = Promise.resolve();

export async function loadIndexState(): Promise<IndexFileState> {
  if (memoryState) return memoryState;
  try {
    const raw = await fs.readFile(INDEX_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<IndexFileState>;
    memoryState = {
      version: 1,
      hlScannedAddresses: Array.isArray(parsed.hlScannedAddresses)
        ? parsed.hlScannedAddresses
        : [],
      hlCodes: parsed.hlCodes && typeof parsed.hlCodes === 'object' ? parsed.hlCodes : {},
      lighterCodes:
        parsed.lighterCodes && typeof parsed.lighterCodes === 'object'
          ? parsed.lighterCodes
          : {},
      updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : Date.now(),
    };
  } catch {
    memoryState = {
      ...EMPTY_STATE,
      hlScannedAddresses: [],
      hlCodes: {},
      lighterCodes: {},
      updatedAt: Date.now(),
    };
  }
  return memoryState;
}

export async function saveIndexState(): Promise<void> {
  if (!memoryState) return;
  const snapshot = JSON.stringify(memoryState, null, 2);
  writeQueue = writeQueue.then(async () => {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(INDEX_FILE, snapshot, 'utf8');
  });
  return writeQueue;
}

export async function upsertHyperliquidRecord(
  record: Omit<IndexedReferralRecord, 'protocol' | 'codeUpper' | 'updatedAt'>,
  markScannedAddress?: string
): Promise<void> {
  const state = await loadIndexState();
  const codeUpper = record.code.trim().toUpperCase();
  if (codeUpper) {
    const existing = state.hlCodes[codeUpper];
    // Prefer direct referrer_state record over referred_by inference
    const shouldReplace =
      !existing ||
      record.source === 'referrer_state' ||
      existing.source !== 'referrer_state';

    if (shouldReplace) {
      state.hlCodes[codeUpper] = {
        ...existing,
        ...record,
        protocol: 'hyperliquid',
        codeUpper,
        updatedAt: Date.now(),
      };
    }
  }
  if (markScannedAddress) {
    const normalized = markScannedAddress.toLowerCase();
    if (!state.hlScannedAddresses.includes(normalized)) {
      state.hlScannedAddresses.push(normalized);
    }
  }
  state.updatedAt = Date.now();
}

export async function markHyperliquidScanned(addresses: string[]): Promise<void> {
  const state = await loadIndexState();
  const seen = new Set(state.hlScannedAddresses);
  for (const addr of addresses) {
    const normalized = addr.toLowerCase();
    if (!seen.has(normalized)) {
      seen.add(normalized);
      state.hlScannedAddresses.push(normalized);
    }
  }
  state.updatedAt = Date.now();
}

export async function upsertLighterRecord(
  record: Omit<IndexedReferralRecord, 'protocol' | 'codeUpper' | 'updatedAt'>
): Promise<void> {
  const state = await loadIndexState();
  const codeUpper = record.code.trim().toUpperCase();
  if (!codeUpper) return;
  state.lighterCodes[codeUpper] = {
    ...record,
    protocol: 'lighter',
    codeUpper,
    updatedAt: Date.now(),
  };
  state.updatedAt = Date.now();
}
