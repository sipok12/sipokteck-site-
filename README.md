# SIPOKTECK — Portfolio full-stack

Portfolio responsive de Jean-Paul AHITE avec frontend HTML/CSS/JavaScript, API Node.js/Express, base PostgreSQL (Neon), formulaire de contact persistant et espace d'administration.

## Prérequis
- Node.js 20 ou plus récent et npm.
- Un projet PostgreSQL Neon (ou une instance PostgreSQL compatible).
- PowerShell sur Windows.

## 1. Installer et lancer localement

Dans PowerShell, placez-vous dans le dossier du projet :

```powershell
node -v
npm -v
Copy-Item .env.example .env
npm install
```

Ouvrez `.env` et renseignez `DATABASE_URL`, `SESSION_SECRET` et les coordonnées publiques. Ne partagez jamais ce fichier et ne le poussez jamais sur Git.

Dans Neon : créez un projet, ouvrez le panneau de connexion, choisissez l'URL PostgreSQL avec SSL, puis copiez-la dans `DATABASE_URL`. Utilisez la chaîne de connexion pooled si elle est proposée.

### Générer le mot de passe admin et le secret de session

Une seule commande génère les deux valeurs (mot de passe de 12 caractères minimum) :

```powershell
npm run secrets -- "VOTRE_MOT_DE_PASSE_FORT"
```

Copiez `SESSION_SECRET` et `ADMIN_PASSWORD_HASH` dans `.env` (et plus tard dans les variables Railway). Changez aussi `ADMIN_EMAIL` et `ADMIN_NAME`. Le compte est créé au démarrage ; si l'email existe déjà, son mot de passe n'est pas remplacé.

Lancez le serveur :

```powershell
npm run dev
```

Ouvrez :
- Portfolio : http://localhost:3000
- Administration : http://localhost:3000/admin
- Vérification serveur/base : http://localhost:3000/health
- Projets JSON : http://localhost:3000/api/projects

Le serveur crée les tables au démarrage et insère les projets de démonstration uniquement si la table `projects` est vide.

## 2. Tester
1. Vérifiez `/health` : la réponse doit indiquer `status: "ok"` et `database: "connected"`.
2. Envoyez un message via le formulaire public puis vérifiez son apparition dans l'administration.
3. Connectez-vous à `/admin`, ajoutez un projet et vérifiez son affichage sur la page d'accueil.
4. Modifiez un projet, puis supprimez un projet de démonstration pour tester les opérations.
5. Déconnectez-vous et vérifiez que les routes administratives répondent `401` sans session.

## 3. Dépannage
- `DATABASE_URL absent` ou `ECONNREFUSED`: vérifiez l'URL et l'accès réseau PostgreSQL.
- Erreur d'authentification PostgreSQL: copiez de nouveau la chaîne de connexion Neon et vérifiez le mot de passe.
- `relation does not exist`: redémarrez le serveur pour relancer l'initialisation.
- Port déjà utilisé: changez `PORT=3001` dans `.env`.
- Connexion admin impossible: vérifiez `ADMIN_EMAIL` et `ADMIN_PASSWORD_HASH`. L'initialisation n'écrase pas un compte existant.
- Le formulaire ne confirme pas l'envoi: vérifiez `/health`, la console du navigateur et le terminal du serveur.

## 4. Déploiement Railway sans GitHub

1. Installez Node.js 20 ou plus récent et Railway CLI sur votre PC : `npm install -g @railway/cli`.
2. Ouvrez PowerShell dans ce dossier, puis lancez `railway login` et terminez l'autorisation dans le navigateur.
3. Lancez `railway init` pour créer ou associer un projet, puis `railway up` pour envoyer le dossier local. Le fichier `railway.json` configure `npm install`, `npm start` et le contrôle de santé `/health`.
4. Dans les variables du service Railway, configurez `NODE_ENV=production`, `DATABASE_URL`, `SESSION_SECRET`, `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`, `CONTACT_EMAIL`, `WHATSAPP_PRIMARY`, `WHATSAPP_SECONDARY`.
5. Utilisez une chaîne PostgreSQL Neon avec SSL. Ne placez jamais `DATABASE_URL` dans le frontend ou dans un dépôt public.
6. Générez un nouveau `SESSION_SECRET` aléatoire et un nouveau hash bcrypt pour le mot de passe admin avant la mise en ligne. N'utilisez pas les anciens secrets.
7. Déployez, puis testez `/health`, le formulaire et l'administration sur le domaine généré par Railway.
8. Dans les paramètres réseau du service, générez un domaine public. Ajoutez un domaine personnalisé uniquement si vous en possédez un.

