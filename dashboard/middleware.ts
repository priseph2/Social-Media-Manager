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
  if (user && isLoginOrSignup) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  // /admin routes require super_admin role
  if (pathname.startsWith('/admin')) {
    const role = (user?.app_metadata as { role?: string })?.role;
    if (role !== 'super_admin') {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/).*)'],
};
