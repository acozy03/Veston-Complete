'use client'

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function AuthCallback() {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const run = async () => {
      const supabase = createClient()
      const code = searchParams.get('code')

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (error) {
          // In practice, you might show a toast or error UI
          // eslint-disable-next-line no-console
          console.error('OAuth exchange error:', error.message)
        }
      }

      router.replace('/')
    }
    void run()
  }, [router, searchParams])

  return <p className="p-4 text-sm text-muted-foreground">Signing you in…</p>
}

