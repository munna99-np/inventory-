import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export const missingSupabaseEnvMessage =
  'Supabase configuration missing. Provide VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your environment.'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

const createDummyClient = (): SupabaseClient => {
  return {
    auth: {
      getSession: async () => ({ data: { session: null }, error: new Error(missingSupabaseEnvMessage) }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signInWithPassword: async () => ({ data: null, error: new Error(missingSupabaseEnvMessage) }),
      signUp: async () => ({ data: null, error: new Error(missingSupabaseEnvMessage) }),
      signOut: async () => ({ error: new Error(missingSupabaseEnvMessage) }),
    },
  } as unknown as SupabaseClient
}

let client: SupabaseClient

if (isSupabaseConfigured) {
  client = createClient(supabaseUrl!, supabaseAnonKey!, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: typeof window !== 'undefined' ? window.localStorage : undefined,
    },
  })
} else {
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.warn(missingSupabaseEnvMessage)
  }
  client = createDummyClient()
}

export const supabase = client
