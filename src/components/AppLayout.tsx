import { Link, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/auth-context'

export function AppLayout() {
  const { user, signOut } = useAuth()

  return (
    <div className="app-shell">
      <header className="app-header">
        <Link className="brand" to="/books" aria-label="JerryRead 书架">
          <span className="brand-mark" aria-hidden="true">J</span>
          <span>JerryRead</span>
        </Link>
        <div className="account">
          <span>{user?.email}</span>
          <button className="text-button" type="button" onClick={() => void signOut()}>退出</button>
        </div>
      </header>
      <Outlet />
    </div>
  )
}
