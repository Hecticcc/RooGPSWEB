import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({
    request: { headers: request.headers },
  });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return response;

  // Collect cookies set by Supabase (e.g. on refresh) so we can forward them to the request
  // so the Route Handler / API sees the same session (fixes 401 on /api/devices etc.)
  type CookieEntry = { name: string; value: string; options?: Record<string, unknown> };
  const setCookies: CookieEntry[] = [];
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieEntry[]) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
          setCookies.push({ name, value, options });
        });
      },
    },
  });
  await supabase.auth.getUser();

  // Forward refreshed auth cookies to the request so the API route sees the session
  if (setCookies.length > 0) {
    const existing = request.cookies.getAll();
    const byName = new Map(existing.map((c) => [c.name, c.value]));
    setCookies.forEach(({ name, value }) => byName.set(name, value));
    const cookieHeader = Array.from(byName.entries())
      .map(([name, value]) => `${name}=${value}`)
      .join('; ');
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('cookie', cookieHeader);
    const res = NextResponse.next({
      request: { headers: requestHeaders },
    });
    setCookies.forEach(({ name, value, options }) => {
      res.cookies.set(name, value, options ?? { path: '/' });
    });
    return res;
  }
  return response;
}

export const config = {
  // Include /api so session is refreshed on API requests and response can set updated cookies
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
