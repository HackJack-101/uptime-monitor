import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Button, Card, CardHeader, Field, Input, PageHeader, PasswordInput, Select, useToast } from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import { LOCALES, t } from '../i18n';
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
      toast(t('account.profileUpdated'));
    },
    onError: (e) => toast(errorText(e), 'error'),
  });
  // The interface switches language as soon as the profile is refetched.
  const saveLocale = useMutation({
    mutationFn: (locale: string | null) => api.patch('/api/auth/me', { locale }),
    onSuccess: () => refresh(),
    onError: (e) => toast(errorText(e), 'error'),
  });
  const changePassword = useMutation({
    mutationFn: () => {
      if (next !== confirm) throw new Error(t('common.passwordsMismatch'));
      return api.post('/api/auth/password', { currentPassword: current, newPassword: next });
    },
    onSuccess: () => {
      setCurrent('');
      setNext('');
      setConfirm('');
      toast(t('account.passwordChanged'));
    },
    onError: (e) => toast(errorText(e), 'error'),
  });

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={t('account.title')} description={user && `${user.email} · ${t(`role.${user.role}`)}`} />
      <div className="space-y-6">
        <Card>
          <CardHeader title={t('account.profile')} />
          <form className="flex flex-col gap-3 p-5 sm:flex-row sm:items-end" onSubmit={(e) => (e.preventDefault(), saveName.mutate())}>
            <div className="flex-1">
              <Field label={t('account.displayName')} htmlFor="acc-name">
                <Input id="acc-name" value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
            </div>
            <Button type="submit" variant="primary" loading={saveName.isPending}>
              {t('common.save')}
            </Button>
          </form>
        </Card>
        <Card>
          <CardHeader title={t('account.language')} description={t('account.languageHelp')} />
          <div className="p-5">
            <Select
              aria-label={t('account.language')}
              value={user?.locale ?? ''}
              disabled={saveLocale.isPending}
              onChange={(e) => saveLocale.mutate(e.target.value || null)}
              className="sm:max-w-xs"
            >
              <option value="">{t('account.languageAuto')}</option>
              {LOCALES.map((l) => (
                <option key={l.value} value={l.value} lang={l.value.slice(0, 2)}>
                  {l.label}
                </option>
              ))}
            </Select>
          </div>
        </Card>
        <Card>
          <CardHeader title={t('account.changePassword')} description={t('account.changePasswordHelp')} />
          <form className="space-y-4 p-5" onSubmit={(e) => (e.preventDefault(), changePassword.mutate())}>
            <Field label={t('account.currentPassword')} htmlFor="acc-cur">
              <PasswordInput id="acc-cur" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('account.newPassword')} htmlFor="acc-new">
                <PasswordInput id="acc-new" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" minLength={10} required />
              </Field>
              <Field label={t('account.confirm')} htmlFor="acc-conf">
                <PasswordInput id="acc-conf" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
              </Field>
            </div>
            <div className="flex justify-end">
              <Button type="submit" variant="primary" loading={changePassword.isPending}>
                {t('account.updatePassword')}
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
