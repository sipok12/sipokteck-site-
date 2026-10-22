require("dotenv").config();

const fs = require("fs");
const crypto = require("crypto");
const path = require("path");
const express = require("express");
const helmet = require("helmet");
const session = require("express-session");
const PgSession = require("connect-pg-simple")(session);
const bcrypt = require("bcryptjs");
const rateLimit = require("express-rate-limit");
const { pool, query } = require("./db");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === "production";
const publicDir = path.join(__dirname, "public");

if (isProduction && (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)) {
  console.error("SESSION_SECRET manquant ou trop court (32 caractères minimum). Arrêt du serveur.");
  process.exit(1);
}

app.set("trust proxy", isProduction ? 1 : false);
app.disable("x-powered-by");
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: isProduction ? [] : null
    }
  }
}));
app.use(express.json({ limit: "20kb" }));
app.use(express.urlencoded({ extended: false, limit: "20kb" }));

// Défense CSRF n°1 : une requête qui modifie des données doit venir de notre propre domaine.
app.use("/api", (req, res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const origin = req.get("origin");
  if (origin) {
    let host = "";
    try { host = new URL(origin).host; } catch { /* origine invalide */ }
    if (host !== req.get("host")) return res.status(403).json({ error: "Origine non autorisée." });
  }
  next();
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: true, legacyHeaders: false,
  message: { error: "Trop de tentatives. Réessayez dans 15 minutes." }
});
const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, limit: 5, standardHeaders: true, legacyHeaders: false,
  message: { error: "Trop de messages envoyés. Réessayez plus tard." }
});

app.use(session({
  name: "sipokteck.sid",
  store: new PgSession({
    pool,
    tableName: "user_sessions",
    createTableIfMissing: true,
    pruneSessionInterval: 15 * 60
  }),
  secret: process.env.SESSION_SECRET || "development-only-change-this-session-secret",
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    maxAge: 8 * 60 * 60 * 1000
  }
}));

