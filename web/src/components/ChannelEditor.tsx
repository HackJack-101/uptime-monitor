import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useMeta } from '../hooks/useAuth';
import { api, errorText } from '../lib/api';
import type { Channel } from '../lib/types';
import { DynamicForm, initialConfig, secretsPayload, type SecretInput } from './DynamicForm';
import { Button, Field, Input, Modal, Select, Switch, useToast } from './ui';

export function ChannelEditor({ projectId, channel, onClose }: { projectId: number; channel?: Channel; onClose: () => void }) {
  const meta = useMeta();
  const qc = useQueryClient();
  const toast = useToast();
  const types = meta.data?.channelTypes ?? [];
  const [type, setType] = useState(channel?.type ?? 'discord');
  const def = types.find((t) => t.type === type);
  const [name, setName] = useState(channel?.name ?? '');
  const [enabled, setEnabled] = useState(channel?.enabled ?? true);
  const [config, setConfig] = useState<Record<string, unknown>>(() => (def ? initialConfig(def, channel?.config) : {}));
  const [secrets, setSecrets] = useState<SecretInput>({});

  const save = useMutation({
    mutationFn: () => {
      const body = { name, enabled, config, secrets: secretsPayload(secrets) };
      return channel ? api.patch(`/api/channels/${channel.id}`, body) : api.post(`/api/projects/${projectId}/channels`, { ...body, type });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['channels', projectId] });
      toast(channel ? 'Channel updated' : 'Channel created');
      onClose();
    },
    onError: (e) => toast(errorText(e), 'error'),
  });

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={channel ? 'Edit channel' : 'New notification channel'}
      description="Channels are where alerts are delivered. Secrets (webhook URLs, tokens) are encrypted and never shown again."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={save.isPending} onClick={() => save.mutate()} disabled={!name.trim()}>
            Save channel
          </Button>
        </>
      }
    >
      <form className="space-y-5" onSubmit={(e) => (e.preventDefault(), save.mutate())}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" required htmlFor="ch-name">
            <Input id="ch-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ops Discord" />
          </Field>
          <Field label="Type" htmlFor="ch-type" help={channel ? 'The type cannot be changed.' : def?.description}>
            <Select
              id="ch-type"
              value={type}
              disabled={Boolean(channel)}
              onChange={(e) => {
                const next = types.find((t) => t.type === e.target.value)!;
                setType(next.type);
                setConfig(initialConfig(next));
                setSecrets({});
              }}
            >
              {types.map((t) => (
                <option key={t.type} value={t.type}>
                  {t.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {type === 'email' && meta.data && !meta.data.smtpConfigured && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
            SMTP is not configured on the server. Set <code>SMTP_HOST</code> and <code>SMTP_FROM</code> environment variables to send emails.
          </p>
        )}
        {def && <DynamicForm def={def} config={config} onConfig={setConfig} storedSecrets={channel?.secrets} secrets={secrets} onSecrets={setSecrets} />}
        <Switch checked={enabled} onChange={setEnabled} label="Enabled" description="Disabled channels never receive notifications." />
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
