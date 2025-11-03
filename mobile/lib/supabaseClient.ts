import 'react-native-url-polyfill/auto'
import { createClient } from '@supabase/supabase-js'
import AsyncStorage from '@react-native-async-storage/async-storage'

// Get from environment variables or use defaults
// These should be set via Expo environment variables or .env file
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || ''

export const missingSupabaseEnvMessage =
  'Supabase configuration missing. Provide EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in your environment.'

let client: ReturnType<typeof createClient> | null = null

if (!supabaseUrl || !supabaseAnonKey) {
  if (__DEV__) {
    console.warn(missingSupabaseEnvMessage)
  }
} else {
  client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  })
}

export const supabase = client!
export const isSupabaseConfigured = Boolean(client)
