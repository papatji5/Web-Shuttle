# Web Shuttle — Web-first ride-sharing platform

Web Shuttle is a web-first platform for ride-sharing with passenger, driver, and admin workflows using Next.js and Supabase.

## Option A (recommended first): Deploy the website in demo mode (no Supabase yet)

This repo can run without Supabase configured. In that case:
- Home page works normally
- `/login` + `/signup` show that auth is disabled
- `/passenger`, `/driver`, `/admin` show placeholders instead of crashing

### Deploy to Vercel
1. Push this repo to GitHub
2. In Vercel: **New Project** → import the repo
3. Deploy (no env vars required for demo mode)

## Option B: Enable Supabase (auth + database)

### Prerequisites
- Node.js 20+
- A Supabase account

### 1) Create Supabase project
1. Create a new Supabase project
2. Go to **Project Settings -> API**
3. Copy:
   - Project URL
   - `anon` public key

### 2) Create database schema
1. In Supabase, open **SQL Editor**
2. Paste and run: `supabase/sql/0001_init.sql`

### 3) Configure local env
1. Copy `.env.example` to `.env.local`
2. Fill in:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`

### 4) Run locally
```bash
npm install
npm run dev
```
Open http://localhost:3000

## Roles
- Default role on signup: `PASSENGER`
- Make an admin (after signing up):
  - Sign up at `/signup` using:
    - `Email: chaganethabang@gmail.com`
    - `Password: 508462003Ct@`
  - In Supabase SQL Editor run:
    - `update public.profiles set role = 'ADMIN' where email = 'chaganethabang@gmail.com';`
- Drivers:
  - For now, create a driver row manually (MVP bootstrap):
    - `insert into public.drivers (id) values ('<user-id-uuid>');`
  - Then make that user a driver:
    - `update public.profiles set role = 'DRIVER' where email = 'driver@email.com';`

## Web-first limitation (important)
Driver GPS tracking in a browser is unreliable in the background. For MVP, drivers must keep the driver web app open while online/on-trip.

## Next build steps (recommended)
- Passenger ride request form (pickup/dropoff + estimate)
- Driver online/offline + location update API
- Admin: approve drivers + live ride monitoring
- Dispatch: nearest-driver matching (PostGIS query)
## Programming languages (frontend + backend)

### Frontend
- **TypeScript + React (TSX)**: The UI is built with React components written in TypeScript (files in src/app/**/page.tsx).
- **Tailwind CSS**: Styling now comes from Tailwind utility classes and component layers in src/app/globals.css.

### Backend
This app uses a “serverless web-app backend” approach:
- **TypeScript (server components + server actions)**: Next.js runs code on the server (Node.js runtime) for protected pages and server actions (e.g. creating rides, dispatching offers).
- **SQL (PostgreSQL)**: Supabase hosts the Postgres database. The schema + RLS policies are defined in supabase/sql/0001_init.sql.
- **PostGIS**: Enabled for location types (geography points) and future proximity queries.

In other words: there’s no separate Express/Django backend here — the “backend” is **Next.js server code (TypeScript)** + **Supabase (Postgres + SQL + Auth + RLS)**.



