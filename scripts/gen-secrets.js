// Usage : npm run secrets -- "MotDePasseAdminFort"
// Affiche SESSION_SECRET et ADMIN_PASSWORD_HASH à copier dans les variables Railway.
const crypto = require("crypto");
const bcrypt = require("bcryptjs");

const password = process.argv[2];
if (!password || password.length < 12) {
  console.error('Donnez un mot de passe de 12 caractères minimum : npm run secrets -- "MotDePasseFort"');
  process.exit(1);
}
bcrypt.hash(password, 12).then(hash => {
  console.log("SESSION_SECRET=" + crypto.randomBytes(48).toString("hex"));
  console.log("ADMIN_PASSWORD_HASH=" + hash);
});
