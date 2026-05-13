# Render Deploy Checklist

## Service

- Type: Web Service
- Name: `puantaj-maas-backend`
- Root Directory: `backend`
- Runtime: Node
- Build Command: `npm install && npm run build`
- Start Command: `npm run start`
- Health endpoint: `/api/health`
- Persistent disk: mount `/var/data`, store uploads in `/var/data/uploads`

The repository also includes `render.yaml`, so Render Blueprint import can create the same service automatically.

## Database

Create a Render PostgreSQL database and copy its internal or external connection string to `DATABASE_URL`.

Use SSL in production:

```text
PG_SSL_REJECT_UNAUTHORIZED=true
```

If Render gives a certificate error during first deployment, set it to `false` temporarily, verify the service, then revisit the database SSL settings.

## Required Environment Variables

```text
NODE_VERSION=22
DATABASE_URL=<Render PostgreSQL connection string>
JWT_SECRET=<generated secret>
JWT_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_IN=30d
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH=<bcrypt hash>
REGISTER_INVITE_KEY_HASH=<optional legacy sha256 hex hash>
PG_SSL_REJECT_UNAUTHORIZED=true
PORT=3000
CORS_ORIGIN=https://puantaj-maas-backend.onrender.com,http://localhost:8081,http://localhost:19006
UPLOADS_DIR=/var/data/uploads
```

Generate the admin secret values locally:

```bash
npm run render:env -- "AdminPasswordHere"
```

`REGISTER_INVITE_KEY_HASH` is only a legacy fallback. New registrations should use one-time keys stored as SHA-256 hashes in `registration_invite_keys`.

Do not commit real secret values or plain invite key lists.

## Registration Invite Keys

Use the admin panel at `/admin` to generate one or many registration keys. Generated plain keys are shown only once. Later, the panel only shows label, assignment, active/used state, used user, and dates.

If you already have a plain key list, paste it into the admin panel import box. The backend stores only `key_hash` values and does not write plain keys to audit logs.

## App/API URL

The mobile app already points to:

```text
https://puantaj-maas-backend.onrender.com
```

If the Render service name changes, update these files before building APK:

- `.env.example`
- `app.json`
- `eas.json`
- `src/api.ts`
- `scripts/build-apk.js`

## Verification

After deploy:

```bash
npm run render:health
```

Expected: `/api/health`, `/health`, and `/api/app-update` return 2xx responses.

Admin panel:

```text
https://puantaj-maas-backend.onrender.com/admin
```

APK files uploaded from the admin panel are served from `/downloads/...` and should live on the Render disk configured above.
