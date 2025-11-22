#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js'

// Read env vars (support both VITE_* and non-VITE names)
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || ''
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY || ''

if (!SUPABASE_URL || !SUPABASE_KEY) {
  // Keep message short and actionable
  // Exit code 1 indicates misconfiguration
  // When running in cron / CI set the environment variables appropriately
  // Example: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY or SUPABASE_URL and SUPABASE_KEY
  // eslint-disable-next-line no-console
  console.error('Missing Supabase credentials. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (or SUPABASE_URL and SUPABASE_KEY).')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

async function ping() {
  try {
    // Call a lightweight endpoint. auth.getSession performs a request to the Supabase auth service
    // which is sufficient as a keep-alive ping and doesn't depend on any database tables.
    const { data, error } = await supabase.auth.getSession()
    if (error) {
      // Non-fatal if network hiccup — exit non-zero for observability
      // eslint-disable-next-line no-console
      console.error('Supabase keepalive request failed:', error.message || error)
      process.exit(2)
    }

    // Success
    // eslint-disable-next-line no-console
    console.log(new Date().toISOString(), 'Supabase keepalive OK')
    process.exit(0)
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Unexpected error during keepalive:', err)
    process.exit(3)
  }
}

ping()
