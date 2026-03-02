import { redirect } from 'next/navigation';

export default function AdminVouchersRedirect() {
  redirect('/admin/pricing/vouchers');
}
