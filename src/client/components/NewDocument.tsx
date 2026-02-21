import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { v4 as uuidv4 } from 'uuid';
import { addToQueue } from '../services/queue';
import { syncQueue } from '../services/sync';

interface Recipient {
  name: string;
  email: string;
}

const MAX_PHOTOS = 10;

export default function NewDocument(): React.ReactElement {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [photos, setPhotos] = useState<Array<{ blob: Blob; url: string }>>([]);
  const [recipientEmail, setRecipientEmail] = useState('');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recipients: Recipient[] = JSON.parse(localStorage.getItem('recipients') || '[]');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const files = Array.from(e.target.files || []);
    if (photos.length + files.length > MAX_PHOTOS) {
      setError(`Max ${MAX_PHOTOS} fotek`);
      return;
    }

    const newPhotos = files.map((file) => ({
      blob: file as Blob,
      url: URL.createObjectURL(file),
    }));

    setPhotos((prev) => [...prev, ...newPhotos]);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setError(null);
  };

  const removePhoto = (index: number): void => {
    setPhotos((prev) => {
      URL.revokeObjectURL(prev[index].url);
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleSubmit = async (): Promise<void> => {
    if (photos.length === 0) {
      setError(t('new_doc.min_photo'));
      return;
    }
    if (!recipientEmail) {
      setError(t('new_doc.select_recipient'));
      return;
    }

    setSending(true);
    setError(null);

    const recipient = recipients.find((r) => r.email === recipientEmail);

    try {
      await addToQueue({
        id: uuidv4(),
        photos: photos.map((p) => p.blob),
        recipientEmail,
        recipientName: recipient?.name || '',
        note,
      });

      // Try to sync immediately
      if (navigator.onLine) {
        await syncQueue();
        navigate('/?toast=sent_ok');
      } else {
        navigate('/?toast=sent_offline');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'));
      setSending(false);
    }
  };

  return (
    <div className="screen">
      <div className="app-bar">
        <button
          className="btn btn-icon"
          style={{ color: 'white' }}
          onClick={() => navigate('/')}
          aria-label="Back"
        >
          ←
        </button>
        <h1>{t('new_doc.title')}</h1>
        <div style={{ width: 40 }} />
      </div>

      <div className="screen-content">
        {/* Photos section */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontWeight: 600 }}>
              {t('new_doc.photo_count', { current: photos.length, max: MAX_PHOTOS })}
            </span>
            {photos.length < MAX_PHOTOS && (
              <button
                className="btn btn-outline btn-sm"
                onClick={() => fileInputRef.current?.click()}
              >
                📷 {t('new_doc.take_photo')}
              </button>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            multiple
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />

          {photos.length > 0 && (
            <div className="photo-grid">
              {photos.map((photo, idx) => (
                <div key={idx} className="photo-thumb">
                  <img src={photo.url} alt={`Photo ${idx + 1}`} />
                  <button
                    className="photo-thumb-remove"
                    onClick={() => removePhoto(idx)}
                    aria-label="Remove"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          {photos.length === 0 && (
            <button
              className="btn btn-secondary btn-full"
              style={{ height: 100 }}
              onClick={() => fileInputRef.current?.click()}
            >
              📷 {t('new_doc.take_photo')}
            </button>
          )}
        </div>

        {/* Recipient */}
        <div className="form-group">
          <label className="form-label">{t('new_doc.recipient')}</label>
          {recipients.length === 0 ? (
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              {t('new_doc.no_recipients')}{' '}
              <a href="/settings" style={{ color: 'var(--primary)' }}>Nastavení</a>
            </div>
          ) : (
            <select
              className="form-select"
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
            >
              <option value="">{t('new_doc.select_recipient')}</option>
              {recipients.map((r) => (
                <option key={r.email} value={r.email}>
                  {r.name ? `${r.name} (${r.email})` : r.email}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Note */}
        <div className="form-group">
          <label className="form-label">Poznámka</label>
          <textarea
            className="form-textarea"
            placeholder={t('new_doc.note_placeholder')}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
          />
        </div>

        {error && (
          <div style={{ color: 'var(--error)', marginBottom: 12, fontSize: '0.9rem' }}>
            {error}
          </div>
        )}

        <button
          className="btn btn-primary btn-full btn-lg"
          onClick={handleSubmit}
          disabled={sending || recipients.length === 0}
        >
          {sending ? t('new_doc.sending') : t('new_doc.send')}
        </button>
      </div>
    </div>
  );
}
