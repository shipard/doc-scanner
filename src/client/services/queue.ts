import { openDB, IDBPDatabase } from 'idb';

export interface QueuedDocument {
  id: string;
  photos: Blob[];
  recipientEmail: string;
  recipientName: string;
  note: string;
  status: 'pending' | 'sending' | 'failed';
  attempts: number;
  maxAttempts: 3;
  lastAttemptAt: string | null;
  errorMessage: string | null;
  createdAt: string;
}

const DB_NAME = 'scandoc';
const STORE_NAME = 'queue';
const DB_VERSION = 1;

async function getDb(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    },
  });
}

export async function addToQueue(doc: Omit<QueuedDocument, 'status' | 'attempts' | 'maxAttempts' | 'lastAttemptAt' | 'errorMessage' | 'createdAt'>): Promise<QueuedDocument> {
  const db = await getDb();
  const entry: QueuedDocument = {
    ...doc,
    status: 'pending',
    attempts: 0,
    maxAttempts: 3,
    lastAttemptAt: null,
    errorMessage: null,
    createdAt: new Date().toISOString(),
  };
  await db.put(STORE_NAME, entry);
  return entry;
}

export async function getQueue(): Promise<QueuedDocument[]> {
  const db = await getDb();
  return db.getAll(STORE_NAME) as Promise<QueuedDocument[]>;
}

export async function updateQueueItem(id: string, updates: Partial<QueuedDocument>): Promise<void> {
  const db = await getDb();
  const existing = await db.get(STORE_NAME, id) as QueuedDocument | undefined;
  if (!existing) return;
  await db.put(STORE_NAME, { ...existing, ...updates });
}

export async function removeFromQueue(id: string): Promise<void> {
  const db = await getDb();
  await db.delete(STORE_NAME, id);
}

export async function getPendingItems(): Promise<QueuedDocument[]> {
  const all = await getQueue();
  return all.filter((d) => d.status === 'pending' || d.status === 'sending');
}

export async function resetForRetry(id: string): Promise<void> {
  await updateQueueItem(id, {
    status: 'pending',
    attempts: 0,
    errorMessage: null,
    lastAttemptAt: null,
  });
}
