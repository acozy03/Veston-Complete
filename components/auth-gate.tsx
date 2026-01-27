'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

type Props = {
  children: React.ReactNode
}

export default function AuthGate({ children }: Props) {
  useEffect(() => {
    const run = async () => {
      if (typeof window === 'undefined') return
      if (window.location.pathname.startsWith('/auth/callback')) return

      const supabase = createClient()
      const { data } = await supabase.auth.getSession()
      if (!data.session) {
        const redirectTo = `${window.location.origin}/auth/callback`
        await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo,
            queryParams: {
              prompt: 'consent',
              access_type: 'offline',
            },
          },
        })
      }
    }
    void run()
  }, [])

  return <>{children}</>
}

