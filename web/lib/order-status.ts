/** Order status flow: pending → paid → fulfilled (Stock Assigned) → processing → shipped → activated. Cancelled is terminal. */
export const ORDER_PROGRESS_STEPS = ['pending', 'paid', 'fulfilled', 'processing', 'shipped', 'activated'] as const;
export type OrderProgressStep = (typeof ORDER_PROGRESS_STEPS)[number];

const LABELS: Record<string, string> = {
  pending: 'Pending payment',
  paid: 'Paid',
  fulfilled: 'Stock Assigned',
  processing: 'Processing',
  shipped: 'Shipped',
  activated: 'Activated',
  cancelled: 'Cancelled',
};

export function getStatusLabel(status: string): string {
  return LABELS[status] ?? status;
}

export function getStatusStepIndex(status: string): number {
  const i = ORDER_PROGRESS_STEPS.indexOf(status as OrderProgressStep);
  return i >= 0 ? i : -1;
}

export function isCancelled(status: string): boolean {
  return status === 'cancelled';
}

/** Admin UI: CSS class for status badge colour (e.g. admin-badge--status-paid) */
export function getStatusBadgeClass(status: string): string {
  const s = status?.toLowerCase();
  if (['pending', 'paid', 'fulfilled', 'processing', 'shipped', 'activated', 'cancelled'].includes(s))
    return `admin-badge admin-badge--status-${s}`;
  return 'admin-badge admin-badge--muted';
}

/** Customer My Orders card: pill class for status (order-card-status--paid etc.) */
export function getOrderCardStatusClass(status: string): string {
  const s = status?.toLowerCase();
  if (['pending', 'paid', 'fulfilled', 'processing', 'shipped', 'activated', 'cancelled'].includes(s))
    return `order-card-status order-card-status--${s}`;
  return 'order-card-status order-card-status--muted';
}
