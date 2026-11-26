# Nohriancons

Hub privé du groupe : jeux en cours, parties, choix du jeu, panel serveur et statut.
« Eye » est le nom de code du projet.

## Ce que fait le hub

| Page | Contenu |
| --- | --- |
| **Accueil** | Raccourcis vers chaque partie du hub. |
| **Jeux › Liste des jeux en cours** | Les jeux de la bande, empilés par série, avec statut et joueurs. Ajout par lien Steam ou recherche IGDB. |
| **Jeux › Parties** | Parties au tour par tour : avancement, gagnant, journal des sessions, prochaine session annoncée sur Discord. |
| **Jeux › Quoi faire ?** | Jeux Steam en commun entre les présents, onglet « Presque », envies et roue pondérée. |
| **Fichiers** | Jeux et projets avec leurs fichiers à installer (applis, mods, configs, liens), filtrés par plateforme, et leurs étapes d'installation. Réservé aux membres. |
| **Panel** | Serveurs Sakura Panel (Pelican) : état, démarrer, arrêter, redémarrer, journal des actions. |
| **Status** | État des services suivis par Uptime Kuma. |
| **Compte** | Profil Authentik, photo, liaison Steam, clé Sakura Panel. Les admins y voient la liste des membres. |

Chaque membre utilise **sa propre clé API Pelican** (chiffrée en base) : le hub ne peut faire que ce que Pelican lui autorise.
C'est donc toujours dans Pelican que se donnent les permissions sur les serveurs.

## Technique

