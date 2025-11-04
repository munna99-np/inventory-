import { PropsWithChildren, useEffect } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { toast } from 'sonner'

import { AuthProvider as InternalAuthProvider, useAuth as useAuthContext } from '../providers/AuthProvider'
import { isSupabaseConfigured, missingSupabaseEnvMessage } from './supabase'

export const AuthProvider = InternalAuthProvider
export const useAuth = useAuthContext

export function Protected({ children }: PropsWithChildren): JSX.Element | null {
  const { user } = useAuthContext()
  const location = useLocation()

  useEffect(() => {
    if (!isSupabaseConfigured && import.meta.env.DEV) {
      toast.error(missingSupabaseEnvMessage)
    }
  }, [])

  if (user === undefined) {
    return null
  }

  if (user === null) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return <>{children}</>
}

export function ProtectedOutlet(): JSX.Element {
  return (
    <Protected>
      <Outlet />
    </Protected>
  )
}
