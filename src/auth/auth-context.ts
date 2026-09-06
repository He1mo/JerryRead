import type { Session, User } from '@supabase/supabase-js'
import { createContext, useContext } from 'react'

export type AuthContextValue = {
  isLoading: boolean
  session: Session | null
  user: User | null
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth 必须在 AuthProvider 内使用。')
  return value
}
