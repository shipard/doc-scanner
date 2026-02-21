import React, { useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { UserContext } from '../App';
import { logout } from '../services/auth';
import LanguageSwitcher from './LanguageSwitcher';

interface Recipient {
  id: string;
  name: string;
  email: string;
}

function loadRecipients(): Recipient[] {
  try {
    return JSON.parse(localStorage.getItem('recipients') || '[]');
  } catch {
    return [];
  }
}

function saveRecipients(recipients: Recipient[]): void {
  localStorage.setItem('recipients', JSON.stringify(recipients));
}

export default function Settings(): React.ReactElement {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, setUser } = useContext(UserContext);

  const [recipients, setRecipients] = useState<Recipient[]>(loadRecipients);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formError, setFormError] = useState('');

  const handleAdd = (): void => {
    setShowAddForm(true);
    setEditId(null);
    setFormName('');
    setFormEmail('');
    setFormError('');
  };

  const handleEdit = (r: Recipient): void => {
    setEditId(r.id);
    setFormName(r.name);
    setFormEmail(r.email);
    setShowAddForm(true);
    setFormError('');
  };

  const handleSave = (): void => {
    if (!formEmail.trim() || !formEmail.includes('@')) {
      setFormError('Zadejte platný e-mail');
      return;
    }

    let updated: Recipient[];
    if (editId) {
      updated = recipients.map((r) =>
        r.id === editId ? { ...r, name: formName, email: formEmail } : r
      );
    } else {
      const newItem: Recipient = {
        id: Math.random().toString(36).slice(2),
        name: formName,
        email: formEmail,
      };
      updated = [...recipients, newItem];
    }

    saveRecipients(updated);
    setRecipients(updated);
    setShowAddForm(false);
    setEditId(null);
  };

  const handleDelete = (id: string): void => {
    const updated = recipients.filter((r) => r.id !== id);
    saveRecipients(updated);
    setRecipients(updated);
  };

  const handleLogout = async (): Promise<void> => {
    await logout();
    setUser(null);
    navigate('/');
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
          <i className="bi bi-caret-left-fill" aria-hidden="true" />
        </button>
        <h1>{t('settings.title')}</h1>
        <div style={{ width: 40 }} />
      </div>

      <div className="screen-content">
        {/* Recipients */}
        <div className="settings-section">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div className="settings-section-title">{t('settings.recipients')}</div>
            <button className="btn btn-sm btn-outline" onClick={handleAdd}>
              + {t('settings.add_recipient')}
            </button>
          </div>

          <div className="card" style={{ padding: '0 16px' }}>
            {recipients.map((r) => (
              <div key={r.id} className="recipient-item">
                <div className="recipient-info">
                  <div className="recipient-name">{r.name || r.email}</div>
                  {r.name && <div className="recipient-email">{r.email}</div>}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-sm btn-secondary" onClick={() => handleEdit(r)}>
                    {t('settings.edit')}
                  </button>
                  <button className="btn btn-sm btn-danger" onClick={() => handleDelete(r.id)}>
                    {t('settings.delete')}
                  </button>
                </div>
              </div>
            ))}
            {recipients.length === 0 && (
              <div style={{ padding: '16px 0', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                Žádní příjemci
              </div>
            )}
          </div>

          {showAddForm && (
            <div className="card">
              <div className="form-group">
                <label className="form-label">{t('settings.name')}</label>
                <input
                  className="form-input"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Jan Novák"
                />
              </div>
              <div className="form-group">
                <label className="form-label">{t('settings.email')} *</label>
                <input
                  className="form-input"
                  type="email"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  placeholder="jan@example.com"
                />
              </div>
              {formError && (
                <div style={{ color: 'var(--error)', marginBottom: 12, fontSize: '0.875rem' }}>
                  {formError}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleSave}>
                  {t('settings.save')}
                </button>
                <button className="btn btn-secondary" onClick={() => setShowAddForm(false)}>
                  {t('settings.cancel')}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Language */}
        <div className="settings-section">
          <div className="settings-section-title">{t('settings.language')}</div>
          <LanguageSwitcher />
        </div>

        {/* About */}
        <div className="settings-section">
          <div className="settings-section-title">{t('settings.about')}</div>
          <div className="card">
            <div className="settings-item">
              <span>{t('settings.version')}</span>
              <span style={{ color: 'var(--text-secondary)' }}>1.0.0</span>
            </div>
            {user && (
              <div className="settings-item">
                <span>Account</span>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>{user.email}</span>
              </div>
            )}
          </div>
        </div>

        <button className="btn btn-danger btn-full" onClick={handleLogout}>
          {t('settings.logout')}
        </button>
      </div>
    </div>
  );
}
