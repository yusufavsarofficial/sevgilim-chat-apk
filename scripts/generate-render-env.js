const crypto = require("node:crypto");
const path = require("node:path");

let bcrypt;
try {
  bcrypt = require("bcryptjs");
} catch {
  bcrypt = require(path.join(__dirname, "..", "backend", "node_modules", "bcryptjs"));
}

const [, , adminPassword, inviteKey] = process.argv;

if (!adminPassword) {
  console.error("Usage: node scripts/generate-render-env.js <admin-password> [legacy-register-invite-key]");
  process.exit(1);
}

if (adminPassword.length < 6) {
  console.error("Admin password should be at least 6 characters.");
  process.exit(1);
}

if (inviteKey && inviteKey.length < 8) {
  console.error("Register invite key should be at least 8 characters.");
  process.exit(1);
}

const jwtSecret = crypto.randomBytes(48).toString("hex");
const adminPasswordHash = bcrypt.hashSync(adminPassword, 12);

console.log("Render environment values:");
console.log(`JWT_SECRET=${jwtSecret}`);
console.log(`ADMIN_PASSWORD_HASH=${adminPasswordHash}`);
if (inviteKey) {
  const inviteKeyHash = crypto.createHash("sha256").update(inviteKey.trim()).digest("hex");
  console.log(`REGISTER_INVITE_KEY_HASH=${inviteKeyHash}`);
}
