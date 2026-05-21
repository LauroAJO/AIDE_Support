import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useStore } from './store';
import { getToken, setToken, authHeaders } from './lib/auth';
import Layout from './components/Layout';
import Login from './components/Login';
import LoadingSpinner from './components/shared/LoadingSpinner';
import SettingsPage from './components/SettingsPage';
import ProfilePage from './components/ProfilePage';

function Placeholder({ title }) {
  return (
    <div className="flex h-full flex-col">
      <h1 className="text-2xl font-bold text-ink">{title}</h1>
      <p className="mt-2 text-sm text-ink2">
        Em breve. Esta seção será construída nas próximas fases.
      </p>
    </div>
  );
}

export default function App() {
  const user = useStore((s) => s.user);
  const isLoading = useStore((s) => s.isLoading);
  const setUser = useStore((s) => s.setUser);
  const setLoading = useStore((s) => s.setLoading);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      // TEMP DEBUG (remove once auth flow is confirmed in production)
      console.log('[auth] mount URL:', window.location.href);

      // 1. Capture ?token= returned from the OAuth callback redirect.
      const params = new URLSearchParams(window.location.search);
      const urlToken = params.get('token');
      if (urlToken) {
        console.log('[auth] token found in URL:', urlToken);
        setToken(urlToken);
        // Clean the token out of the URL without a reload.
        params.delete('token');
        const clean = window.location.pathname + (params.toString() ? `?${params}` : '');
        window.history.replaceState({}, '', clean);
      }

      // 2. No token at all → straight to login.
      if (!getToken()) {
        console.log('[auth] no token present → showing Login');
        if (!cancelled) setLoading(false);
        return;
      }

      // 3. Validate the session.
      try {
        const res = await fetch('/api/auth/me', { headers: authHeaders() });
        console.log('[auth] /api/auth/me status:', res.status);
        if (!cancelled) {
          if (res.ok) {
            setUser(await res.json());
          } else {
            setUser(null);
          }
        }
      } catch {
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    bootstrap();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (isLoading) {
    return (
      <div className="h-screen bg-base">
        <LoadingSpinner label="Iniciando o Aide..." />
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/tasks" replace />} />
        <Route path="/tasks" element={<Placeholder title="Tarefas" />} />
        <Route path="/planning" element={<Placeholder title="Planejamento" />} />
        <Route path="/timer" element={<Placeholder title="Timer" />} />
        <Route path="/calendar" element={<Placeholder title="Calendário" />} />
        <Route path="/drive" element={<Placeholder title="Drive" />} />
        <Route path="/notes" element={<Placeholder title="Notas" />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="*" element={<Navigate to="/tasks" replace />} />
      </Routes>
    </Layout>
  );
}
