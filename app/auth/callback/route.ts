import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { isAllowedDomain } from '@/lib/auth-utils'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const origin = requestUrl.origin

  if (code) {
    const cookieStore = await cookies()
    
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value
          },
          set(name: string, value: string, options: any) {
            cookieStore.set({ name, value, ...options })
          },
          remove(name: string, options: any) {
            cookieStore.delete({ name, ...options })
          },
        },
      }
    )

    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (error) {
      console.error('Auth callback error:', error.message)
      // Redirect to home to retry,
      return NextResponse.redirect(`${origin}/?error=auth_exchange_failed`)
    }

    // Check domain restriction
    if (data?.user?.email) {
      console.log('User authenticated via route handler:', data.user.email)
      if (!isAllowedDomain(data.user.email)) {
        console.warn(`Unauthorized domain login attempt: ${data.user.email}`)
        await supabase.auth.signOut()
        return NextResponse.redirect(`${origin}/auth/unauthorized`)
      }
    }
  }

  // Redirect to the home  after successful authentication
  return NextResponse.redirect(origin)
}
