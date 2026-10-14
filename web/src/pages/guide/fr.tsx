/** Guide en français. Les identifiants de section doivent rester ceux de la version anglaise (ancres d'URL). */
export const sections = [
  { id: 'start', title: 'Premiers pas' },
  { id: 'concepts', title: 'Notions clés' },
  { id: 'roles', title: 'Utilisateurs et rôles' },
  { id: 'monitors', title: 'Types de moniteurs' },
  { id: 'ssh', title: 'Vérification SSH d’un serveur' },
  { id: 'statuses', title: 'Statuts' },
  { id: 'check-rules', title: 'Règles de vérification' },
  { id: 'notifications', title: 'Notifications' },
  { id: 'channels', title: 'Configurer les canaux' },
  { id: 'dns', title: 'Zone DNS OVH' },
  { id: 'security', title: 'Secrets et sécurité' },
  { id: 'faq', title: 'Dépannage' },
];

export function Content() {
  return (
    <>
      <h2 id="start">Premiers pas</h2>
      <ol>
        <li>
          <strong>Créez un projet</strong> (administrateurs) depuis <em>Projets → Nouveau projet</em>. Un projet regroupe des services liés,
          par exemple « Production », « Home lab » ou le nom d’un client.
        </li>
        <li>
          <strong>Ajoutez un canal de notification</strong> dans l’onglet <em>Notifications</em> du projet (Discord, e-mail, Telegram…) et
          cliquez sur <em>Tester</em> pour vérifier la réception.
        </li>
        <li>
          <strong>Ajoutez une règle de notification</strong> qui envoie les événements « Tombe en panne » et « Est rétabli » vers ce canal.
          Les règles du projet s’appliquent à tous ses moniteurs.
        </li>
        <li>
          <strong>Ajoutez des moniteurs</strong> avec <em>Ajouter un moniteur</em>. La première vérification a lieu en quelques secondes.
        </li>
        <li>
          <strong>Invitez votre équipe</strong> depuis <em>Utilisateurs</em> et donnez-lui accès aux bons projets.
        </li>
      </ol>

      <h2 id="concepts">Notions clés</h2>
      <ul>
        <li>
          <strong>Projet</strong> : regroupe des moniteurs, des canaux de notification, des règles de notification et des membres. Chaque
          moniteur appartient à un seul projet : il n’existe pas de moniteur sans projet.
        </li>
        <li>
          <strong>Moniteur</strong> : un service à vérifier (une URL, un port, un hôte…), avec son type de vérification, sa cible, ses règles
          de vérification et, si besoin, ses propres règles de notification.
        </li>
        <li>
          <strong>Vérification</strong> : un test ponctuel d’un moniteur. Les résultats sont conservés pendant la durée de rétention (30 jours
          par défaut) et alimentent les pourcentages de disponibilité et les graphiques.
        </li>
        <li>
          <strong>Incident</strong> : ouvert quand un moniteur passe HORS SERVICE, clos quand il est rétabli.
        </li>
        <li>
          <strong>Canal</strong> : une destination pour les alertes (un webhook Discord, une liste d’adresses e-mail…). Les canaux
          appartiennent à un projet.
        </li>
        <li>
          <strong>Règle</strong> : décide <em>quels événements</em> sont envoyés <em>à quels canaux</em>, et <em>quand</em>.
        </li>
      </ul>

      <h2 id="roles">Utilisateurs et rôles</h2>
      <table>
        <thead>
          <tr>
            <th>Rôle</th>
            <th>Ce qu’il peut faire</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <strong>Super-administrateur</strong>
            </td>
            <td>Un seul. Accès complet, et seule personne à pouvoir créer ou gérer des administrateurs. Ne peut être ni supprimé ni rétrogradé.</td>
          </tr>
          <tr>
            <td>
              <strong>Administrateur</strong>
            </td>
            <td>Accès complet à tous les projets. Crée les projets, gère les utilisateurs de rôle « utilisateur » et les membres des projets.</td>
          </tr>
          <tr>
            <td>
              <strong>Utilisateur · éditeur</strong>
            </td>
            <td>Ne voit que les projets qui lui sont attribués. Peut y créer, modifier et supprimer des moniteurs, des canaux et des règles.</td>
          </tr>
          <tr>
            <td>
              <strong>Utilisateur · lecteur</strong>
            </td>
            <td>Accès en lecture seule aux projets attribués.</td>
          </tr>
        </tbody>
      </table>
      <p>Un utilisateur peut être rattaché à autant de projets que nécessaire, avec un niveau d’accès (lecteur / éditeur) différent dans chacun.</p>

      <h2 id="monitors">Types de moniteurs</h2>
      <h3>HTTP(S)</h3>
      <p>
        Envoie une requête et compare le <strong>code de statut</strong> à la liste acceptée (par ex. <code>200-299,301</code>). Options :
      </p>
      <ul>
        <li>
          <strong>Authentification</strong> : Basic auth, jeton Bearer ou en-tête personnalisé comme <code>X-API-Key</code>. Les identifiants
          sont stockés chiffrés et ne sont jamais envoyés à un autre domaine lors du suivi des redirections.
        </li>
        <li>
          <strong>Mot-clé</strong> : exige (ou interdit) un texte dans le corps de la réponse, pratique pour détecter les pages d’erreur qui
          renvoient 200.
        </li>
        <li>
          <strong>Expiration du certificat</strong> : les moniteurs HTTPS suivent aussi le certificat TLS et peuvent émettre un événement
          « Certificat bientôt expiré ».
        </li>
      </ul>
      <h3>Port TCP</h3>
      <p>Ouvre une connexion TCP (bases de données, serveurs de messagerie, serveurs de jeu…). Le test réussit si le port accepte la connexion.</p>
      <h3>Ping (ICMP)</h3>
      <p>Le ping classique. Le temps de réponse est la moyenne des allers-retours des paquets envoyés.</p>
      <h3>SSH</h3>
      <p>
        S’authentifie par mot de passe ou clé privée, puis exécute éventuellement une commande (par exemple{' '}
        <code>systemctl is-active nginx</code>). La vérification échoue si la commande se termine avec un code non nul ou si la sortie
        attendue est absente. Renseignez l’<strong>empreinte de la clé d’hôte</strong> (<code>ssh-keyscan host | ssh-keygen -lf -</code>)
        pour vous protéger des attaques de l’homme du milieu. Les premières lignes de la sortie de la commande s’affichent dans le tableau de
        bord et les alertes. Voir{' '}
        <a href="#ssh" className="font-medium text-brand-600 hover:underline dark:text-brand-400">
          Vérification SSH d’un serveur
        </a>{' '}
        pour la configuration recommandée (utilisateur dédié, clé restreinte, script de contrôle).
      </p>
      <h3>DNS</h3>
      <p>Résout un enregistrement (A, AAAA, CNAME, MX, TXT, NS), éventuellement auprès d’un résolveur précis, et peut vérifier la valeur attendue.</p>
      <h3>Certificat TLS</h3>
      <p>Se connecte à un point d’accès TLS et passe HORS SERVICE si le certificat est invalide ou expire dans le nombre de jours configuré.</p>

      <h2 id="ssh">Vérification SSH d’un serveur</h2>
      <p>
        Pour vérifier qu’un serveur est joignable, un moniteur SSH avec <em>Authentification : Aucune (vérification de la bannière)</em>{' '}
        suffit : il ne demande ni compte ni clé. Pour vérifier son <strong>état de santé</strong> (disque, mémoire, services), utilisez un{' '}
        <strong>compte dédié, sans privilèges</strong>, qui se connecte avec une clé limitée à <strong>un seul script en lecture seule</strong>
        . Même si la clé fuitait, elle ne permettrait rien d’autre.
      </p>
      <h3>1. Créer un utilisateur dédié (sur le serveur)</h3>
      <pre>
        <code>{'sudo useradd --system --create-home --shell /bin/sh uptime-monitor'}</code>
      </pre>
      <ul>
        <li>
          Pas de <code>sudo</code>, et <strong>ne l’ajoutez jamais au groupe <code>docker</code></strong> (équivalent à root).
        </li>
        <li>
          Il lui faut un vrai shell (<code>/bin/sh</code>) : avec <code>nologin</code>, le serveur ne peut pas exécuter la commande de
          vérification.
        </li>
      </ul>
      <h3>2. Générer une clé pour le moniteur (sur votre ordinateur)</h3>
      <pre>
        <code>{'ssh-keygen -t ed25519 -N "" -C "uptime-monitor" -f ./uptime-monitor'}</code>
      </pre>
      <p>
        Collez la clé privée (fichier <code>uptime-monitor</code>) dans le champ <em>Clé privée</em> du moniteur. Elle est chiffrée et n’est
        plus jamais affichée : supprimez ensuite le fichier local. Une phrase de passe n’apporte pas grand-chose, puisqu’elle serait stockée à
        côté de la clé.
      </p>
      <h3>3. Limiter la clé à un seul script</h3>
      <p>
        Mettez une seule ligne dans <code>/home/uptime-monitor/.ssh/authorized_keys</code> :
      </p>
      <pre>
        <code>{'restrict,command="/usr/local/bin/uptime-check",from="203.0.113.10" ssh-ed25519 AAAA… uptime-monitor'}</code>
      </pre>
      <ul>
        <li>
          <code>restrict</code> désactive le shell interactif et les redirections de ports, d’agent et X11.
        </li>
        <li>
          <code>command=</code> impose le script, quelle que soit la commande envoyée par le client.
        </li>
        <li>
          <code>from=</code> n’accepte la clé que depuis l’IP publique du serveur qui fait tourner Uptime Monitor.
        </li>
      </ul>
      <pre>
        <code>
          {'sudo chown -R uptime-monitor: /home/uptime-monitor/.ssh\nsudo chmod 700 /home/uptime-monitor/.ssh\nsudo chmod 600 /home/uptime-monitor/.ssh/authorized_keys'}
        </code>
      </pre>
      <h3>4. Le script de contrôle</h3>
      <p>
        Il se contente de lire l’état du système, affiche <code>OK …</code> et se termine avec <code>0</code> si tout va bien, ou affiche une
        ligne <code>FAIL: …</code> par problème et se termine avec <code>1</code>. Le moniteur affiche les premières lignes de la sortie dans
        le tableau de bord et dans les alertes, par ex. <em>« Command exited with code 1: FAIL: disk / at 93% »</em>.
      </p>
      <pre>
        <code>
          {
            "#!/bin/sh\n# /usr/local/bin/uptime-check — contrôle de santé en lecture seule pour Uptime Monitor\nset -u\nstatus=0\nfail() { echo \"FAIL: $*\"; status=1; }\n\n# Disque : / au-delà de 90 %\nuse=$(df -P / | awk 'NR==2 {gsub(\"%\",\"\",$5); print $5}')\n[ \"$use\" -lt 90 ] || fail \"disk / at ${use}%\"\n\n# Mémoire : moins de 10 % disponible\navail=$(awk '/MemAvailable/ {a=$2} /MemTotal/ {t=$2} END {print int(a*100/t)}' /proc/meminfo)\n[ \"$avail\" -ge 10 ] || fail \"memory available ${avail}%\"\n\n# Charge : moyenne sur 1 minute au-delà de 2 × le nombre de CPU\nload=$(cut -d' ' -f1 /proc/loadavg); cpus=$(nproc)\nawk -v l=\"$load\" -v c=\"$cpus\" 'BEGIN { exit !(l > c * 2) }' && fail \"load ${load} (${cpus} CPUs)\"\n\n# Services qui doivent tourner (adaptez la liste)\nfor svc in docker nginx; do\n  systemctl is-active --quiet \"$svc\" || fail \"service ${svc} is not active\"\ndone\n\n[ \"$status\" -eq 0 ] && echo \"OK disk=${use}% mem_avail=${avail}% load=${load}\"\nexit \"$status\""
          }
        </code>
      </pre>
      <pre>
        <code>{'sudo install -o root -g root -m 755 uptime-check /usr/local/bin/uptime-check'}</code>
      </pre>
      <p>Le script appartient à root : le compte de supervision ne peut pas le modifier.</p>
      <h3>5. Épingler la clé d’hôte du serveur</h3>
      <pre>
        <code>{'ssh-keyscan -t ed25519 your-server.example.com 2>/dev/null | ssh-keygen -lf -\n# 256 SHA256:AbCdEf… your-server.example.com (ED25519)'}</code>
      </pre>
      <p>
        Copiez la valeur <code>SHA256:…</code> dans <em>Empreinte de la clé d’hôte</em> : le moniteur refusera un serveur qui usurperait le
        vôtre. Si la vérification signale « Host key fingerprint mismatch », le serveur a présenté un autre type de clé : relancez la commande
        avec <code>-t ecdsa</code>.
      </p>
      <h3>6. Créer le moniteur</h3>
      <table>
        <tbody>
          <tr>
            <td>Type</td>
            <td>
              <strong>SSH</strong>
            </td>
          </tr>
          <tr>
            <td>Nom d’utilisateur</td>
            <td>
              <code>uptime-monitor</code>
            </td>
          </tr>
          <tr>
            <td>Authentification</td>
            <td>Clé privée</td>
          </tr>
          <tr>
            <td>Empreinte de la clé d’hôte</td>
            <td>
              La valeur <code>SHA256:…</code> de l’étape 5
            </td>
          </tr>
          <tr>
            <td>Commande</td>
            <td>
              N’importe quelle valeur, par ex. <code>check</code> (le script est imposé)
            </td>
          </tr>
          <tr>
            <td>La sortie attendue contient</td>
            <td>
              <code>OK</code> (facultatif, le code de sortie suffit)
            </td>
          </tr>
          <tr>
            <td>Intervalle de vérification</td>
            <td>5 minutes (chaque vérification est une connexion dans le journal d’authentification du serveur), 1 à 2 minutes pour les serveurs critiques</td>
          </tr>
          <tr>
            <td>Tentatives</td>
            <td>1</td>
          </tr>
        </tbody>
      </table>
      <h3>7. Côté serveur</h3>
      <ul>
        <li>
          <strong>fail2ban</strong> : ajoutez l’IP du moniteur à <code>ignoreip</code>, pour qu’une erreur de configuration ne la fasse pas
          bannir.
        </li>
        <li>
          <strong>Pare-feu</strong> : autorisez le port 22 depuis l’IP du moniteur si l’accès est restreint.
        </li>
        <li>
          <strong>
            <code>AllowUsers</code>
          </strong>{' '}
          dans <code>sshd_config</code> : ajoutez <code>uptime-monitor</code> si vous l’utilisez.
        </li>
        <li>
          Testez avant de créer le moniteur. Cette commande doit afficher <code>OK …</code> puis se déconnecter :
        </li>
      </ul>
      <pre>
        <code>{'ssh -i ./uptime-monitor uptime-monitor@your-server.example.com'}</code>
      </pre>

      <h2 id="statuses">Statuts</h2>
      <table>
        <tbody>
          <tr>
            <td>🟢 En service</td>
            <td>La dernière vérification a réussi.</td>
          </tr>
          <tr>
            <td>🟠 Dégradé</td>
            <td>La vérification a réussi, mais le temps de réponse a dépassé le seuil « Dégradé au-delà de ».</td>
          </tr>
          <tr>
            <td>🔴 Hors service</td>
            <td>La vérification a échoué plus de fois d’affilée que le nombre de tentatives autorisé.</td>
          </tr>
          <tr>
            <td>🔵 En attente</td>
            <td>Pas encore vérifié, ou en échec mais encore dans ses tentatives.</td>
          </tr>
          <tr>
            <td>⚪ En pause</td>
            <td>Les vérifications sont suspendues et aucune alerte n’est envoyée.</td>
          </tr>
        </tbody>
      </table>

      <h2 id="check-rules">Règles de vérification</h2>
      <p>Les règles de vérification déterminent comment un moniteur est testé. Elles suivent un héritage à trois niveaux :</p>
      <p>
        <strong>Réglage du moniteur</strong> → <strong>Valeur par défaut du projet</strong> → <strong>Valeur par défaut globale</strong>
      </p>
      <p>Laissez un champ vide pour hériter. L’exemple grisé affiche la valeur héritée.</p>
      <table>
        <thead>
          <tr>
            <th>Réglage</th>
            <th>Signification</th>
            <th>Défaut global</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Intervalle de vérification</td>
            <td>Temps entre deux vérifications (20 s minimum).</td>
            <td>60 s</td>
          </tr>
          <tr>
            <td>Délai d’expiration</td>
            <td>Une vérification plus lente échoue.</td>
            <td>10 s</td>
          </tr>
          <tr>
            <td>Tentatives</td>
            <td>Échecs consécutifs tolérés avant de passer HORS SERVICE. Évite les alertes sur un simple aléa réseau.</td>
            <td>0</td>
          </tr>
          <tr>
            <td>Intervalle entre tentatives</td>
            <td>Délai entre deux vérifications pendant les tentatives.</td>
            <td>30 s</td>
          </tr>
          <tr>
            <td>Dégradé au-delà de</td>
            <td>Temps de réponse (ms) au-delà duquel une vérification réussie est considérée comme DÉGRADÉE.</td>
            <td>désactivé</td>
          </tr>
        </tbody>
      </table>

      <h2 id="notifications">Notifications</h2>
      <p>
        Une <strong>règle</strong> relie des <strong>événements</strong> à des <strong>canaux</strong>. Les règles ont une{' '}
        <strong>portée</strong> :
      </p>
      <ul>
        <li>
          <strong>Règles du projet</strong> (projet → onglet Notifications) : s’appliquent à tous les moniteurs du projet.
        </li>
        <li>
          <strong>Règles du moniteur</strong> (moniteur → onglet Notifications) : s’appliquent à ce moniteur uniquement, en plus des règles du
          projet.
        </li>
        <li>
          Désactivez <em>Utiliser les règles de notification du projet</em> sur un moniteur pour n’appliquer <strong>que</strong> ses propres
          règles, par ex. pour envoyer un service de préproduction bruyant vers un autre canal.
        </li>
      </ul>
      <h3>Événements</h3>
      <ul>
        <li>
          <strong>Tombe en panne</strong> : le moniteur est confirmé HORS SERVICE.
        </li>
        <li>
          <strong>Est rétabli</strong> : le moniteur fonctionne de nouveau. Envoyé uniquement si la règle a signalé la panne.
        </li>
        <li>
          <strong>Devient dégradé</strong> : le temps de réponse a dépassé le seuil de dégradation.
        </li>
        <li>
          <strong>Certificat bientôt expiré</strong> : le certificat TLS expire dans le nombre de jours configuré (au plus une fois par jour).
        </li>
      </ul>
      <h3>Réglages fins</h3>
      <ul>
        <li>
          <strong>Seuil d’échecs</strong> : nombre de vérifications HORS SERVICE consécutives avant que la règle se déclenche. Utilisez 1 pour
          les services critiques et 3 ou plus pour les services instables. Combiné aux tentatives, il permet d’envoyer le « premier
          avertissement » et le « toujours en panne » vers des canaux différents.
        </li>
        <li>
          <strong>Rappel</strong> : renvoie l’alerte de panne toutes les N minutes tant qu’elle dure.
        </li>
      </ul>
      <p>Si plusieurs règles visent le même canal pour le même événement, un seul message est envoyé.</p>

      <h2 id="channels">Configurer les canaux</h2>
      <table>
        <thead>
          <tr>
            <th>Canal</th>
            <th>Configuration</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>E-mail</td>
            <td>
              L’administrateur du serveur définit <code>SMTP_HOST</code>, <code>SMTP_PORT</code>, <code>SMTP_USER</code>,{' '}
              <code>SMTP_PASSWORD</code>, <code>SMTP_FROM</code>. Ajoutez ensuite les destinataires, séparés par des virgules.
            </td>
          </tr>
          <tr>
            <td>Discord</td>
            <td>Paramètres du salon → Intégrations → Webhooks → Nouveau webhook → Copier l’URL.</td>
          </tr>
          <tr>
            <td>Slack</td>
            <td>Créez une application avec « Incoming Webhooks » activé et copiez l’URL du webhook.</td>
          </tr>
          <tr>
            <td>Telegram</td>
            <td>
              Parlez à <code>@BotFather</code> pour créer un bot et obtenir son jeton. Envoyez un message au bot (ou ajoutez-le à un groupe),
              puis ouvrez <code>https://api.telegram.org/bot&lt;token&gt;/getUpdates</code> pour trouver l’identifiant de la conversation.
            </td>
          </tr>
          <tr>
            <td>Signal</td>
            <td>
              Lancez le conteneur gratuit <code>bbernhard/signal-cli-rest-api</code>, associez-le à un numéro Signal, puis saisissez son URL,
              le numéro d’envoi et les destinataires (numéros de téléphone ou identifiants de groupe).
            </td>
          </tr>
          <tr>
            <td>ntfy</td>
            <td>
              Choisissez un nom de sujet difficile à deviner sur <code>https://ntfy.sh</code> (ou votre propre serveur) et abonnez-vous-y dans
              l’application mobile ntfy.
            </td>
          </tr>
          <tr>
            <td>Gotify</td>
            <td>Créez une application dans Gotify et collez son jeton.</td>
          </tr>
          <tr>
            <td>Webhook</td>
            <td>Reçoit un <code>POST</code> JSON avec les champs event, title, text, monitor, project et url.</td>
          </tr>
        </tbody>
      </table>
      <p>
        <strong>WhatsApp</strong> n’est pas pris en charge : il n’existe pas d’API officielle gratuite, et les passerelles non officielles
        enfreignent les conditions d’utilisation de WhatsApp. Utilisez plutôt Signal ou Telegram.
      </p>

      <h2 id="dns">Zone DNS OVH</h2>
      <p>
        Connectez un compte OVHcloud à un projet pour comparer <strong>une zone DNS</strong> avec les moniteurs du projet. La page dédiée{' '}
        <em>Zone DNS</em> liste chaque hôte de la zone (enregistrements A, AAAA et CNAME) et indique s’il est :
      </p>
      <ul>
        <li>
          <strong>En service</strong> : au moins un moniteur cible l’hôte et tout fonctionne, selon les règles de vérification de ces
          moniteurs (les hôtes dégradés comptent comme en service mais sont signalés).
        </li>
        <li>
          <strong>En erreur</strong> : l’un de ses moniteurs est HORS SERVICE.
        </li>
        <li>
          <strong>Non surveillé</strong> : l’enregistrement existe, mais aucun moniteur du projet ne le cible. Les éditeurs peuvent cliquer sur{' '}
          <em>Le surveiller</em> pour créer un moniteur HTTPS.
        </li>
      </ul>
      <p>
        Un moniteur est rattaché à un hôte quand le nom d’hôte de sa cible correspond exactement : l’hôte de l’URL pour les moniteurs HTTP, le
        nom d’hôte pour les moniteurs DNS, l’hôte pour les moniteurs TCP, ping, SSH et TLS. Un enregistrement générique comme{' '}
        <code>*.apps.example.com</code> regroupe les moniteurs des hôtes qu’il résout (<code>shop.apps.example.com</code>). Les moniteurs
        qui ciblent un hôte de la zone sans enregistrement apparaissent sous <em>Hôtes surveillés sans enregistrement DNS</em>.
      </p>
      <h3>Connecter un compte (administrateurs)</h3>
      <ol>
        <li>
          Ouvrez la page de création de jetons OVH de votre région (lien dans le formulaire des paramètres) et créez des identifiants avec les
          droits <strong>GET</strong> sur <code>/domain/zone</code> et <code>/domain/zone/*</code>. Des identifiants en lecture seule
          suffisent : n’accordez jamais de droits d’écriture.
        </li>
        <li>
          Dans <em>Projet → Paramètres → Zone DNS OVH</em>, saisissez le point d’accès, la clé d’application, le secret d’application et la clé
          consommateur, cliquez sur <em>Charger mes domaines</em>, choisissez le domaine et enregistrez.
        </li>
      </ol>
      <p>
        La zone est mise en cache et actualisée automatiquement quand elle a plus de 15 minutes, ou à la demande avec{' '}
        <em>Actualiser depuis OVH</em>. Les états des hôtes sont toujours en temps réel. Le secret d’application et la clé consommateur sont
        chiffrés comme tous les autres secrets et ne sont plus jamais affichés.
      </p>

      <h2 id="security">Secrets et sécurité</h2>
      <ul>
        <li>
          Les mots de passe, jetons, clés privées et URL de webhook sont <strong>chiffrés au repos</strong> (AES-256-GCM) avec le{' '}
          <code>APP_SECRET</code> du serveur.
        </li>
        <li>
          Les secrets sont en <strong>écriture seule</strong> : une fois enregistrés, l’API ne les renvoie jamais, même aux administrateurs. Le
          formulaire affiche « Stocké chiffré » avec les actions <em>Remplacer</em> / <em>Supprimer</em>.
        </li>
        <li>Les valeurs secrètes sont automatiquement masquées si elles apparaissent dans un message d’erreur.</li>
        <li>
          Les mots de passe des utilisateurs sont hachés avec scrypt. Les sessions utilisent des cookies sécurisés, HTTP-only et
          SameSite=Strict, révoqués quand le mot de passe, le rôle ou le statut du compte change.
        </li>
        <li>
          Les tentatives de connexion sont limitées, et les actions sensibles sont consignées dans le journal d’audit (Utilisateurs → Journal
          d’audit).
        </li>
        <li>Préférez des identifiants dédiés et en lecture seule pour la supervision (une clé d’API de contrôle de santé, un utilisateur SSH restreint…).</li>
      </ul>

      <h2 id="faq">Dépannage</h2>
      <h3>Le ping échoue toujours</h3>
      <p>Certains hôtes ou pare-feu bloquent l’ICMP. Utilisez plutôt un moniteur TCP ou HTTP.</p>
      <h3>Je n’ai reçu aucune notification</h3>
      <ul>
        <li>Utilisez le bouton <em>Tester</em> du canal pour vérifier la réception.</li>
        <li>Vérifiez qu’une règle inclut l’événement et le canal, et que les deux sont activés.</li>
        <li>Vérifiez le seuil d’échecs : avec un seuil de 3 et un intervalle de 60 s, la première alerte arrive après environ 3 minutes.</li>
        <li>« Est rétabli » n’est envoyé qu’après une notification « Tombe en panne » de la même règle.</li>
      </ul>
      <h3>« Unable to decrypt secrets »</h3>
      <p>
        Le <code>APP_SECRET</code> du serveur a changé. Restaurez l’ancienne valeur, ou ressaisissez les secrets des moniteurs et canaux
        concernés.
      </p>
    </>
  );
}