Le déploiement nécessite une session Railway autorisée depuis votre navigateur et peut entraîner des frais selon l'offre active. Vérifiez les tarifs dans votre compte avant de valider.

## 5. Sécurité et limites à traiter avant lancement public
- Le formulaire et la connexion sont limités en fréquence, les entrées sont validées côté serveur, les requêtes SQL sont paramétrées et les projets sont rendus avec `textContent`.
- `connect-pg-simple` conserve les sessions en PostgreSQL. Le secret de session doit être long, aléatoire et privé.
- Protection CSRF en place sur l'administration : vérification de l'origine + jeton `X-CSRF-Token` lié à la session. En production, le serveur refuse de démarrer sans `SESSION_SECRET` d'au moins 32 caractères.
- Avant d'ouvrir l'administration au public, ajoutez une stratégie anti-spam plus robuste (par exemple CAPTCHA), une surveillance des journaux et une procédure de rotation du secret. La limitation de débit intégrée est en mémoire et devra être remplacée par un stockage partagé pour plusieurs instances.
- `secure` cookie est activé automatiquement lorsque `NODE_ENV=production`; le service doit être derrière HTTPS et correctement transmettre le protocole via le proxy.
- Pour changer le mot de passe d'un administrateur existant, créez un nouveau hash bcrypt puis mettez à jour `admins.password_hash` via un outil SQL sécurisé. Le seed ne remplace pas les comptes existants.
- Sauvegardez régulièrement PostgreSQL depuis les outils de Neon et limitez les accès à la base.
- Les projets initiaux sont explicitement marqués comme démos. Modifiez leur contenu dans l'administration avant de les présenter comme réalisations réelles.

## Arborescence

```text
sipokteck-fullstack/
├── server.js
├── db.js
├── schema.sql
├── package.json
├── railway.json
├── .env.example
├── .gitignore
├── README.md
└── public/
    ├── index.html
    ├── style.css
    ├── app.js
    ├── admin.html
    ├── admin.css
    └── admin.js
```

## 6. Référencement Google
1. Définissez `SITE_URL` dans Railway avec l'adresse publique exacte (ex. `https://votre-site.up.railway.app`, sans slash final).
2. Vérifiez `/robots.txt` et `/sitemap.xml` sur le site en ligne.
3. Dans Google Search Console (https://search.google.com/search-console), ajoutez la propriété (type « Préfixe d'URL »), vérifiez-la, puis envoyez `sitemap.xml` dans « Sitemaps » et demandez l'indexation de la page d'accueil via « Inspection de l'URL ».
4. L'indexation prend de quelques jours à quelques semaines. Un nom de domaine personnalisé améliore nettement la visibilité.

## 7. Déploiement sur Render (alternative à Railway)
1. Poussez le projet sur GitHub, puis sur render.com : New > Blueprint, choisissez le dépôt. `render.yaml` crée le service et génère `SESSION_SECRET`.
2. Renseignez les variables demandées (`DATABASE_URL` = Session pooler Supabase, `ADMIN_*`, `CONTACT_EMAIL`, `WHATSAPP_*`).
3. Une fois l'adresse `https://xxx.onrender.com` connue, ajoutez `SITE_URL` avec cette adresse (sans slash final).
4. Le plan gratuit met le site en veille après un moment d'inactivité : passez à un plan payant pour un site toujours réactif (important pour Google).
