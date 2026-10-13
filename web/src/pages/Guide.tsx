import clsx from 'clsx';
import { useEffect, useState } from 'react';
import { Card, PageHeader } from '../components/ui';

const SECTIONS = [
  { id: 'start', title: 'Getting started' },
  { id: 'concepts', title: 'Core concepts' },
  { id: 'roles', title: 'Users & roles' },
  { id: 'monitors', title: 'Monitor types' },
  { id: 'statuses', title: 'Statuses' },
  { id: 'check-rules', title: 'Check rules' },
  { id: 'notifications', title: 'Notifications' },
  { id: 'channels', title: 'Channel setup' },
  { id: 'security', title: 'Secrets & security' },
  { id: 'faq', title: 'Troubleshooting' },
];

export function GuidePage() {
  const [active, setActive] = useState('start');

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: '-80px 0px -70% 0px' },
    );
    SECTIONS.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <PageHeader title="Guide" description="Everything you need to know to monitor your services." />
      <div className="lg:grid lg:grid-cols-[200px_1fr] lg:gap-10">
        <nav className="mb-6 lg:mb-0">
          <div className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-2 lg:sticky lg:top-10 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0">
            {SECTIONS.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth' });
                }}
                className={clsx(
                  'shrink-0 rounded-lg px-3 py-1.5 text-sm whitespace-nowrap transition-colors',
                  active === s.id
                    ? 'bg-brand-50 font-medium text-brand-700 dark:bg-brand-500/10 dark:text-brand-300'
                    : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-100',
                )}
              >
                {s.title}
              </a>
            ))}
          </div>
        </nav>

        <Card className="prose-guide min-w-0 px-5 py-2 sm:px-8 sm:py-4">
          <h2 id="start">Getting started</h2>
          <ol>
            <li>
              <strong>Create a project</strong> (admins) from <em>Projects → New project</em>. A project groups related services, for example
              “Production”, “Home lab” or a customer name.
            </li>
            <li>
              <strong>Add a notification channel</strong> in the project’s <em>Notifications</em> tab (Discord, email, Telegram…) and click{' '}
              <em>Test</em> to verify delivery.
            </li>
            <li>
              <strong>Add a notification rule</strong> that sends “Goes down” and “Recovers” events to that channel. Project rules apply to every
              monitor in the project.
            </li>
            <li>
              <strong>Add monitors</strong> with <em>Add monitor</em>. The first check runs within a few seconds.
            </li>
            <li>
              <strong>Invite your team</strong> from <em>Users</em> and give them access to the right projects.
            </li>
          </ol>

          <h2 id="concepts">Core concepts</h2>
          <ul>
            <li>
              <strong>Project</strong>: a container for monitors, notification channels, notification rules and members. Every monitor belongs to
              exactly one project, so there is no monitor without a project.
            </li>
            <li>
              <strong>Monitor</strong>: one service to check (a URL, a port, a host…), with its own check type, target, check rules and optional
              notification rules.
            </li>
            <li>
              <strong>Check</strong>: a single probe of a monitor. Results are kept for the retention period (30 days by default) and power the
              uptime percentages and charts.
            </li>
            <li>
              <strong>Incident</strong>: opened when a monitor goes DOWN, closed when it comes back.
            </li>
            <li>
              <strong>Channel</strong>: a destination for alerts (a Discord webhook, an email list…). Channels belong to a project.
            </li>
            <li>
              <strong>Rule</strong>: decides <em>which events</em> are sent to <em>which channels</em>, and <em>when</em>.
            </li>
          </ul>

          <h2 id="roles">Users &amp; roles</h2>
          <table>
            <thead>
              <tr>
                <th>Role</th>
                <th>What they can do</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <strong>Superadmin</strong>
                </td>
                <td>Exactly one. Full access, and the only person who can create or manage admins. Cannot be deleted or demoted.</td>
              </tr>
              <tr>
                <td>
                  <strong>Admin</strong>
                </td>
                <td>Full access to every project. Creates projects, manages users with the “user” role and project members.</td>
              </tr>
              <tr>
                <td>
                  <strong>User · editor</strong>
                </td>
                <td>Sees only assigned projects. Can create, edit and delete monitors, channels and rules in those projects.</td>
              </tr>
              <tr>
                <td>
                  <strong>User · viewer</strong>
                </td>
                <td>Read-only access to assigned projects.</td>
              </tr>
            </tbody>
          </table>
          <p>A user can be assigned to as many projects as needed, with a different access level (viewer / editor) in each.</p>

          <h2 id="monitors">Monitor types</h2>
          <h3>HTTP(S)</h3>
          <p>
            Sends a request and checks the <strong>status code</strong> against the accepted list (e.g. <code>200-299,301</code>). Options:
          </p>
          <ul>
            <li>
              <strong>Authentication</strong>: Basic auth, Bearer token or a custom header such as <code>X-API-Key</code>. Credentials are stored
              encrypted and are never sent to another domain when following redirects.
            </li>
            <li>
              <strong>Keyword</strong>: require (or forbid) a text in the response body, which is handy to detect error pages that return 200.
            </li>
            <li>
              <strong>Certificate expiry</strong>: HTTPS monitors also track the TLS certificate and can emit a “Certificate expiring” event.
            </li>
          </ul>
          <h3>TCP port</h3>
          <p>Opens a TCP connection (databases, mail servers, game servers…). Success means the port accepts connections.</p>
          <h3>Ping (ICMP)</h3>
          <p>The classic ping. The response time is the average round-trip time of the packets sent.</p>
          <h3>SSH</h3>
          <p>
            Authenticates with a password or private key, then optionally runs a command (for example <code>systemctl is-active nginx</code>). The
            check fails if the command exits with a non-zero code or the expected output is missing. Set the <strong>host key fingerprint</strong>{' '}
            (<code>ssh-keyscan host | ssh-keygen -lf -</code>) to protect against man-in-the-middle attacks. Use a dedicated, low-privilege
            account.
          </p>
          <h3>DNS</h3>
          <p>Resolves a record (A, AAAA, CNAME, MX, TXT, NS), optionally against a specific resolver, and can verify the expected value.</p>
          <h3>TLS certificate</h3>
          <p>Connects to a TLS endpoint and goes DOWN if the certificate is invalid or expires within the configured number of days.</p>

          <h2 id="statuses">Statuses</h2>
          <table>
            <tbody>
              <tr>
                <td>🟢 Up</td>
                <td>The last check succeeded.</td>
              </tr>
              <tr>
                <td>🟠 Degraded</td>
                <td>The check succeeded, but the response time was above the “Degraded above” threshold.</td>
              </tr>
              <tr>
                <td>🔴 Down</td>
                <td>The check failed more times in a row than the allowed retries.</td>
              </tr>
              <tr>
                <td>🔵 Pending</td>
                <td>Not checked yet, or failing but still within its retries.</td>
              </tr>
              <tr>
                <td>⚪ Paused</td>
                <td>Checks are suspended and no alert is sent.</td>
              </tr>
            </tbody>
          </table>

          <h2 id="check-rules">Check rules</h2>
          <p>Check rules control how a monitor is probed. They use a three-level inheritance:</p>
          <p>
            <strong>Monitor override</strong> → <strong>Project default</strong> → <strong>Global default</strong>
          </p>
          <p>Leave a field empty to inherit. The placeholder shows the inherited value.</p>
          <table>
            <thead>
              <tr>
                <th>Setting</th>
                <th>Meaning</th>
                <th>Global default</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Check interval</td>
                <td>Time between checks (min 20s).</td>
                <td>60s</td>
              </tr>
              <tr>
                <td>Timeout</td>
                <td>A check slower than this fails.</td>
                <td>10s</td>
              </tr>
              <tr>
                <td>Retries</td>
                <td>Consecutive failures tolerated before going DOWN. Avoids alerts on a single network hiccup.</td>
                <td>0</td>
              </tr>
              <tr>
                <td>Retry interval</td>
                <td>Delay between checks while retrying.</td>
                <td>30s</td>
              </tr>
              <tr>
                <td>Degraded above</td>
                <td>Response time (ms) above which a successful check is DEGRADED.</td>
                <td>disabled</td>
              </tr>
            </tbody>
          </table>

          <h2 id="notifications">Notifications</h2>
          <p>
            A <strong>rule</strong> links <strong>events</strong> to <strong>channels</strong>. Rules have a <strong>scope</strong>:
          </p>
          <ul>
            <li>
              <strong>Project rules</strong> (project → Notifications tab) apply to every monitor of the project.
            </li>
            <li>
              <strong>Monitor rules</strong> (monitor → Notifications tab) apply to that monitor only, in addition to project rules.
            </li>
            <li>
              Turn off <em>Use project notification rules</em> on a monitor to apply <strong>only</strong> its own rules, e.g. to send a noisy
              staging service to a different channel.
            </li>
          </ul>
          <h3>Events</h3>
          <ul>
            <li>
              <strong>Goes down</strong>: the monitor is confirmed DOWN.
            </li>
            <li>
              <strong>Recovers</strong>: the monitor is back up. Only sent if the rule previously alerted about the outage.
            </li>
            <li>
              <strong>Becomes degraded</strong>: response time crossed the degraded threshold.
            </li>
            <li>
              <strong>Certificate expiring</strong>: TLS certificate expires within the configured days (at most once a day).
            </li>
          </ul>
          <h3>Fine-tuning</h3>
          <ul>
            <li>
              <strong>Failure threshold</strong>: number of consecutive DOWN checks before this rule fires. Use 1 for critical services and 3+ for
              flaky ones. Combined with retries, it lets you route “first warning” and “still down” alerts to different channels.
            </li>
            <li>
              <strong>Reminder</strong>: re-sends the DOWN alert every N minutes while the outage lasts.
            </li>
          </ul>
          <p>If several rules target the same channel for the same event, only one message is sent.</p>

          <h2 id="channels">Channel setup</h2>
          <table>
            <thead>
              <tr>
                <th>Channel</th>
                <th>How to configure</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Email</td>
                <td>
                  The server administrator sets <code>SMTP_HOST</code>, <code>SMTP_PORT</code>, <code>SMTP_USER</code>, <code>SMTP_PASSWORD</code>,{' '}
                  <code>SMTP_FROM</code>. Then add recipients, comma-separated.
                </td>
              </tr>
              <tr>
                <td>Discord</td>
                <td>Channel settings → Integrations → Webhooks → New webhook → Copy URL.</td>
              </tr>
              <tr>
                <td>Slack</td>
                <td>Create an app with “Incoming Webhooks” enabled and copy the webhook URL.</td>
              </tr>
              <tr>
                <td>Telegram</td>
                <td>
                  Talk to <code>@BotFather</code> to create a bot and get its token. Send a message to the bot (or add it to a group), then open{' '}
                  <code>https://api.telegram.org/bot&lt;token&gt;/getUpdates</code> to find the chat ID.
                </td>
              </tr>
              <tr>
                <td>Signal</td>
                <td>
                  Run the free <code>bbernhard/signal-cli-rest-api</code> container, link it to a Signal number, then enter its URL, the sender number
                  and the recipients (phone numbers or group IDs).
                </td>
              </tr>
              <tr>
                <td>ntfy</td>
                <td>
                  Pick a hard-to-guess topic name on <code>https://ntfy.sh</code> (or your own server), and subscribe to it in the ntfy mobile app.
                </td>
              </tr>
              <tr>
                <td>Gotify</td>
                <td>Create an application in Gotify and paste its token.</td>
              </tr>
              <tr>
                <td>Webhook</td>
                <td>Receives a JSON <code>POST</code> with event, title, text, monitor, project and URL fields.</td>
              </tr>
            </tbody>
          </table>
          <p>
            <strong>WhatsApp</strong> is not supported. There is no free official API, and unofficial gateways break WhatsApp’s terms of service.
            Use Signal or Telegram instead.
          </p>

          <h2 id="security">Secrets &amp; security</h2>
          <ul>
            <li>
              Passwords, tokens, private keys and webhook URLs are <strong>encrypted at rest</strong> (AES-256-GCM) with the server’s{' '}
              <code>APP_SECRET</code>.
            </li>
            <li>
              Secrets are <strong>write-only</strong>: once saved, the API never sends them back, not even to admins. The form shows “Stored
              encrypted” with <em>Replace</em> / <em>Remove</em> actions.
            </li>
            <li>Secret values are automatically masked if they ever appear in an error message.</li>
            <li>
              User passwords are hashed with scrypt. Sessions use secure, HTTP-only, SameSite=Strict cookies and are revoked when a password,
              role or account status changes.
            </li>
            <li>Sign-in attempts are rate-limited, and security-relevant actions are recorded in the audit log (Users → Audit log).</li>
            <li>Prefer dedicated, read-only credentials for monitoring (a health-check API key, a restricted SSH user…).</li>
          </ul>

          <h2 id="faq">Troubleshooting</h2>
          <h3>Ping always fails</h3>
          <p>Some hosts or firewalls drop ICMP. Use a TCP or HTTP monitor instead.</p>
          <h3>I received no notification</h3>
          <ul>
            <li>Use the channel’s <em>Test</em> button to check delivery.</li>
            <li>Make sure a rule includes the event and the channel, and that both are enabled.</li>
            <li>Check the failure threshold: with a threshold of 3 and a 60s interval, the first alert arrives after about 3 minutes.</li>
            <li>“Recovers” is only sent after a “Goes down” notification from the same rule.</li>
          </ul>
          <h3>“Unable to decrypt secrets”</h3>
          <p>
            The server’s <code>APP_SECRET</code> changed. Restore the previous value, or re-enter the secrets of the affected monitors and
            channels.
          </p>
        </Card>
      </div>
    </>
  );
}
