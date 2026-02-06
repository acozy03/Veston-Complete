'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type AuthStatus = 'checking' | 'authenticated' | 'redirecting'

type Props = {
  children: React.ReactNode
}

function AuthLoadingScreen({ status }: { status: 'checking' | 'redirecting' }) {
  const message = status === 'checking' 
    ? 'Checking credentials...' 
    : 'Redirecting to Google for sign-in...'
  const subMessage = status === 'checking'
    ? 'Please wait while we verify your session.'
    : 'You will be redirected shortly.'

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="max-w-md w-full space-y-6 text-center p-10 bg-card rounded-lg shadow-lg border">
        <div className="flex justify-center">
          <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
            <svg 
              className="h-6 w-6 text-primary" 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" 
              />
            </svg>
          </div>
        </div>
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">
            {message}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {subMessage}
          </p>
        </div>
        <div className="flex justify-center">
          <svg 
            className="animate-spin h-6 w-6 text-primary" 
            xmlns="http://www.w3.org/2000/svg" 
            fill="none" 
            viewBox="0 0 24 24"
          >
            <circle 
              className="opacity-25" 
              cx="12" 
              cy="12" 
              r="10" 
              stroke="currentColor" 
              strokeWidth="4"
            />
            <path 
              className="opacity-75" 
              fill="currentColor" 
              d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
            />
          </svg>
        </div>
      </div>
    </div>
  )
}

export default function AuthGate({ children }: Props) {
  const [authStatus, setAuthStatus] = useState<AuthStatus>('checking')

  useEffect(() => {
    const run = async () => {
      if (typeof window === 'undefined') return
      
      // Skip auth check for auth routes
      if (window.location.pathname.startsWith('/auth/')) {
        setAuthStatus('authenticated')
        return
      }

      const supabase = createClient()
      const { data } = await supabase.auth.getSession()
      
      if (data.session) {
        setAuthStatus('authenticated')
      } else {
        setAuthStatus('redirecting')
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

  //  loading screen while checking credentials or redirecting
  if (authStatus === 'checking' || authStatus === 'redirecting') {
    return <AuthLoadingScreen status={authStatus} />
  }

  return <>{children}</>
}

