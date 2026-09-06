import type { Session } from '@supabase/supabase-js'
import { useEffect, useMemo, useState } from 'react'
import type { PropsWithChildren } from 'react'
import { supabase } from '../lib/supabase'
import { AuthContext } from './auth-context'
import type { AuthContextValue } from './auth-context'

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let active = true

    void supabase.auth.getSession().then(({ data }) => {
      if (active) {
        setSession(data.session)
        setIsLoading(false)
      }
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setIsLoading(false)
    })

    return () => {
      active = false
      listener.subscription.unsubscribe()
    }
  }, [])

  const value = useMemo<AuthContextValue>(() => ({
    isLoading,
    session,
    user: session?.user ?? null,
    signOut: async () => {
      const { error } = await supabase.auth.signOut()
      if (error) throw error
    },
  }), [isLoading, session])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
