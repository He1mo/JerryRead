import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/auth-context'

export function ProtectedRoute() {
  const { isLoading, user } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return <main className="loading-screen" aria-label="正在恢复登录状态"><span className="spinner" /></main>
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return <Outlet />
}
