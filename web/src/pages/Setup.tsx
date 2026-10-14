import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { Button, Field, Input, PasswordInput, PageLoader } from '../components/ui';
import { t } from '../i18n';
import { api, errorText } from '../lib/api';
import { AuthShell } from './Login';

export function SetupPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const setup = useQuery({ queryKey: ['setup'], queryFn: () => api.get<{ needsSetup: boolean }>('/api/setup') });
  const [form, setForm] = useState({ token: '', name: '', email: '', password: '', confirm: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (setup.isLoading) return <PageLoader />;
  if (!setup.data?.needsSetup) return <Navigate to="/login" replace />;

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (form.password !== form.confirm) return setError(t('common.passwordsMismatch'));
    setLoading(true);
    setError('');
    try {
      await api.post('/api/setup', { token: form.token, name: form.name, email: form.email, password: form.password });
      qc.setQueryData(['setup'], { needsSetup: false });
      await qc.invalidateQueries({ queryKey: ['me'] });
      navigate('/');
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title={t('setup.title')}
      subtitle={
        <>
          {t('setup.subtitle')}
          <br />
          (<code className="text-xs">docker logs uptime-monitor</code>).
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label={t('setup.token')} htmlFor="token">
          <Input id="token" required value={form.token} onChange={set('token')} autoComplete="off" className="font-mono" />
        </Field>
        <Field label={t('common.name')} htmlFor="name">
          <Input id="name" required value={form.name} onChange={set('name')} autoComplete="name" />
        </Field>
        <Field label={t('common.email')} htmlFor="email">
          <Input id="email" type="email" required value={form.email} onChange={set('email')} autoComplete="username" />
        </Field>
        <Field label={t('common.password')} htmlFor="password" help={t('common.passwordHelp')}>
          <PasswordInput id="password" required minLength={10} value={form.password} onChange={set('password')} autoComplete="new-password" />
        </Field>
        <Field label={t('setup.confirm')} htmlFor="confirm">
          <PasswordInput id="confirm" required value={form.confirm} onChange={set('confirm')} autoComplete="new-password" />
        </Field>
        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
        <Button type="submit" variant="primary" className="w-full" loading={loading}>
          {t('setup.submit')}
        </Button>
      </form>
    </AuthShell>
  );
}
