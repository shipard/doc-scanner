import React, { useEffect, useState } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { getMe, User } from './services/auth';
import LoginScreen from './components/LoginScreen';
import HomeScreen from './components/HomeScreen';
import NewDocument from './components/NewDocument';
import Settings from './components/Settings';
import InstallBanner, { BeforeInstallPromptEvent } from './components/InstallBanner';

export const UserContext = React.createContext<{
  user: User | null;
  setUser: (u: User | null) => void;
}>({ user: null, setUser: () => {} });

export default function App(): React.ReactElement {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installDismissed, setInstallDismissed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const s = params.get('status');
    if (s) setStatus(s);

    getMe()
      .then((u) => {
        setUser(u);
      })
      .catch(() => {
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  // Handle invite token: store in session via server
  useEffect(() => {
    const path = location.pathname;
    if (path.startsWith('/invite/')) {
      const token = path.split('/invite/')[1];
      if (token) {
        window.location.href = `/auth/google/with-invite?invite=${token}`;
      }
    }
  }, [location.pathname]);

  useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches) return;
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as unknown as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner"></div>
      </div>
    );
  }

  const installBanner = deferredPrompt && !installDismissed ? (
    <InstallBanner
      deferredPrompt={deferredPrompt}
      onInstall={() => setDeferredPrompt(null)}
      onDismiss={() => setInstallDismissed(true)}
    />
  ) : null;

  if (!user || user.status === 'pending_approval') {
    return (
      <UserContext.Provider value={{ user, setUser }}>
        <LoginScreen statusFromUrl={status} />
        {installBanner}
      </UserContext.Provider>
    );
  }

  return (
    <UserContext.Provider value={{ user, setUser }}>
      <Routes>
        <Route path="/" element={<HomeScreen />} />
        <Route path="/new" element={<NewDocument />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/invite/:token" element={<HomeScreen />} />
        <Route path="*" element={<HomeScreen />} />
      </Routes>
      {installBanner}
    </UserContext.Provider>
  );
}