- SvelteKit 3 (Svelte 5), adapter Node, Tailwind 4 et le design system Nohriancons (`src/lib/styles/nohriancons.css`).
- SQLite (better-sqlite3 + Drizzle). Les migrations du dossier `drizzle/` s'appliquent au démarrage.
- Connexion OpenID Connect avec Authentik, par [Better Auth](https://www.better-auth.com/) (plugin OAuth générique, PKCE). La table `membres` sert de table des utilisateurs de Better Auth.
- Les imports internes passent par `#lib/…` (sous-chemins Node, `$lib` n'existe plus avec Kit 3).

## Développer

Node 22 ou plus. npm 10 plante sur cet arbre de dépendances, il faut npm 11 :

```sh
npx -y npm@11.6.2 install
cp .env.example .env     # puis remplir au moins HUB_ENCRYPTION_KEY
openssl rand -base64 32  # valeur pour HUB_ENCRYPTION_KEY
npm run dev
```

Sans Authentik, mets `DEV_LOGIN=1` dans `.env` : la page de connexion propose alors une connexion de test.
Elle ne marche qu'avec `npm run dev`, jamais avec le build de production.

```sh
npm run check   # types et composants Svelte
npm test        # tests (vitest)
npm run build   # build de production dans build/
npm run db:generate  # après une modification de src/lib/server/db/schema.ts
```

### Polices

Avenir Next est sous licence commerciale : les fichiers ne sont pas dans le dépôt (il est public).
Dépose-les dans `static/fonts/` avant de construire. Noms attendus :
`AvenirNextLTPro-Regular.otf`, `AvenirNextLTPro-It.otf`, `AvenirNextLTPro-Demi.otf`, `AvenirNextLTPro-Bold.otf`,
`AvenirNext-Regular.otf`, `AvenirNext-Medium.otf`, `AvenirNext-Bold.otf`.
Sans eux, le hub s'affiche avec Nunito Sans.

## Configuration

Tout passe par des variables d'environnement, décrites dans [`.env.example`](.env.example). Aucun secret dans le code.

| Variable | Rôle |
| --- | --- |
| `ORIGIN` | Adresse publique du hub, par exemple `https://hub.exemple.fr`. Sert d'adresse de retour pour Authentik. |
| `HUB_ENCRYPTION_KEY` | 32 octets en base64. Chiffre les clés Pelican. Si elle change, chacun devra recoller sa clé (et se reconnecter). |
| `BETTER_AUTH_SECRET` | Facultatif. Signe les cookies de connexion. Sans lui, il est dérivé de `HUB_ENCRYPTION_KEY`. |
| `DATABASE_PATH` | Fichier SQLite (`/data/hub.db` dans Docker). |
| `AUTHENTIK_ISSUER`, `AUTHENTIK_CLIENT_ID`, `AUTHENTIK_CLIENT_SECRET` | Fournisseur OpenID d'Authentik. |
| `AUTHENTIK_MEMBER_GROUP`, `AUTHENTIK_ADMIN_GROUP` | Groupes qui donnent accès au hub (par défaut `hub-membres` et `hub-admins`). |
| `AUTHENTIK_FILES_GROUP` | Groupe qui peut créer des projets et déposer des fichiers (par défaut `hub.files`). Les admins le peuvent toujours. |
| `FICHIERS_PATH`, `FICHIERS_TAILLE_MAX` | Facultatives. Dossier des fichiers envoyés (par défaut `/data/fichiers` dans Docker) et taille maximale d'un fichier (par défaut `2G`). |
| `STEAM_API_KEY` | Clé Steam Web API, pour les bibliothèques. |
| `IGDB_CLIENT_ID`, `IGDB_CLIENT_SECRET` | Facultatif. Application Twitch pour chercher les jeux sur IGDB (titre, série, image). |
| `TMDB_API_KEY` | Clé TMDB (v3) ou jeton de lecture (v4), pour chercher les films et séries (Ma watchlist et Watch list commune). |
| `PELICAN_URL` | Adresse de Sakura Panel. `PELICAN_API_KEYS_URL` et `PELICAN_SERVER_URL_TEMPLATE` sont facultatives. |
| `KUMA_URL`, `KUMA_STATUS_SLUG` | Page de statut publique d'Uptime Kuma. |
| `DISCORD_WEBHOOK_URL` | Facultatif. Webhook du salon Discord où le hub annonce un serveur démarré et ce qui est prévu le lendemain. |
| `HEURE_SYNCHRO_STEAM`, `HEURE_ANNONCES` | Facultatives. Heures (de Paris) des tâches automatiques : 5 h et 18 h par défaut. `TACHES=0` les coupe. |
| `PLANNING_URL` | Lien « Planning » du menu (par défaut https://calendar.la-sikaverne.fr/, « aucun » le masque). |

### Authentik

1. **Applications › Fournisseurs › Créer › OAuth2/OpenID** :
   type de client *Confidentiel*, URI de redirection `https://hub.exemple.fr/auth/callback` (ton `ORIGIN` + `/auth/callback` ; le hub la transmet à Better Auth),
   portées `openid`, `profile` et `email`. La portée `profile` par défaut d'Authentik envoie déjà les groupes (`groups`).
2. **Applications › Créer** : nom « Nohriancons », slug `hub`, avec ce fournisseur.
   L'issuer à mettre dans `AUTHENTIK_ISSUER` est affiché sur la page du fournisseur (`…/application/o/hub/`).
3. Crée les groupes `hub-membres` et `hub-admins` et ajoute-y les membres. Sans l'un des deux, la connexion est refusée.

Le pseudo, le nom, l'e-mail et le rôle viennent d'Authentik à chaque connexion ; la page Compte renvoie vers Authentik pour les modifier.
Un compte sorti des deux groupes ne peut plus se connecter ; ses sessions ouvertes expirent au bout de 30 jours au plus.

Pour « Fichiers & applis », crée aussi le groupe `hub.files` (ou celui de `AUTHENTIK_FILES_GROUP`) : ses membres peuvent créer des projets
et déposer des fichiers. Le droit est lu à la connexion : après un ajout au groupe, il faut se déconnecter puis se reconnecter au hub.

### Sakura Panel (Pelican)

Chaque membre crée une clé API client dans Pelican (*Profil › Clés API*, `/profile?tab=api-keys`) et la colle dans sa page Compte.
Le hub vérifie la clé auprès de Pelican avant de l'enregistrer, puis la garde chiffrée.
Les liens « Ouvrir dans Sakura Panel » utilisent l'identifiant court du serveur (`/server/<id court>`).
Les admins peuvent, depuis le Panel, relier un serveur à un jeu de la liste et régler l'adresse affichée et la sonde de joueurs (GameDig).

### IGDB

Dans la fenêtre « Ajouter un jeu », une recherche IGDB remplit le titre exact, la série et l'image (illustration large si IGDB en a une, sinon la jaquette). Tout reste modifiable à la main.

1. Sur https://dev.twitch.tv/console/apps, crée une application (URL de redirection `http://localhost`, catégorie « Application Integration », client « Confidentiel »).
2. Reporte son Client ID dans `IGDB_CLIENT_ID` et un nouveau secret dans `IGDB_CLIENT_SECRET`.

Sans ces deux valeurs, la recherche n'apparaît pas et les jeux se saisissent à la main.

### TMDB (films et séries)

Ma watchlist et la Watch list commune cherchent les films et les séries sur TMDB (titre français, affiche, saisons et épisodes). Les fiches sont gardées dans la base et relues au plus une fois par semaine.

1. Crée un compte gratuit sur https://www.themoviedb.org, puis va dans *Paramètres › API* et demande une clé (usage personnel).
2. Colle la « clé d'API » ou le « jeton d'accès en lecture » dans `TMDB_API_KEY`.

Sans clé, les pages s'ouvrent mais la fenêtre « Ajouter un titre » ne peut rien chercher.

### Discord et tâches automatiques

Le hub lance seul deux tâches, à l'heure de Paris :

- **chaque nuit** (`HEURE_SYNCHRO_STEAM`, 5 h) : il relit les bibliothèques Steam de tous les membres liés, comme le bouton « Actualiser » de Quoi faire ? ;
- **chaque jour** (`HEURE_ANNONCES`, 18 h) : il annonce sur Discord les soirées de la Watch list commune et les sessions de parties prévues le lendemain.

Chaque tâche tourne une fois par jour ; si le hub était arrêté à l'heure prévue, elle tourne à son redémarrage. Il annonce aussi
sur Discord un serveur démarré depuis la page Panel (sans son adresse). Les annonces ne citent que les prénoms et ne mentionnent personne.

Pour les annonces, crée un webhook dans le salon voulu (*Paramètres du salon › Intégrations › Webhooks*) et colle son adresse dans
`DISCORD_WEBHOOK_URL`. La page Compte des admins montre le dernier passage de chaque tâche et un bouton « Envoyer un test ».

La prochaine session d'une partie se règle dans « Modifier la partie » ; elle s'efface quand la session est ajoutée au journal.

### Uptime Kuma

Crée une page de statut publique dans Kuma, puis mets son adresse dans `KUMA_URL` et son identifiant (slug) dans `KUMA_STATUS_SLUG`.
Le hub lit l'API publique de cette page, toutes les 30 secondes au plus.

## Déployer sur le VPS (Docker Compose)

```sh
git clone https://github.com/clementino29/project-eye.git && cd project-eye
cp .env.example .env   # remplir les valeurs
# déposer les polices dans static/fonts/
docker compose up -d --build
```

- Le hub écoute sur `127.0.0.1:3000` (réglable avec `HUB_PORT`). Il faut un reverse proxy HTTPS devant.
- **Si Apache sert déjà Pelican** (ports 80 et 443 occupés), ajoute-lui un site pour le hub qui renvoie vers `127.0.0.1:3000`,
  sans activer le profil Caddy. Exemple pour apache2 (modules `proxy`, `proxy_http`, `headers` et `ssl` activés,
  certificat par exemple avec `certbot --apache`) :

  ```apache
  <VirtualHost *:443>
      ServerName hub.exemple.fr
      SSLEngine on
      # SSLCertificateFile / SSLCertificateKeyFile : ajoutés par certbot

      ProxyPreserveHost On
      ProxyPass / http://127.0.0.1:3000/
      ProxyPassReverse / http://127.0.0.1:3000/
      RequestHeader set X-Forwarded-Proto "https"
  </VirtualHost>
  ```

  Pour les gros fichiers de « Fichiers & applis » (2 Go par défaut), ajoute aussi dans ce `VirtualHost` :

  ```apache
      # Apache refuse par défaut les envois de plus de 1 Go, et coupe les requêtes longues.
      LimitRequestBody 0
      ProxyTimeout 1800
  ```

  `ProxyPreserveHost` et `X-Forwarded-Proto` sont nécessaires : sans eux, les formulaires du hub sont refusés (protection CSRF).
  Le même principe vaut pour nginx (`proxy_set_header Host $host;` et `proxy_set_header X-Forwarded-Proto $scheme;`).
- **Si rien n'occupe les ports 80 et 443**, Caddy est fourni : renseigne `HUB_DOMAINE` puis
  `docker compose --profile caddy up -d --build`. Le certificat HTTPS est automatique.
- La base est dans le volume Docker `hub-data`. Le service `sauvegarde` en fait une copie chaque jour
  (`HEURE_SAUVEGARDE`, 4 h par défaut) dans `./sauvegardes`, compressée et gardée `JOURS_A_GARDER` jours (14 par défaut).
  Pour une copie tout de suite : `docker compose exec sauvegarde sauvegarde.sh`.
- Les fichiers envoyés dans « Fichiers & applis » sont dans le même volume (`/data/fichiers`), mais pas dans la copie quotidienne,
  qui ne garde que la base : ils peuvent peser plusieurs Go. Pour les copier : `docker compose cp hub:/data/fichiers ./fichiers-copie`.
- Pour restaurer : arrêter le hub, décompresser la copie et la placer à la place de `/data/hub.db` dans le volume.
- Mise à jour : `git pull && docker compose up -d --build`. Les migrations s'appliquent au démarrage.
  Avant d'en appliquer, le hub copie la base à côté d'elle (`/data/hub.db.avant-migration-<n>.bak` dans le volume).
- `GET /sante` répond `ok` quand le hub tourne (utilisé par le healthcheck et utilisable dans Uptime Kuma).