function cleanString(value, max) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}
function isValidExternalUrl(value) {
  if (!value) return true;
  try { const u = new URL(value); return ["https:", "http:"].includes(u.protocol); }
  catch { return false; }
}
function requireAdmin(req, res, next) {
  if (!req.session || !req.session.adminId) return res.status(401).json({ error: "Authentification requise." });
  next();
}
function ensureCsrfToken(req) {
  if (!req.session.csrfToken) req.session.csrfToken = crypto.randomBytes(32).toString("hex");
  return req.session.csrfToken;
}
// Défense CSRF n°2 : jeton lié à la session, renvoyé dans l'en-tête X-CSRF-Token.
function requireCsrf(req, res, next) {
  const expected = Buffer.from(req.session.csrfToken || "");
  const received = Buffer.from(req.get("x-csrf-token") || "");
  if (!expected.length || expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) {
    return res.status(403).json({ error: "Jeton de sécurité invalide. Rechargez la page." });
  }
  next();
}
function asyncRoute(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

async function initializeDatabase() {
  const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
  await query(schema);
  await query(`
    CREATE TABLE IF NOT EXISTS user_sessions (
      sid varchar NOT NULL COLLATE "default",
      sess json NOT NULL,
      expire timestamp(6) NOT NULL,
      CONSTRAINT session_pkey PRIMARY KEY (sid)
    );
    CREATE INDEX IF NOT EXISTS "IDX_user_sessions_expire" ON user_sessions (expire);
  `);

  const email = cleanString(process.env.ADMIN_EMAIL, 254).toLowerCase();
  const passwordHash = cleanString(process.env.ADMIN_PASSWORD_HASH, 200);
  if (email && passwordHash && validEmail(email)) {
    await query(
      `INSERT INTO admins (name, email, password_hash)
       VALUES ($1, $2, $3)
       ON CONFLICT (email) DO NOTHING`,
      [cleanString(process.env.ADMIN_NAME || "Administrateur", 100), email, passwordHash]
    );
  }

  const count = await query("SELECT COUNT(*)::int AS n FROM projects");
  if (count.rows[0].n === 0) {
    const demos = [
      ["Boutique SIPOKTECK", "E-commerce", "Concept de boutique en ligne pour présenter des vêtements, chaussures et accessoires. Projet de démonstration à personnaliser.", "🛍️", true],
      ["Radio web", "Média numérique", "Interface de radio en ligne avec lecteur audio intégré et informations sur la station. Projet de démonstration.", "📻", true],
      ["Portfolio SIPOKTECK", "Portfolio", "Portfolio professionnel pour présenter les compétences, les services et les projets de SIPOKTECK. Projet de démonstration.", "💻", true]
    ];
    for (const p of demos) {
      await query(
        "INSERT INTO projects (title, category, description, icon, featured, demo) VALUES ($1,$2,$3,$4,$5,TRUE)",
        p
      );
    }
  }
}

app.get("/health", asyncRoute(async (req, res) => {
  await query("SELECT 1");
  res.json({ status: "ok", database: "connected", timestamp: new Date().toISOString() });
}));

app.get("/api/config", (req, res) => {
  res.json({
    name: "Jean-Paul AHITE",
    brand: "SIPOKTECK",
    location: "Lomé, Togo",
    email: process.env.CONTACT_EMAIL || "jeanpaulahite35@gmail.com",
    whatsappPrimary: (process.env.WHATSAPP_PRIMARY || "22870309696").replace(/\D/g, ""),
    whatsappSecondary: (process.env.WHATSAPP_SECONDARY || "22871344338").replace(/\D/g, "")
  });
});

app.get("/api/projects", asyncRoute(async (req, res) => {
  const result = await query(
    "SELECT id, title, category, description, url, icon, featured, demo, created_at FROM projects ORDER BY featured DESC, created_at DESC"
  );
  res.json({ projects: result.rows });
}));

app.post("/api/contact", contactLimiter, asyncRoute(async (req, res) => {
  const name = cleanString(req.body.name, 100);
  const email = cleanString(req.body.email, 254).toLowerCase();
  const subject = cleanString(req.body.subject, 160);
  const message = cleanString(req.body.message, 4000);
  // Honeypot: bots tend to fill this hidden field.
  if (cleanString(req.body.company, 100)) return res.status(200).json({ message: "Message reçu." });
  if (name.length < 2 || !validEmail(email) || subject.length < 3 || message.length < 10) {
    return res.status(400).json({ error: "Vérifiez les champs : nom, email, sujet et message (10 caractères minimum)." });
  }
  const result = await query(
    "INSERT INTO messages (name, email, subject, message) VALUES ($1,$2,$3,$4) RETURNING id",
    [name, email, subject, message]
  );
  res.status(201).json({ message: "Votre message a bien été enregistré.", id: result.rows[0].id });
}));

app.post("/api/admin/login", loginLimiter, asyncRoute(async (req, res) => {
  const email = cleanString(req.body.email, 254).toLowerCase();
  const password = typeof req.body.password === "string" ? req.body.password : "";
  if (!validEmail(email) || password.length < 1 || password.length > 200) {
    return res.status(400).json({ error: "Email ou mot de passe invalide." });
  }
  const result = await query("SELECT id, name, email, password_hash FROM admins WHERE email = $1", [email]);
  const admin = result.rows[0];
  const matches = admin ? await bcrypt.compare(password, admin.password_hash) : false;
  if (!matches) return res.status(401).json({ error: "Identifiants incorrects." });

  await new Promise((resolve, reject) => req.session.regenerate(err => err ? reject(err) : resolve()));
  req.session.adminId = admin.id;
  req.session.adminName = admin.name;
  req.session.adminEmail = admin.email;
  res.json({ admin: { name: admin.name, email: admin.email }, csrfToken: ensureCsrfToken(req) });
}));

app.get("/api/admin/me", requireAdmin, (req, res) => {
  res.json({ admin: { name: req.session.adminName, email: req.session.adminEmail }, csrfToken: ensureCsrfToken(req) });
});

app.post("/api/admin/logout", requireAdmin, requireCsrf, (req, res, next) => {
  req.session.destroy(err => {
    if (err) return next(err);
    res.clearCookie("sipokteck.sid", { httpOnly: true, sameSite: "lax", secure: isProduction });
    res.json({ message: "Déconnexion effectuée." });
  });
});

app.get("/api/admin/messages", requireAdmin, asyncRoute(async (req, res) => {
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 50, 1), 100);
  const result = await query(
    "SELECT id, name, email, subject, message, status, created_at FROM messages ORDER BY created_at DESC LIMIT $1",
    [limit]
  );
  res.json({ messages: result.rows });
}));

app.patch("/api/admin/messages/:id", requireAdmin, requireCsrf, asyncRoute(async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  const status = cleanString(req.body.status, 20);
  if (!Number.isSafeInteger(id) || id < 1 || !["nouveau", "lu", "traité"].includes(status)) {
    return res.status(400).json({ error: "Identifiant ou statut invalide." });
  }
  const result = await query("UPDATE messages SET status = $1 WHERE id = $2 RETURNING id, status", [status, id]);
  if (!result.rowCount) return res.status(404).json({ error: "Message introuvable." });
  res.json({ message: result.rows[0] });
}));

