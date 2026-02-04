'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function UnauthorizedPage() {
  useEffect(() => {
    // Ensure user is signed out
    const supabase = createClient()
    supabase.auth.signOut()
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="max-w-md w-full mx-4 p-8 bg-card rounded-xl shadow-lg border text-center">
        <div className="mb-6">
          <svg
            className="w-16 h-16 text-destructive mx-auto"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-foreground mb-4">
          Unauthorized Domain
        </h1>
        <p className="text-muted-foreground mb-6">
          Access to Veston is restricted to authorized domains only.
          <br />
          <br />
          Please sign in with a <strong>@vestatelemed.com</strong> or{' '}
          <strong>@vestasolutions.com</strong> email address.
        </p>
        <a
          href="/"
          className="inline-flex items-center justify-center rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          Try Again
        </a>
      </div>
    </div>
  )
}
