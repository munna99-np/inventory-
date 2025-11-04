import type { PropsWithChildren } from 'react'
import { Navigate } from 'react-router-dom'

import { useAuth } from '../providers/AuthProvider'

export function ProtectedRoute({ children }: PropsWithChildren): JSX.Element | null {
  const { user } = useAuth()

  if (user === undefined) {
    return null
  }

  if (user === null) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

export default ProtectedRoute
