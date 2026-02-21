import { useTranslation } from 'react-i18next';

export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface Props {
  deferredPrompt: BeforeInstallPromptEvent;
  onInstall: () => void;
  onDismiss: () => void;
}

export default function InstallBanner({ deferredPrompt, onInstall, onDismiss }: Props) {
  const { t } = useTranslation();

  const handleInstall = async () => {
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    onInstall();
  };

  return (
    <div className="install-banner">
      <span className="install-banner__text">{t('install.message')}</span>
      <button className="install-banner__btn" onClick={handleInstall}>{t('install.button')}</button>
      <button className="install-banner__dismiss" onClick={onDismiss} aria-label={t('install.dismiss')}><i className="bi bi-x-lg" aria-hidden="true" /></button>
    </div>
  );
}
