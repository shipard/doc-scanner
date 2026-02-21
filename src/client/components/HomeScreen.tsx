import React, { useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { UserContext } from '../App';
import QueueList from './QueueList';
import { getDocuments, DocumentRecord } from '../services/api';

export default function HomeScreen(): React.ReactElement {
  const { t } = useTranslation();
  const { user } = useContext(UserContext);
  const navigate = useNavigate();
  const [recentDocs, setRecentDocs] = useState<DocumentRecord[]>([]);

  useEffect(() => {
    getDocuments()
      .then((docs) => setRecentDocs(docs.filter((d) => d.status === 'sent').slice(0, 5)))
      .catch(() => {});
  }, []);

  return (
    <div className="screen">
      <div className="app-bar">
        <h1>{t('app_name')}</h1>
        <div className="app-bar-actions">
          <button
            className="btn btn-icon"
            style={{ color: 'white' }}
            onClick={() => navigate('/settings')}
            aria-label="Settings"
          >
            ⚙️
          </button>
        </div>
      </div>

      <div className="screen-content">
        {user && (
          <p style={{ color: 'var(--text-secondary)', marginBottom: 20, fontSize: '0.9rem' }}>
            Přihlášen jako {user.name}
          </p>
        )}

        <button
          className="btn btn-primary btn-full btn-lg"
          style={{ marginBottom: 24 }}
          onClick={() => navigate('/new')}
        >
          📷 {t('home.new_document')}
        </button>

        <QueueList />

        {recentDocs.length > 0 && (
          <div className="card">
            <h3 style={{ margin: '0 0 12px', fontSize: '0.9rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)' }}>
              {t('home.sent_title')}
            </h3>
            {recentDocs.map((doc) => (
              <div key={doc.id} className="queue-item">
                <div className="queue-item-info">
                  <div className="queue-item-title">{doc.recipient_name || doc.recipient_email}</div>
                  <div className="queue-item-meta">
                    {doc.photo_count} fotek
                    {doc.note && ` · ${doc.note}`}
                    {doc.sent_at && ` · ${new Date(doc.sent_at).toLocaleDateString()}`}
                  </div>
                </div>
                <span className="status-badge status-sent">Odesláno</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
