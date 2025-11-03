import { PropsWithChildren, createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase, isSupabaseConfigured, missingSupabaseEnvMessage } from './supabaseClient'
import { toast } from 'sonner'
import { useNavigate, useLocation, Outlet } from 'react-router-dom'

type AuthContextType = {
  session: Session | null
  user: User | null
  loading: boolean
}

const AuthContext = createContext<AuthContextType>({ session: null, user: null, loading: true })

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [configErrorNotified, setConfigErrorNotified] = useState(false)

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false)
      setSession(null)
      // Only show error in dev mode, in production show config message silently
      if (!configErrorNotified && import.meta.env.DEV) {
        toast.error(missingSupabaseEnvMessage)
        setConfigErrorNotified(true)
      }
      return
    }

    let mounted = true

    // Safely get session with error handling
    supabase.auth.getSession()
      .then(({ data, error }) => {
        if (!mounted) return
        if (error) {
          // eslint-disable-next-line no-console
          if (import.meta.env.DEV) console.error('Auth session error:', error)
          setSession(null)
        } else {
          setSession(data.session)
        }
        setLoading(false)
      })
      .catch((error) => {
        if (!mounted) return
        // eslint-disable-next-line no-console
        if (import.meta.env.DEV) console.error('Auth session catch:', error)
        setSession(null)
        setLoading(false)
      })

    // Safely subscribe to auth changes
    let subscription: { unsubscribe: () => void } | null = null
    try {
      const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
        if (!mounted) return
        setSession(sess)
        setLoading(false)
      })
      subscription = sub.subscription
    } catch (error) {
      // eslint-disable-next-line no-console
      if (import.meta.env.DEV) console.error('Auth state change subscription error:', error)
    }

    return () => {
      mounted = false
      if (subscription) {
        try {
          subscription.unsubscribe()
        } catch (error) {
          // Ignore unsubscribe errors
        }
      }
    }
  }, [configErrorNotified])

  const value = useMemo(() => ({ session, user: session?.user ?? null, loading }), [session, loading])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}

export function Protected({ children }: PropsWithChildren) {
  const { user, loading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    if (!loading && !user) {
      navigate('/signin', { replace: true, state: { from: location.pathname } })
    }
  }, [user, loading, navigate, location])

  if (loading)
    return (
      <div className="min-h-[50vh] grid place-items-center text-sm text-muted-foreground">
        Loading...
      </div>
    )
  if (!user) return null
  return <>{children}</>
}

export function ProtectedOutlet() {
  return (
    <Protected>
      <Outlet />
    </Protected>
  )
}
