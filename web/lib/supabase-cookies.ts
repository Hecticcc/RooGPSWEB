/** Project ref from NEXT_PUBLIC_SUPABASE_URL (e.g. https://xxx.supabase.co -> xxx) */
export function getSupabaseProjectRef(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const match = url.match(/^https:\/\/([^.]+)\.supabase\.co/);
  return match ? match[1] : null;
}

/** Only pass cookies for the current Supabase project so multiple sb-*-auth-token cookies don't break getUser() */
export function filterCookiesForProject(
  cookieList: { name: string; value: string }[],
  projectRef: string | null
): { name: string; value: string }[] {
  if (!projectRef) return cookieList;
  const prefix = `sb-${projectRef}-`;
  return cookieList.filter(
    (c) => c.name === prefix + 'auth-token' || c.name.startsWith(prefix + 'auth-token.')
  );
}
