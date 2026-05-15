# W8A WhatsApp Bot

This project is now structured as a Node.js WhatsApp bot backed by Supabase, with a small admin API that can run behind CloudPanel.

## Why this stack

- `whatsapp-web.js` remains the bot runtime.
- Supabase replaces Google Sheets and gives you persistent patient data, diets, appointments, and progress history.
- Vite/React fits well for the admin dashboard, but it should be treated as a separate admin frontend, not as the bot itself.
- CloudPanel can host the Node process and a separate static/admin site cleanly, without coupling it to WordPress.

## What is included

- Dynamic question flow with validation and branching in [`src/config/defaultQuestionFlow.js`](src/config/defaultQuestionFlow.js)
- Supabase-backed patient/session services in [`src/services`](src/services)
- Admin HTTP API in [`src/routes/admin.js`](src/routes/admin.js)
- Tracked Supabase migration in [`supabase/migrations/20260512193000_initial_schema.sql`](supabase/migrations/20260512193000_initial_schema.sql)
- React/Vite admin panel in [`admin`](admin)

## Environment variables

Copy `.env.example` to `.env` and set:

- `PORT`
- `BOT_NAME`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Supabase setup

1. Run `npm install`.
2. Link the repo to your Supabase project:
   `npm run supabase:link -- --project-ref YOUR_PROJECT_REF`
3. Push tracked migrations to the remote database:
   `npm run supabase:db:push`
4. Create your admin users in Supabase Auth with email/password.

## Migration workflow

Use these commands so database changes stay versioned in code:

- Create a new migration:
  `npm run supabase:migration:new -- add_patient_notes`
- Start a local Supabase stack:
  `npm run supabase:start`
- Apply pending migrations to the local database without a full reset:
  `npm run supabase:migration:up`
- Apply local migrations by resetting the local database:
  `npm run supabase:db:reset`
- Apply pending migrations to the linked remote project:
  `npm run supabase:db:push`
- Pull schema changes from a linked remote project into a new migration:
  `npm run supabase:db:pull`
- See local vs remote migration status:
  `npm run supabase:migration:list`
- Stop the local Supabase stack:
  `npm run supabase:stop`

## CloudPanel setup

1. Create a Node.js app in CloudPanel.
2. Point it to this repository path.
3. Add the environment variables from `.env.example` in CloudPanel.
4. Run `npm install`.
5. Run `npm run build:admin`.
6. Set the startup command to `npm start`.
7. Start the app and scan the WhatsApp QR once on the server.

Notes:

- The `.wwebjs_auth` directory must remain persistent on the server, or WhatsApp will ask for a new QR scan.
- This bot is not directly coupled to WordPress. Your WordPress sites can live on the same CloudPanel server without being part of this runtime.

## Admin API

All admin endpoints require a Supabase Auth access token in the `Authorization: Bearer ...` header.

- `GET /health`
- `GET /api/admin/me`
- `GET /api/admin/patients`
- `GET /api/admin/patients/:patientId`
- `POST /api/admin/patients/:patientId/diets`
- `POST /api/admin/patients/:patientId/appointments`
- `POST /api/admin/patients/:patientId/progress-logs`
- `GET /api/admin/question-flow`
- `PUT /api/admin/question-flow`

## Admin frontend

For local development:

- API: `npm run dev:api`
- Admin UI: `npm run dev:admin`

Create `admin/.env` from `admin/.env.example` and set:

- `VITE_API_BASE_URL`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

The Vite app proxies `/api` to `http://localhost:3000` by default. On CloudPanel, the Node app serves the built admin UI from `admin/dist`.

## Recommended next step

- patient search
- profile review
- diet creation
- appointment scheduling
- progress tracking
- question flow editing
