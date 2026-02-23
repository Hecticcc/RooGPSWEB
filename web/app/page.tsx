import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export default async function Home() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) redirect('/login');
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect('/devices');
  redirect('/login');
}
