import { useEffect, useState } from 'react';
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
import ChatPage from './components/chat/ChatPage';
import AdminPage from './components/admin/AdminPage';
import PendingApprovalPage from './components/PendingApprovalPage';

// Permission-aware route gate. Owner bypasses. Anyone else needs a non-'none'
// value on userPermissions[feature]; missing/none renders the friendly
// "Sem acesso" placeholder instead of the page.
function ProtectedRoute({ feature, children }) {
  const user = useStore((s) => s.user);
  const userPermissions = useStore((s) => s.userPermissions);

  if (!user) return <Navigate to="/" replace />;
  if (user.role === 'owner') return children;

  const perm = userPermissions && userPermissions[feature];
  if (!perm || perm === 'none') {
    return (
      <div className="flex h-full items-center justify-center text-muted">
        <div className="text-center">
          <p className="text-lg font-medium text-ink2">Sem acesso a esta área</p>
          <p className="mt-1 text-sm">Contacte o administrador.</p>
        </div>
      </div>
    );
  }
  return children;
}

// Owner-only gate for /admin. Same shape as ProtectedRoute but tied to the
// role rather than to a permission feature.
function OwnerRoute({ children }) {
  const user = useStore((s) => s.user);
  if (!user) return <Navigate to="/" replace />;
  if (user.role !== 'owner') {
    return (
      <div className="flex h-full items-center justify-center text-muted">
        <div className="text-center">
          <p className="text-lg font-medium text-ink2">Apenas administradores</p>
          <p className="mt-1 text-sm">Esta área é restrita ao owner.</p>
        </div>
      </div>
    );
  }
  return children;
}

export default function App() {
  const user = useStore((s) => s.user);
  const isLoading = useStore((s) => s.isLoading);
  const setUser = useStore((s) => s.setUser);
  const setLoading = useStore((s) => s.setLoading);
  const setAllUsers = useStore((s) => s.setAllUsers);
  const setPendingUsers = useStore((s) => s.setPendingUsers);

  // `pending=true` is the redirect target for users whose OAuth callback
  // didn't return a token (status='pending'). The flag is captured on the
  // initial URL and survives a re-render so PendingApprovalPage renders even
  // before we have a user object.
  const [pendingFlag, setPendingFlag] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      // 1. Capture ?token= returned from the OAuth callback redirect, or the
      //    ?pending=true flag for users awaiting owner approval.
      const params = new URLSearchParams(window.location.search);
      const urlToken = params.get('token');
      const urlPending = params.get('pending');
      if (urlToken) {
        setToken(urlToken);
        params.delete('token');
      }
      if (urlPending === 'true') {
        setPendingFlag(true);
        params.delete('pending');
      }
      if (urlToken || urlPending) {
        const clean = window.location.pathname + (params.toString() ? `?${params}` : '');
        window.history.replaceState({}, '', clean);
      }

      // 2. No token at all → straight to login (or the pending screen).
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
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Register for push notifications once the user is authenticated.
  useEffect(() => {
    if (user) registerPush();
  }, [user]);

  // Preload Áreas > Projetos > Frentes so TaskEditor's cascading selectors are
  // populated regardless of which page the user lands on first.
  const setAreas = useStore((s) => s.setAreas);
  const setFronts = useStore((s) => s.setFronts);
  useEffect(() => {
    if (!user) return;
    apiFetch('/api/areas').then((d) => setAreas(d || [])).catch(() => {});
    apiFetch('/api/fronts').then((d) => setFronts(d || [])).catch(() => {});
  }, [user, setAreas, setFronts]);

  // Owner-only: hydrate the admin team lists so the sidebar badge can render
  // immediately and AdminPage doesn't have to fetch on every mount.
  useEffect(() => {
    if (!user || user.role !== 'owner') return;
    apiFetch('/api/users/all').then((d) => setAllUsers(d || [])).catch(() => {});
    apiFetch('/api/users/pending').then((d) => setPendingUsers(d || [])).catch(() => {});
  }, [user, setAllUsers, setPendingUsers]);

  if (isLoading) {
    return (
      <div className="h-screen bg-base">
        <LoadingSpinner label="Iniciando o Aide..." />
      </div>
    );
  }

  // Pending users (or anyone bounced from OAuth with ?pending=true and no
  // token) see the waiting screen instead of the login or the app shell.
  if (pendingFlag || (user && user.status === 'pending')) {
    return <PendingApprovalPage />;
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
          <Route
            path="/planning"
            element={<ProtectedRoute feature="planning"><PlanningPage /></ProtectedRoute>}
          />
          <Route path="/timer" element={<TimerPage />} />
          <Route
            path="/calendar"
            element={<ProtectedRoute feature="calendar"><CalendarPage /></ProtectedRoute>}
          />
          <Route
            path="/drive"
            element={<ProtectedRoute feature="drive"><DrivePage /></ProtectedRoute>}
          />
          <Route
            path="/notes"
            element={<ProtectedRoute feature="notes"><NotesPage /></ProtectedRoute>}
          />
          <Route
            path="/alerts"
            element={<ProtectedRoute feature="alerts"><AlertsPage /></ProtectedRoute>}
          />
          <Route path="/meeting" element={<MeetingPage />} />
          <Route
            path="/areas"
            element={<ProtectedRoute feature="areas"><AreasPage /></ProtectedRoute>}
          />
          <Route
            path="/networking"
            element={<ProtectedRoute feature="networking"><NetworkingPage /></ProtectedRoute>}
          />
          <Route
            path="/payment"
            element={<ProtectedRoute feature="payment"><PaymentPage /></ProtectedRoute>}
          />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route
            path="/chat"
            element={<ProtectedRoute feature="chat"><ChatPage /></ProtectedRoute>}
          />
          <Route path="/admin" element={<OwnerRoute><AdminPage /></OwnerRoute>} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="*" element={<Navigate to="/tasks" replace />} />
        </Routes>
      </ErrorBoundary>
    </Layout>
  );
}
