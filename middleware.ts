import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

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
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value,
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value,
            ...options,
          })
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value: '',
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value: '',
            ...options,
          })
        },
      },
    }
  )

  const {
    data: { session },
  } = await supabase.auth.getSession()

  // Protect chat routes
  // Check all cookies for any Supabase auth-related cookies
  // This helps when cookies are being set but session hasn't synced yet
  const allCookies = request.cookies.getAll()
  const hasSupabaseCookie = allCookies.some(cookie => 
    cookie.name.includes('supabase') || 
    cookie.name.includes('sb-') ||
    cookie.name.includes('auth-token') ||
    cookie.name.includes('access-token') ||
    cookie.name.includes('refresh-token')
  )
  
  // Check if user just logged in (via cookie or referer)
  const referer = request.headers.get('referer')
  const isFromLogin = referer?.includes('/login')
  const isFromChat = referer?.includes('/chat') // Navigation within chat
  const justLoggedIn = request.cookies.get('justLoggedIn')?.value === 'true'
  
  // For chat routes, protect them properly:
  // - Always allow if session exists
  // - Allow if Supabase cookies exist (session might be syncing)
  // - Allow if coming from login (just logged in)
  // - Allow if navigating within chat (user is already in chat area)
  // - Redirect to login if direct access without auth
  if (request.nextUrl.pathname.startsWith('/chat')) {
    const shouldAllow = session || 
                       hasSupabaseCookie || 
                       isFromLogin || 
                       justLoggedIn || 
                       isFromChat
    
    // If no session and no cookies, redirect to login
    // Exception: allow if navigating within chat (referer includes /chat)
    // This prevents redirect loops while still protecting direct access
    if (!shouldAllow) {
      // If coming from within the app (same origin), allow (client will handle)
      // If direct access or from outside, redirect to login
      if (!referer || !referer.includes(request.nextUrl.origin)) {
        // Direct access without auth - redirect to login
        return NextResponse.redirect(new URL('/login', request.url))
      }
      // If referer is from same origin but not /chat or /login, still redirect
      if (referer && !referer.includes('/chat') && !referer.includes('/login')) {
        return NextResponse.redirect(new URL('/login', request.url))
      }
    }
  }
  
  // Clear the justLoggedIn cookie after checking (one-time use)
  if (justLoggedIn) {
    response.cookies.set('justLoggedIn', '', { maxAge: 0 })
  }
  
  // If coming from login but no session yet, allow access (cookies might be syncing)
  // The client-side will handle showing appropriate UI if session is missing

  // Don't automatically redirect from /login to avoid redirect loops
  // Let the client-side handle navigation after successful login
  // This prevents issues when cookies are still syncing

  // Redirect root to appropriate page based on auth status
  if (request.nextUrl.pathname === '/') {
    if (session) {
      return NextResponse.redirect(new URL('/chat', request.url))
    } else {
      return NextResponse.redirect(new URL('/login', request.url))
    }
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}


