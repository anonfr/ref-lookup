export type ProtocolId = 'hyperliquid' | 'lighter' | 'risex';

export type ResolutionStatus =
  | 'resolved'
  | 'not_found'
  | 'auth_required'
  | 'unsupported'
  | 'error';

export type MatchSource =
  | 'referral_code'
  | 'referred_by_referee'
  | 'builder_code'
  | 'trader_username'
  | 'wallet_address'
  | 'leaderboard_name'
  | 'account_index';

export interface ProtocolMetric {
  label: string;
  value: string;
  mono?: boolean;
  tone?: 'default' | 'positive' | 'accent' | 'muted';
}

export interface ReferredUserSummary {
  address: string;
  volume?: string;
  feesRewarded?: string;
  joinedAt?: number;
}

export interface ResolutionMatch {
  protocol: ProtocolId;
  address: string;
  code?: string;
  displayName?: string;
  accountIndex?: number;
  matchSource: MatchSource;
  verifiedVia: string;
  explorerUrl?: string;
  appReferralUrl?: string;
  metrics: ProtocolMetric[];
  referredBy?: {
    referrer: string;
    code: string;
  };
  referredUsers?: ReferredUserSummary[];
}

export interface ProtocolLookupResult {
  protocol: ProtocolId;
  status: ResolutionStatus;
  matches: ResolutionMatch[];
  message: string;
  canDeepScan?: boolean;
  requiresAuth?: boolean;
  hint?: string;
}

export interface IndexedReferralRecord {
  protocol: ProtocolId;
  code: string;
  codeUpper: string;
  address: string;
  displayName?: string;
  source: 'referrer_state' | 'referred_by' | 'builder' | 'lighter_auth';
  accountValue?: string;
  cumVlm?: string;
  referredCount?: number;
  updatedAt: number;
}

export interface IndexFileState {
  version: number;
  hlScannedAddresses: string[];
  hlCodes: Record<string, IndexedReferralRecord>;
  lighterCodes: Record<string, IndexedReferralRecord>;
  updatedAt: number;
}

export interface DirectoryResponse {
  hyperliquid: {
    indexedCount: number;
    scannedTradersCount: number;
    leaderboardTotal: number;
    records: IndexedReferralRecord[];
  };
  risex: {
    buildersCount: number;
    builders: Array<{
      builderId: number;
      slug: string;
      name: string;
      feeRecipient: string;
      isActive: boolean;
    }>;
  };
  lighter: {
    indexedCount: number;
    records: IndexedReferralRecord[];
  };
}
