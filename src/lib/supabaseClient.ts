import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Try to get from window first (for Electron runtime injection), then fallback to env
const getEnvVar = (key: string): string => {
  if (typeof window !== 'undefined' && (window as any).__SUPABASE_CONFIG__) {
    return (window as any).__SUPABASE_CONFIG__[key] || ''
  }
  return (import.meta.env[key] as string | undefined) ?? ''
}

// Get environment variables with better fallback handling
const supabaseUrl = getEnvVar('VITE_SUPABASE_URL') || ((import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '')
const supabaseAnonKey = getEnvVar('VITE_SUPABASE_ANON_KEY') || ((import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '')

export const missingSupabaseEnvMessage =
  'Supabase configuration missing. Provide VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your environment.'

// Create a fallback dummy client to prevent crashes when Supabase is not configured
const createDummyClient = (): SupabaseClient => {
  return {
    auth: {
      getSession: async () => ({ data: { session: null }, error: new Error(missingSupabaseEnvMessage) }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signInWithPassword: async () => ({ data: null, error: new Error(missingSupabaseEnvMessage) }),
      signUp: async () => ({ data: null, error: new Error(missingSupabaseEnvMessage) }),
      signOut: async () => ({ error: new Error(missingSupabaseEnvMessage) }),
    },
  } as any as SupabaseClient
}

let client: SupabaseClient | null = null

if (!supabaseUrl || !supabaseAnonKey) {
  // In production, don't log warnings (but client will be null)
  // Create dummy client to prevent runtime errors
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.warn(missingSupabaseEnvMessage)
  }
  // Use dummy client instead of null to prevent crashes
  client = createDummyClient()
} else {
  try {
    client = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: typeof window !== 'undefined' ? window.localStorage : undefined,
      },
      global: {
        fetch: (url, options = {}) => {
          // Handle offline scenarios gracefully
          let timeoutId: ReturnType<typeof setTimeout> | undefined
          const controller = new AbortController()
          
          // Create timeout signal if available, otherwise use setTimeout
          if (typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal) {
            try {
              const timeoutSignal = (AbortSignal as any).timeout(10000)
              controller.signal.addEventListener('abort', () => {
                timeoutSignal.abort()
              })
            } catch {
              // Fallback for browsers without AbortSignal.timeout
              timeoutId = setTimeout(() => controller.abort(), 10000)
            }
          } else {
            timeoutId = setTimeout(() => controller.abort(), 10000)
          }

          return fetch(url, {
            ...options,
            signal: controller.signal,
          })
            .finally(() => {
              if (timeoutId) clearTimeout(timeoutId)
            })
            .catch((err) => {
              // Return a mock response that indicates offline
              if (err.name === 'AbortError' || err.name === 'TypeError' || err.message?.includes('fetch')) {
                throw new Error('Network request failed - offline')
              }
              throw err
            })
        },
      },
    })
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to create Supabase client:', error)
    client = createDummyClient()
  }
}

export const supabase = client as SupabaseClient
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey && supabaseUrl.length > 0 && supabaseAnonKey.length > 0)
