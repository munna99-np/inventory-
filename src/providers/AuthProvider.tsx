import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react'
import type { Session, User } from '@supabase/supabase-js'

import { supabase, isSupabaseConfigured } from '../lib/supabase'

export type AuthContextValue = {
  user: User | null | undefined
  session: Session | null
  loading: boolean
}

const AuthContext = createContext<AuthContextValue>({ user: undefined, session: null, loading: true })

export function AuthProvider({ children }: PropsWithChildren): JSX.Element {
  const [user, setUser] = useState<User | null | undefined>(undefined)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let isMounted = true

    if (!isSupabaseConfigured) {
      setUser(null)
      setSession(null)
      setLoading(false)
      return () => {
        isMounted = false
      }
    }

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!isMounted) return
        setSession(data.session ?? null)
        setUser(data.session?.user ?? null)
        setLoading(false)
      })
      .catch(() => {
        if (!isMounted) return
        setSession(null)
        setUser(null)
        setLoading(false)
      })

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!isMounted) return
      setSession(nextSession ?? null)
      setUser(nextSession?.user ?? null)
      setLoading(false)
    })

    return () => {
      isMounted = false
      data?.subscription.unsubscribe()
    }
  }, [])

  const value = useMemo<AuthContextValue>(() => ({ user, session, loading }), [user, session, loading])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext)
}
