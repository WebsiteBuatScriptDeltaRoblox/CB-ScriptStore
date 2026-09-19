# Hosting CB ScriptStore with Render + Supabase

This version uses PostgreSQL via `DATABASE_URL` and is intended for Render with a Supabase Session Pooler connection string.

## Render
- Build command: `npm install`
- Start command: `npm start`
- Environment variable: `DATABASE_URL` = your Supabase Session Pooler URI
- Optional: `FRONTEND_ORIGINS` = your GitHub Pages origin if you host the frontend separately. Leave empty when Render serves the whole site from the same origin.

Do not put the database password in GitHub, `config.js`, or frontend JavaScript.
