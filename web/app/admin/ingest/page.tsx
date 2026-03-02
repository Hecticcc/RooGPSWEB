import { redirect } from 'next/navigation';

export default function AdminIngestRedirect() {
  redirect('/admin/system/ingest');
}
