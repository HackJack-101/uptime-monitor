import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, Link, Navigate, RouterProvider, useLocation } from 'react-router';
import { Layout } from './components/Layout';
import { Button, EmptyState, PageLoader, ToastProvider } from './components/ui';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { I18nProvider, t } from './i18n';
import { ApiError } from './lib/api';
import { AccountPage } from './pages/Account';
import { DashboardPage } from './pages/Dashboard';
import { DnsZonePage } from './pages/DnsZone';
import { GuidePage } from './pages/Guide';
import { LoginPage } from './pages/Login';
import { MonitorDetailPage } from './pages/MonitorDetail';
import { MonitorFormPage } from './pages/MonitorForm';
import { ProjectDetailPage } from './pages/ProjectDetail';
import { ProjectsPage } from './pages/Projects';
import { SetupPage } from './pages/Setup';
import { UsersPage } from './pages/Users';
import './index.css';
import { Compass } from 'lucide-react';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (count, err) => !(err instanceof ApiError && [401, 403, 404].includes(err.status)) && count < 2,
      refetchOnWindowFocus: true,
    },
  },
});

function RequireAuth({ children, admin }: { children: ReactNode; admin?: boolean }) {
  const { user, loading, isAdmin } = useAuth();
  const location = useLocation();
  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (admin && !isAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function NotFound() {
  return (
    <EmptyState
      icon={<Compass className="size-5" />}
      title={t('notFound.title')}
      description={t('notFound.description')}
      action={
        <Link to="/">
          <Button variant="primary">{t('notFound.back')}</Button>
        </Link>
      }
    />
  );
}

const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/setup', element: <SetupPage /> },
  {
    element: (
      <RequireAuth>
        <Layout />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'projects', element: <ProjectsPage /> },
      { path: 'projects/:id', element: <ProjectDetailPage /> },
      { path: 'projects/:id/monitors/new', element: <MonitorFormPage /> },
      { path: 'projects/:id/dns', element: <DnsZonePage /> },
      { path: 'monitors/:monitorId', element: <MonitorDetailPage /> },
      { path: 'monitors/:monitorId/edit', element: <MonitorFormPage /> },
      { path: 'users', element: <RequireAuth admin><UsersPage /></RequireAuth> },
      { path: 'account', element: <AccountPage /> },
      { path: 'guide', element: <GuidePage /> },
      { path: '*', element: <NotFound /> },
    ],
  },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <I18nProvider>
          <ToastProvider>
            <RouterProvider router={router} />
          </ToastProvider>
        </I18nProvider>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
