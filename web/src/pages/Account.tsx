import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Button, Card, CardHeader, Field, Input, PageHeader, PasswordInput, useToast } from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import { api, errorText } from '../lib/api';

export function AccountPage() {
  const { user, refresh } = useAuth();
  const toast = useToast();
  const [name, setName] = useState(user?.name ?? '');
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');

  const saveName = useMutation({
    mutationFn: () => api.patch('/api/auth/me', { name }),
    onSuccess: () => {
      refresh();
      toast('Profile updated');
    },
    onError: (e) => toast(errorText(e), 'error'),
  });
  const changePassword = useMutation({
    mutationFn: () => {
      if (next !== confirm) throw new Error('Passwords do not match');
      return api.post('/api/auth/password', { currentPassword: current, newPassword: next });
    },
    onSuccess: () => {
      setCurrent('');
      setNext('');
      setConfirm('');
      toast('Password changed. Other sessions were signed out.');
    },
    onError: (e) => toast(errorText(e), 'error'),
  });

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Account" description={`${user?.email} · ${user?.role}`} />
      <div className="space-y-6">
        <Card>
          <CardHeader title="Profile" />
          <form className="flex flex-col gap-3 p-5 sm:flex-row sm:items-end" onSubmit={(e) => (e.preventDefault(), saveName.mutate())}>
            <div className="flex-1">
              <Field label="Display name" htmlFor="acc-name">
                <Input id="acc-name" value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
            </div>
            <Button type="submit" variant="primary" loading={saveName.isPending}>
              Save
            </Button>
          </form>
        </Card>
        <Card>
          <CardHeader title="Change password" description="At least 10 characters. A passphrase is a good idea." />
          <form className="space-y-4 p-5" onSubmit={(e) => (e.preventDefault(), changePassword.mutate())}>
            <Field label="Current password" htmlFor="acc-cur">
              <PasswordInput id="acc-cur" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="New password" htmlFor="acc-new">
                <PasswordInput id="acc-new" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" minLength={10} required />
              </Field>
              <Field label="Confirm" htmlFor="acc-conf">
                <PasswordInput id="acc-conf" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
              </Field>
            </div>
            <div className="flex justify-end">
              <Button type="submit" variant="primary" loading={changePassword.isPending}>
                Update password
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
