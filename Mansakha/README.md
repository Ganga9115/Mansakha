# Mansakha (SIH26094)

AI-powered dynamic mental health monitoring and distress-prediction system for
victims of atrocities, built for the Ministry of Social Justice and Empowerment.

Source of truth for every requirement in this codebase:
`../Documents/SIH26094_Build_Prompt.md`. This is the required-scope build only — the
separate `SIH26094_Additional_Standout_Features.md` backlog is not implemented here.

## Status

**This pass implements Suggested Build Order step 1 only: auth & role scaffolding.**
Three login surfaces (Ministry, Staff, User), the full database schema, and RBAC
middleware are real and functional. Everything else (User check-in flow, AI Risk
Engine, Counsellor module, Administration/Ministry dashboards) is scaffolded as
navigation entry points behind a "Coming soon" placeholder, not yet built — see
Build Prompt Section 11 for the full sequence.

## Structure

```
backend/     Node.js + Express + Supabase
frontend/    React Native (Expo) - Android + web, single codebase
```

## Setup

### 1. Provision the free-tier services

All of these are free tier / no billing account, per Build Prompt Section 1:

- **Supabase** (supabase.com) — new project, free tier. Run `backend/src/core/db/schema.sql`
  in the Supabase SQL editor to create all 19 tables.
- **Firebase** (console.firebase.google.com) — new project, Spark (free) plan, enable
  Phone Authentication. Generate a service account key (Project Settings > Service
  Accounts) for the backend, and grab the Web API key for the frontend.
- **Google Cloud** — an OAuth 2.0 Client ID (for User Gmail login) and, separately,
  a Gemini API key from Google AI Studio (stay on the free tier, don't attach billing).
- **Exotel** (exotel.com) — trial account only, for IVRS. Not a free tier at scale;
  see the note in `backend/.env.example`.

### 2. Backend

```
cd backend
npm install
cp .env.example .env      # fill in the values from step 1
npm run dev
```

Runs on `http://localhost:4000` by default. `GET /health` should return
`{ success: true, data: { status: "up" } }`. If port 4000 is already in use by
something else on your machine, change `PORT` in `backend/.env` and match it in
`frontend/.env`'s `EXPO_PUBLIC_API_BASE_URL`.

Then seed the Ministry Super Admin account (fixed credentials from `SUPER_ADMIN_EMAIL`/
`SUPER_ADMIN_PASSWORD` in `.env` - change these before a real deployment):

```
npm run seed:super-admin
```

Safe to re-run any time; it upserts rather than erroring if the account already
exists, and creates the root "India" national jurisdiction if none exists yet.

### 3. Frontend

```
cd frontend
npm install
cp .env.example .env      # fill in the public values from step 1
npm run web                # or: npm run android
```

## Accounts

**Ministry Super Admin** is created by `npm run seed:super-admin` (see step 2 above)
using the fixed credentials in `backend/.env`. It's reachable only at the `/ministry`
URL directly, not linked from anywhere in the app - see the note in
`frontend/src/navigation/RootNavigator.js`.

**Administration/Counsellor accounts** are created by the Ministry Super Admin from
the Staff Management screen once logged in - there's no seed script for these since
they're meant to be provisioned through the app itself, per Build Prompt Section 3.

Broader demo/sample data (many users, realistic check-in history) is Section 10 of
the build prompt and still outstanding - see the leftover-task list from the last
build pass.
