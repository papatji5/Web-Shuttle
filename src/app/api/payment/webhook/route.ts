import { createServiceRoleClient } from '@/lib/supabase/server';
import Stripe from 'stripe';

export const runtime = 'edge';

export async function POST(req: Request) {
  const stripeSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  const stripeKey = process.env.STRIPE_SECRET_KEY?.trim();

  if (!stripeKey) {
    return new Response(JSON.stringify({ error: 'Stripe secret key not configured' }), { status: 500 });
  }

  const stripe = new Stripe(stripeKey);

  // Read raw body for signature verification
  const buf = await req.arrayBuffer();
  const rawBody = Buffer.from(buf);
  const sig = req.headers.get('stripe-signature') || '';

  let event: Stripe.Event;

  try {
    if (stripeSecret) {
      event = stripe.webhooks.constructEvent(rawBody, sig, stripeSecret);
    } else {
      // If no webhook secret is configured, attempt to parse body (less secure)
      event = JSON.parse(new TextDecoder().decode(rawBody));
    }
  } catch (err: any) {
    return new Response(JSON.stringify({ error: `Webhook signature verification failed: ${String(err?.message ?? err)}` }), { status: 400 });
  }

  // Handle checkout session completed events
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;

    // Retrieve full session to get amount_total and metadata
    try {
      const full = await stripe.checkout.sessions.retrieve(session.id, { expand: ['payment_intent'] });
      const amount = (full.amount_total ?? 0) as number;
      const rideId = (full.metadata as any)?.ride_id ?? null;
      const userId = (full.metadata as any)?.user_id ?? null;

      const supabase = createServiceRoleClient();

      // Update or insert payment record
      try {
        await supabase.from('payments').upsert({
          ride_id: rideId,
          user_id: userId,
          provider: 'stripe',
          provider_reference: session.id,
          amount_cents: amount,
          status: 'PAID',
          paid_at: new Date().toISOString(),
        }, { onConflict: 'provider_reference' });
      } catch (e) {
        // ignore
      }

      // Calculate split and update ride
      const platformFee = Math.round((amount ?? 0) * 0.2);
      const driverPayout = (amount ?? 0) - platformFee;

      try {
        await supabase
          .from('rides')
          .update({
            payment_status: 'PAID',
            final_fare_cents: amount,
            platform_fee_cents: platformFee,
            driver_payout_cents: driverPayout,
          })
          .eq('id', rideId);
      } catch (e) {
        // ignore
      }
    } catch (e) {
      // ignore
    }
  }

  return new Response(JSON.stringify({ received: true }), { status: 200 });
}
