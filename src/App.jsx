import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useStore } from './store';
import { getToken, setToken, authHeaders } from './lib/auth';
import { apiFetch } from './lib/api';
import { registerPush } from './lib/push';
import Layout from './components/Layout';
import Login from './components/Login';
import LoadingSpinner from './components/shared/LoadingSpinner';
import ErrorBoundary from './components/shared/ErrorBoundary';
import SettingsPage from './components/SettingsPage';
import ProfilePage from './components/ProfilePage';
import TasksPage from './components/tasks/TasksPage';
import TimerPage from './components/timer/TimerPage';
import PlanningPage from './components/planning/PlanningPage';
import CalendarPage from './components/calendar/CalendarPage';
import DrivePage from './components/drive/DrivePage';
import NotesPage from './components/notes/NotesPage';
import AlertsPage from './components/alerts/AlertsPage';
import PaymentPage from './components/payment/PaymentPage';
import DashboardPage from './components/dashboard/DashboardPage';
import MeetingPage from './components/meeting/MeetingPage';
import AreasPage from './components/areas/AreasPage';
import NetworkingPage from './components/networking/NetworkingPage';

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
      // 1. Capture ?token= returned from the OAuth callback redirect.
      const params = new URLSearchParams(window.location.search);
      const urlToken = params.get('token');
      if (urlToken) {
        setToken(urlToken);
        // Clean the token out of the URL without a reload.
        params.delete('token');
        const clean = window.location.pathname + (params.toString() ? `?${params}` : '');
        window.history.replaceState({}, '', clean);
      }

      // 2. No token at all → straight to login.
      if (!getToken()) {
        if (!cancelled) setLoading(false);
        return;
      }

      // 3. Validate the session.
      try {
        const res = await fetch('/api/auth/me', { headers: authHeaders() });
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

  // Register for push notifications once the user is authenticated.
  useEffect(() => {
    if (user) registerPush();
  }, [user]);

  // Preload the Áreas > Projetos > Frentes hierarchy so TaskEditor's cascading
  // selectors are populated regardless of which page the user lands on first.
  const setAreas = useStore((s) => s.setAreas);
  const setFronts = useStore((s) => s.setFronts);
  useEffect(() => {
    if (!user) return;
    apiFetch('/api/areas').then((d) => setAreas(d || [])).catch(() => {});
    apiFetch('/api/fronts').then((d) => setFronts(d || [])).catch(() => {});
  }, [user, setAreas, setFronts]);

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
      <ErrorBoundary>
        <Routes>
        <Route path="/" element={<Navigate to="/tasks" replace />} />
        <Route path="/tasks" element={<TasksPage />} />
        <Route path="/planning" element={<PlanningPage />} />
        <Route path="/timer" element={<TimerPage />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/drive" element={<DrivePage />} />
        <Route path="/notes" element={<NotesPage />} />
        <Route path="/alerts" element={<AlertsPage />} />
        <Route path="/meeting" element={<MeetingPage />} />
        <Route path="/areas" element={<AreasPage />} />
        <Route path="/networking" element={<NetworkingPage />} />
        <Route path="/payment" element={<PaymentPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="*" element={<Navigate to="/tasks" replace />} />
        </Routes>
      </ErrorBoundary>
    </Layout>
  );
}
