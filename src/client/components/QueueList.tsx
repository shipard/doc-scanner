import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { getQueue, resetForRetry, QueuedDocument } from '../services/queue';
import { syncQueue, onQueueChange } from '../services/sync';

export default function QueueList(): React.ReactElement {
  const { t } = useTranslation();
  const [items, setItems] = useState<QueuedDocument[]>([]);

  const refresh = useCallback(async () => {
    const all = await getQueue();
    setItems(all);
  }, []);

  useEffect(() => {
    refresh();
    const unsubscribe = onQueueChange(refresh);
    return unsubscribe;
  }, [refresh]);

  const handleRetry = async (id: string): Promise<void> => {
    await resetForRetry(id);
    await syncQueue();
  };

  const pendingItems = items.filter((i) => i.status !== undefined);

  if (pendingItems.length === 0) {
    return <></>;
  }

  return (
    <div className="card">
      <h3 style={{ margin: '0 0 12px', fontSize: '0.9rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)' }}>
        {t('home.queue_title')}
      </h3>
      {pendingItems.map((item) => (
        <div key={item.id} className="queue-item">
          <div className="queue-item-info">
            <div className="queue-item-title">{item.recipientName || item.recipientEmail}</div>
            <div className="queue-item-meta">
              {item.photos.length === 1
                ? t('queue.photo', { count: item.photos.length })
                : t('queue.photos', { count: item.photos.length })}
              {item.errorMessage && (
                <span style={{ color: 'var(--error)', marginLeft: 8 }}>
                  — {item.errorMessage}
                </span>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className={`status-badge status-${item.status}`}>
              {t(`queue.status_${item.status}`)}
            </span>
            {item.status === 'failed' && (
              <button
                className="btn btn-sm btn-outline"
                onClick={() => handleRetry(item.id)}
              >
                {t('queue.retry')}
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
