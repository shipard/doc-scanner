import React from 'react';
import { useTranslation } from 'react-i18next';

export default function LanguageSwitcher(): React.ReactElement {
  const { i18n } = useTranslation();

  const setLang = (lang: string): void => {
    i18n.changeLanguage(lang);
    localStorage.setItem('language', lang);
  };

  return (
    <div className="lang-switcher">
      <button
        className={`lang-btn ${i18n.language === 'cs' ? 'active' : ''}`}
        onClick={() => setLang('cs')}
      >
        🇨🇿 Česky
      </button>
      <button
        className={`lang-btn ${i18n.language === 'en' ? 'active' : ''}`}
        onClick={() => setLang('en')}
      >
        🇬🇧 English
      </button>
    </div>
  );
}
