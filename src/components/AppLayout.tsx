import { Link, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/auth-context'

export function AppLayout() {
  const { user, signOut } = useAuth()
  const { pathname } = useLocation()
  const isReader = pathname.startsWith('/reader/')

  return (
    <div className={`app-shell ${isReader ? 'reader-shell' : ''}`}>
      <header className="app-header">
        <Link className="brand" to="/books" aria-label="JerryRead 书架">
          <img className="brand-mark" src="/logo-192.png" alt="" />
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
