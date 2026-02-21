import { uploadDocument } from './api';
import {
  getPendingItems,
  updateQueueItem,
  removeFromQueue,
  QueuedDocument,
} from './queue';

const BACKOFF_DELAYS = [5000, 15000, 45000]; // ms

let syncing = false;
let syncListeners: Array<() => void> = [];

export function onQueueChange(cb: () => void): () => void {
  syncListeners.push(cb);
  return () => {
    syncListeners = syncListeners.filter((l) => l !== cb);
  };
}

function notifyListeners(): void {
  syncListeners.forEach((cb) => cb());
}

async function processItem(doc: QueuedDocument): Promise<void> {
  if (doc.attempts >= doc.maxAttempts) {
    await updateQueueItem(doc.id, { status: 'failed', errorMessage: 'Max attempts reached' });
    notifyListeners();
    return;
  }

  // Check backoff
  if (doc.lastAttemptAt) {
    const delay = BACKOFF_DELAYS[Math.min(doc.attempts, BACKOFF_DELAYS.length - 1)];
    const elapsed = Date.now() - new Date(doc.lastAttemptAt).getTime();
    if (elapsed < delay) {
      return; // Not ready yet
    }
  }

  await updateQueueItem(doc.id, {
    status: 'sending',
    lastAttemptAt: new Date().toISOString(),
  });
  notifyListeners();

  try {
    await uploadDocument(doc.photos, doc.recipientEmail, doc.recipientName, doc.note);
    await removeFromQueue(doc.id);
    notifyListeners();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const newAttempts = doc.attempts + 1;
    const newStatus = newAttempts >= doc.maxAttempts ? 'failed' : 'pending';

    await updateQueueItem(doc.id, {
      status: newStatus,
      attempts: newAttempts,
      errorMessage: message,
      lastAttemptAt: new Date().toISOString(),
    });
    notifyListeners();
  }
}

export async function syncQueue(): Promise<void> {
  if (syncing || !navigator.onLine) return;
  syncing = true;

  try {
    const pending = await getPendingItems();
    for (const item of pending) {
      await processItem(item);
    }
  } finally {
    syncing = false;
  }
}

// Listen for online events
window.addEventListener('online', () => {
  syncQueue();
});

// Periodic check every 30s
setInterval(() => {
  if (navigator.onLine) {
    syncQueue();
  }
}, 30000);