app.post("/api/admin/projects", requireAdmin, requireCsrf, asyncRoute(async (req, res) => {
  const data = readProject(req.body);
  if (data.error) return res.status(400).json({ error: data.error });
  const result = await query(
    `INSERT INTO projects (title, category, description, url, icon, featured, demo)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING *`,
    [data.title, data.category, data.description, data.url || null, data.icon, data.featured, data.demo]
  );
  res.status(201).json({ project: result.rows[0] });
}));

app.put("/api/admin/projects/:id", requireAdmin, requireCsrf, asyncRoute(async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  const data = readProject(req.body);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: "Identifiant invalide." });
  if (data.error) return res.status(400).json({ error: data.error });
  const result = await query(
    `UPDATE projects SET title=$1, category=$2, description=$3, url=$4, icon=$5,
     featured=$6, demo=$7, updated_at=NOW() WHERE id=$8 RETURNING *`,
    [data.title, data.category, data.description, data.url || null, data.icon, data.featured, data.demo, id]
  );
  if (!result.rowCount) return res.status(404).json({ error: "Projet introuvable." });
  res.json({ project: result.rows[0] });
}));

app.delete("/api/admin/projects/:id", requireAdmin, requireCsrf, asyncRoute(async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: "Identifiant invalide." });
  const result = await query("DELETE FROM projects WHERE id=$1 RETURNING id", [id]);
  if (!result.rowCount) return res.status(404).json({ error: "Projet introuvable." });
  res.json({ message: "Projet supprimé." });
}));

function readProject(body = {}) {
  const title = cleanString(body.title, 120);
  const category = cleanString(body.category, 80);
  const description = cleanString(body.description, 2000);
  const url = cleanString(body.url, 500);
  const icon = cleanString(body.icon || "💻", 20);
  const featured = body.featured === true || body.featured === "true";
  const demo = body.demo === true || body.demo === "true";
  if (title.length < 2 || category.length < 2 || description.length < 10) {
    return { error: "Le titre, la catégorie et une description d'au moins 10 caractères sont requis." };
  }
  if (!isValidExternalUrl(url)) return { error: "Le lien doit être une URL HTTP ou HTTPS valide." };
  return { title, category, description, url, icon, featured, demo };
}

// --- Référencement : SITE_URL = adresse publique du site (ex. https://sipokteck.up.railway.app) ---
const siteUrl = (process.env.SITE_URL || "").trim().replace(/\/+$/, "");
const indexTemplate = fs.readFileSync(path.join(publicDir, "index.html"), "utf8");
const lastModified = new Date().toISOString().slice(0, 10);

function absoluteUrl(req) {
  return siteUrl || `${req.protocol}://${req.get("host")}`;
}
function sendHome(req, res) {
  res.type("html").send(indexTemplate.replaceAll("__SITE_URL__", absoluteUrl(req)));
}
app.get(["/", "/index.html"], sendHome);

app.get("/robots.txt", (req, res) => {
  res.type("text/plain").send(
    `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\n\nSitemap: ${absoluteUrl(req)}/sitemap.xml\n`
  );
});
app.get("/sitemap.xml", (req, res) => {
  res.type("application/xml").send(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${absoluteUrl(req)}/</loc><lastmod>${lastModified}</lastmod><changefreq>monthly</changefreq><priority>1.0</priority></url>\n</urlset>\n`
  );
});

app.get("/admin", (req, res) => {
  res.set("X-Robots-Tag", "noindex, nofollow");
  res.sendFile(path.join(publicDir, "admin.html"));
});
app.use(express.static(publicDir, { extensions: ["html"], maxAge: isProduction ? "1h" : 0 }));

app.use((req, res) => res.status(404).json({ error: "Ressource introuvable." }));
app.use((err, req, res, next) => {
  console.error("Erreur serveur :", err.message);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: "Une erreur serveur est survenue. Réessayez plus tard." });
});

initializeDatabase()
  .then(() => {
    app.listen(PORT, () => console.log(`SIPOKTECK disponible sur http://localhost:${PORT}`));
  })
  .catch(err => {
    console.error("Impossible de démarrer le serveur. Vérifiez DATABASE_URL et schema.sql :", err.message);
    process.exit(1);
  });
