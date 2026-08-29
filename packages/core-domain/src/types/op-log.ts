/** Entry in the offline-write queue (spec §15.2) */
export interface OpLogEntry {
  id: number;
  entityType: string;
  entityId: string;
  opType: string;
  payload: string;
  status: 'pending' | 'applied' | 'synced' | 'failed';
  createdAt: string;
  appliedAt?: string;
  syncedAt?: string;
  retryCount: number;
  lastError?: string;
}
