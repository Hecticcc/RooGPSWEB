import { createBrowserClient } from '@supabase/ssr';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (typeof window !== 'undefined' && (!url || !key)) {
  console.error(
    'Missing Supabase env: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in your host (e.g. Netlify → Site settings → Environment variables), then redeploy.'
  );
}

export function createClient() {
  return createBrowserClient(url ?? '', key ?? '');
}
