/** English guide content. Keep the section ids identical across languages (they are URL anchors). */
export const sections = [
  { id: 'start', title: 'Getting started' },
  { id: 'concepts', title: 'Core concepts' },
  { id: 'roles', title: 'Users & roles' },
  { id: 'monitors', title: 'Monitor types' },
  { id: 'ssh', title: 'SSH server check' },
  { id: 'statuses', title: 'Statuses' },
  { id: 'check-rules', title: 'Check rules' },
  { id: 'notifications', title: 'Notifications' },
  { id: 'channels', title: 'Channel setup' },
  { id: 'dns', title: 'OVH DNS zone' },
  { id: 'security', title: 'Secrets & security' },
  { id: 'faq', title: 'Troubleshooting' },
];

export function Content() {
  return (
    <>
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
        (<code>ssh-keyscan host | ssh-keygen -lf -</code>) to protect against man-in-the-middle attacks. The first lines of the command output
        are shown in the dashboard and alerts. See <a href="#ssh" className="font-medium text-brand-600 hover:underline dark:text-brand-400">SSH server check</a>{' '}
        for the recommended setup (dedicated user, restricted key, health-check script).
      </p>
      <h3>DNS</h3>
      <p>Resolves a record (A, AAAA, CNAME, MX, TXT, NS), optionally against a specific resolver, and can verify the expected value.</p>
      <h3>TLS certificate</h3>
      <p>Connects to a TLS endpoint and goes DOWN if the certificate is invalid or expires within the configured number of days.</p>

      <h2 id="ssh">SSH server check</h2>
      <p>
        To check that a server is reachable, an SSH monitor with <em>Authentication: None (banner check only)</em> is enough: it needs no
        account or key. To check its <strong>health</strong> (disk, memory, services), use a <strong>dedicated, unprivileged account</strong> 
        that logs in with a key restricted to <strong>a single read-only script</strong>. Even if the key leaked, it could do nothing else.
      </p>
      <h3>1. Create a dedicated user (on the server)</h3>
      <pre>
        <code>{"sudo useradd --system --create-home --shell /bin/sh uptime-monitor"}</code>
      </pre>
      <ul>
        <li>
          No <code>sudo</code>, and <strong>never add it to the <code>docker</code> group</strong> (equivalent to root).
        </li>
        <li>
          It needs a real shell (<code>/bin/sh</code>): with <code>nologin</code> the server cannot run the check command.
        </li>
      </ul>
      <h3>2. Generate a key for the monitor (on your computer)</h3>
      <pre>
        <code>{"ssh-keygen -t ed25519 -N \"\" -C \"uptime-monitor\" -f ./uptime-monitor"}</code>
      </pre>
      <p>
        Paste the private key (<code>uptime-monitor</code> file) into the monitor’s <em>Private key</em> field. It is encrypted and never
        displayed again, so delete the local file afterwards. A passphrase adds little, since it would be stored next to the key.
      </p>
      <h3>3. Restrict the key to one script</h3>
      <p>
        Put a single line in <code>/home/uptime-monitor/.ssh/authorized_keys</code>:
      </p>
      <pre>
        <code>{"restrict,command=\"/usr/local/bin/uptime-check\",from=\"203.0.113.10\" ssh-ed25519 AAAA… uptime-monitor"}</code>
      </pre>
      <ul>
        <li>
          <code>restrict</code> disables interactive shells, port, agent and X11 forwarding.
        </li>
        <li>
          <code>command=</code> forces the script, whatever command the client sends.
        </li>
        <li>
          <code>from=</code> only accepts the key from the public IP of the server running Uptime Monitor.
        </li>
      </ul>
      <pre>
        <code>{"sudo chown -R uptime-monitor: /home/uptime-monitor/.ssh\nsudo chmod 700 /home/uptime-monitor/.ssh\nsudo chmod 600 /home/uptime-monitor/.ssh/authorized_keys"}</code>
      </pre>
      <h3>4. The health-check script</h3>
      <p>
        It only reads the system state, prints <code>OK …</code> and exits with <code>0</code> when healthy, or prints one 
        <code>FAIL: …</code> line per problem and exits with <code>1</code>. The monitor shows the first lines of the output in the
        dashboard and in alerts, e.g. <em>“Command exited with code 1: FAIL: disk / at 93%”</em>.
      </p>
      <pre>
        <code>{"#!/bin/sh\n# /usr/local/bin/uptime-check — read-only health check for Uptime Monitor\nset -u\nstatus=0\nfail() { echo \"FAIL: $*\"; status=1; }\n\n# Disk: / above 90 %\nuse=$(df -P / | awk 'NR==2 {gsub(\"%\",\"\",$5); print $5}')\n[ \"$use\" -lt 90 ] || fail \"disk / at ${use}%\"\n\n# Memory: less than 10 % available\navail=$(awk '/MemAvailable/ {a=$2} /MemTotal/ {t=$2} END {print int(a*100/t)}' /proc/meminfo)\n[ \"$avail\" -ge 10 ] || fail \"memory available ${avail}%\"\n\n# Load: 1-minute average above 2 × CPUs\nload=$(cut -d' ' -f1 /proc/loadavg); cpus=$(nproc)\nawk -v l=\"$load\" -v c=\"$cpus\" 'BEGIN { exit !(l > c * 2) }' && fail \"load ${load} (${cpus} CPUs)\"\n\n# Services that must be running (edit the list)\nfor svc in docker nginx; do\n  systemctl is-active --quiet \"$svc\" || fail \"service ${svc} is not active\"\ndone\n\n[ \"$status\" -eq 0 ] && echo \"OK disk=${use}% mem_avail=${avail}% load=${load}\"\nexit \"$status\""}</code>
      </pre>
      <pre>
        <code>{"sudo install -o root -g root -m 755 uptime-check /usr/local/bin/uptime-check"}</code>
      </pre>
      <p>The script belongs to root, so the monitoring account cannot modify it.</p>
      <h3>5. Pin the server host key</h3>
      <pre>
        <code>{"ssh-keyscan -t ed25519 your-server.example.com 2>/dev/null | ssh-keygen -lf -\n# 256 SHA256:AbCdEf… your-server.example.com (ED25519)"}</code>
      </pre>
      <p>
        Copy the <code>SHA256:…</code> value into <em>Host key fingerprint</em>, so the monitor refuses a server that impersonates yours. If
        the check reports “Host key fingerprint mismatch”, the server offered another key type: run the command again with 
        <code>-t ecdsa</code>.
      </p>
      <h3>6. Create the monitor</h3>
      <table>
        <tbody>
          <tr>
            <td>Type</td>
            <td>
              <strong>SSH</strong>
            </td>
          </tr>
          <tr>
            <td>Username</td>
            <td>
              <code>uptime-monitor</code>
            </td>
          </tr>
          <tr>
            <td>Authentication</td>
            <td>Private key</td>
          </tr>
          <tr>
            <td>Host key fingerprint</td>
            <td>
              The <code>SHA256:…</code> value from step 5
            </td>
          </tr>
          <tr>
            <td>Command</td>
            <td>
              Any value, e.g. <code>check</code> (the script is forced)
            </td>
          </tr>
          <tr>
            <td>Expected output contains</td>
            <td>
              <code>OK</code> (optional, the exit code is enough)
            </td>
          </tr>
          <tr>
            <td>Check interval</td>
            <td>5 minutes (every check is a login in the server’s auth log), 1–2 minutes for critical servers</td>
          </tr>
          <tr>
            <td>Retries</td>
            <td>1</td>
          </tr>
        </tbody>
      </table>
      <h3>7. On the server side</h3>
      <ul>
        <li>
          <strong>fail2ban</strong>: add the monitor’s IP to <code>ignoreip</code>, so a misconfiguration cannot get it banned.
        </li>
        <li>
          <strong>Firewall</strong>: allow port 22 from the monitor’s IP if access is restricted.
        </li>
        <li>
          <strong>
            <code>AllowUsers</code>
          </strong> 
          in <code>sshd_config</code>: add <code>uptime-monitor</code> if you use it.
        </li>
        <li>
          Test before creating the monitor. This must print <code>OK …</code> and disconnect:
        </li>
      </ul>
      <pre>
        <code>{"ssh -i ./uptime-monitor uptime-monitor@your-server.example.com"}</code>
      </pre>

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

      <h2 id="dns">OVH DNS zone</h2>
      <p>
        Connect an OVHcloud account to a project to compare <strong>one DNS zone</strong> with the project’s monitors. The dedicated{' '}
        <em>DNS zone</em> page lists every host of the zone (A, AAAA and CNAME records) and shows whether it is:
      </p>
      <ul>
        <li>
          <strong>Running</strong>: at least one monitor targets the host and everything is up, following the check rules of those monitors
          (degraded hosts are counted as running but flagged).
        </li>
        <li>
          <strong>In error</strong>: one of its monitors is DOWN.
        </li>
        <li>
          <strong>Not monitored</strong>: the record exists, but no monitor of the project targets it. Editors can click <em>Monitor it</em>{' '}
          to create an HTTPS monitor for it.
        </li>
      </ul>
      <p>
        A monitor is linked to a host when its target hostname matches exactly: the URL host for HTTP monitors, the hostname for DNS
        monitors, the host for TCP, ping, SSH and TLS monitors. A wildcard record such as <code>*.apps.example.com</code> groups the monitors
        of the hosts it resolves (<code>shop.apps.example.com</code>). Monitors targeting a host under the zone that has no record appear
        under <em>Monitored hosts without a DNS record</em>.
      </p>
      <h3>Connecting an account (admins)</h3>
      <ol>
        <li>
          Open the OVH token page for your region (link in the settings form) and create credentials with <strong>GET</strong> rights on{' '}
          <code>/domain/zone</code> and <code>/domain/zone/*</code>. Read-only credentials are enough, so never grant write rights.
        </li>
        <li>
          In <em>Project → Settings → OVH DNS zone</em>, enter the endpoint, application key, application secret and consumer key, click{' '}
          <em>Load my domains</em>, pick the domain and save.
        </li>
      </ol>
      <p>
        The zone is cached and refreshed automatically when it is older than 15 minutes, or on demand with <em>Refresh from OVH</em>. Host
        states are always live. The application secret and consumer key are encrypted like every other secret and never displayed again.
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
    </>
  );
}
