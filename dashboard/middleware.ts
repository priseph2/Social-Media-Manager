import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  const { pathname } = request.nextUrl;

  const isLoginOrSignup = pathname.startsWith('/login') || pathname.startsWith('/signup');

  // Unauthenticated users may only access login and signup
  if (!user && !isLoginOrSignup) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Authenticated users don't need login/signup — but /onboarding is allowed
  // (dashboard layout redirects tenantless users to /onboarding; middleware must not
  // redirect them back to /dashboard, which would create an infinite loop)
  if (user && isLoginOrSignup) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return supabaseResponse;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/).*)'],
};
