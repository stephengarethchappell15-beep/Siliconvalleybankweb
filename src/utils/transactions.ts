import { Transaction } from '../types';

const FINALIZED_STATUS_KEY = 'svb_finalized_txn_statuses';

export function getFinalizedStatuses(): Record<string, 'Completed' | 'Rejected' | 'Cancelled'> {
  try {
    const raw = localStorage.getItem(FINALIZED_STATUS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveFinalizedStatus(idOrRef: string, status: 'Completed' | 'Rejected' | 'Cancelled' | string): void {
  if (!idOrRef || status === 'Pending') return;
  try {
    const current = getFinalizedStatuses();
    current[idOrRef] = status as any;
    localStorage.setItem(FINALIZED_STATUS_KEY, JSON.stringify(current));
  } catch (e) {
    console.warn('Failed saving finalized status:', e);
  }
}

/**
 * Universal Deduplicator & Status Reconciler for Transactions
 * - Collapses duplicate documents created with different IDs (e.g., DEP-xxxx vs TXN-DEP-xxxx)
 * - Guarantees that any Finalized status (Completed, Rejected, Cancelled) ALWAYS overrides Pending
 * - Prevents stale or phantom snapshot items from resurfacing as Pending
 */
export function deduplicateTransactions(list: Transaction[]): Transaction[] {
  if (!Array.isArray(list)) return [];
  const finalized = getFinalizedStatuses();
  const map = new Map<string, Transaction>();

  for (const t of list) {
    if (!t) continue;

    // Check if ID or reference has a locked finalized status
    const fixedStatus = (t.id && finalized[t.id]) || (t.reference && finalized[t.reference]);
    let currentStatus = t.status;
    if (fixedStatus) {
      currentStatus = fixedStatus;
    }

    const item: Transaction = {
      ...t,
      status: currentStatus
    };

    let matchedKey: string | null = null;
    let matchedTxn: Transaction | null = null;

    for (const [key, existing] of map.entries()) {
      const isSameId = (item.id && existing.id && item.id === existing.id);
      const isSameRef = (item.reference && existing.reference && item.reference === existing.reference);
      const isRefIdCross = (item.reference && existing.id && item.reference === existing.id) ||
                           (item.id && existing.reference && item.id === existing.reference);
      
      // Match similar transaction (same user, amount, type, and within 10 minutes)
      const isSimilar = Boolean(
        item.userId && existing.userId &&
        item.userId === existing.userId &&
        item.amount === existing.amount &&
        item.type === existing.type &&
        (item.description === existing.description || (item.reference && existing.reference && item.reference === existing.reference)) &&
        Math.abs(new Date(item.createdAt).getTime() - new Date(existing.createdAt).getTime()) < 600000
      );

      if (isSameId || isSameRef || isRefIdCross || isSimilar) {
        matchedKey = key;
        matchedTxn = existing;
        break;
      }
    }

    if (!matchedTxn || !matchedKey) {
      const key = item.reference || item.id || `txn-${Math.random()}`;
      map.set(key, item);
    } else {
      // Finalized status (Completed, Rejected, Cancelled) MUST ALWAYS override Pending
      let finalStatus = item.status;
      if (matchedTxn.status !== 'Pending' && item.status === 'Pending') {
        finalStatus = matchedTxn.status;
      } else if (matchedTxn.status === 'Pending' && item.status !== 'Pending') {
        finalStatus = item.status;
      } else if (matchedTxn.status !== 'Pending' && item.status !== 'Pending') {
        finalStatus = item.status || matchedTxn.status;
      }

      const isNewer = new Date(item.updatedAt || item.createdAt).getTime() >= new Date(matchedTxn.updatedAt || matchedTxn.createdAt).getTime();
      const base = isNewer ? matchedTxn : item;
      const top = isNewer ? item : matchedTxn;

      // Lock finalized status in cache if determined
      if (finalStatus !== 'Pending') {
        if (item.id) saveFinalizedStatus(item.id, finalStatus);
        if (item.reference) saveFinalizedStatus(item.reference, finalStatus);
        if (matchedTxn.id) saveFinalizedStatus(matchedTxn.id, finalStatus);
        if (matchedTxn.reference) saveFinalizedStatus(matchedTxn.reference, finalStatus);
      }

      map.set(matchedKey, {
        ...base,
        ...top,
        status: finalStatus,
        updatedAt: item.updatedAt || matchedTxn.updatedAt || new Date().toISOString()
      });
    }
  }

  return Array.from(map.values()).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}
