# Database keepalive (prevent DB from sleeping)

This project includes a small keepalive script that performs a lightweight request to Supabase to keep the service from idling-off.

Files added
- `scripts/db-keepalive.js` — Node script that makes a minimal request via `@supabase/supabase-js`.
- `.github/workflows/db-keepalive.yml` — optional GitHub Actions workflow that runs the script every 2 days.

How it works
- The script uses the Supabase client and calls `supabase.auth.getSession()` which performs a network request to Supabase. That is sufficient as a periodic ping and does not depend on any application tables.

Environment variables
- Set either VITE_* names (used by the app):
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`

- Or the non-Vite names (common on servers):
  - `SUPABASE_URL`
  - `SUPABASE_KEY`

How to run locally
1. Ensure Node 20+ is installed.
2. From the repo root run (example using env inline):

```powershell
$env:VITE_SUPABASE_URL = 'https://your-supabase-url'
$env:VITE_SUPABASE_ANON_KEY = 'your-anon-key'
node .\scripts\db-keepalive.js
```

Linux system cron example (runs every 2 days at midnight):

1. Edit the crontab: `crontab -e`
2. Add (adjust path to node and repo):

```
0 0 */2 * * cd /path/to/Finance-Tracker-main && /usr/bin/node scripts/db-keepalive.js >> /var/log/db-keepalive.log 2>&1
```

GitHub Actions (recommended if repository is on GitHub)
1. Add two repository secrets: `SUPABASE_URL` and `SUPABASE_KEY` (in GitHub repo Settings → Secrets).
2. The workflow `.github/workflows/db-keepalive.yml` will run every 2 days automatically.

Windows Scheduled Task (PowerShell)
Use Task Scheduler to run a PowerShell command every 2 days. Example action runs this command:

```powershell
powershell -NoProfile -Command "[Environment]::SetEnvironmentVariable('VITE_SUPABASE_URL','https://your-supabase-url','User'); [Environment]::SetEnvironmentVariable('VITE_SUPABASE_ANON_KEY','your-anon-key','User'); node 'C:\path\to\Finance-Tracker-main\scripts\db-keepalive.js'"
```

Notes and troubleshooting
- The script exits with a non-zero code on network errors — useful for alerts and CI failure detection.
- If you prefer to ping a specific DB table, you can change the script to call `supabase.from('<table>').select('id').limit(1)` — but that requires the table to exist.
- If you want to use a `.env` file, install `dotenv` and add `import 'dotenv/config'` at the top of `scripts/db-keepalive.js`.
