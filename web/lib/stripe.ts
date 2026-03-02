import Stripe from 'stripe';

const secretKey = process.env.STRIPE_SECRET_KEY;

/**
 * Server-only Stripe instance. Use in API routes; never expose secret key to the client.
 */
export function getStripeServer(): Stripe | null {
  if (!secretKey || !secretKey.startsWith('sk_')) return null;
  return new Stripe(secretKey);
}

/** Stripe Product ID for SIM plans; recurring prices are created from product_pricing (DB) under this product. */
export const STRIPE_PRODUCT_SIM = process.env.STRIPE_PRODUCT_SIM ?? '';
export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? '';
