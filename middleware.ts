import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import {  isAllowedDomain } from '@/lib/auth-utils'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: any) {
          request.cookies.set({ name, value, ...options })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({ name, value, ...options })
        },
        remove(name: string, options: any) {
          request.cookies.set({ name, value: '', ...options })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({ name, value: '', ...options })
        },
      },
    }
  )

  // Skip domain check for auth callback and unauthorized page
  if (request.nextUrl.pathname.startsWith('/auth/callback') || 
      request.nextUrl.pathname.startsWith('/auth/unauthorized')) {
    return response
  }

  const { data: { user } } = await supabase.auth.getUser()

  // If user is logged in, check domain restriction
  if (user?.email) {
    if (!isAllowedDomain(user.email)) {
      // Sign out the unauthorized user
      await supabase.auth.signOut()
      
      // Redirect to a custom unauthorized page or login with error
      const url = request.nextUrl.clone()
      url.pathname = '/auth/unauthorized'
      return NextResponse.redirect(url)
    }
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
