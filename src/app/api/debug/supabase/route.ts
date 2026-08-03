import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const keyInfo = key ? { present: true, length: key.length, prefix: `${key.slice(0, 8)}...` } : { present: false };

    // Try to create the service client if the key exists
    if (!key) {
      return NextResponse.json({ success: false, error: 'SUPABASE_SERVICE_ROLE_KEY missing', keyInfo }, { status: 500 });
    }

    const supabase = createServiceRoleClient();

    const [ridesRes, paymentsRes, rideMessagesRes] = await Promise.all([
      supabase
        .from('rides')
        .select('id,status,final_fare_cents,platform_fee_cents,driver_payout_cents,payment_status')
        .order('completed_at', { ascending: false })
        .limit(5),
      supabase
        .from('payments')
        .select('id,ride_id,user_id,amount_cents,status,created_at')
        .order('created_at', { ascending: false })
        .limit(10),
      supabase
        .from('ride_messages')
        .select('id,ride_id')
        .limit(5),
    ]);

    const [ridesData, paymentsData, rideMessagesData] = [ridesRes.data, paymentsRes.data, rideMessagesRes.data];
    const errors = {
      rides: ridesRes.error
        ? { message: ridesRes.error.message, details: ridesRes.error.details, hint: ridesRes.error.hint, code: ridesRes.error.code }
        : null,
      payments: paymentsRes.error
        ? { message: paymentsRes.error.message, details: paymentsRes.error.details, hint: paymentsRes.error.hint, code: paymentsRes.error.code }
        : null,
      ride_messages: rideMessagesRes.error
        ? { message: rideMessagesRes.error.message, details: rideMessagesRes.error.details, hint: rideMessagesRes.error.hint, code: rideMessagesRes.error.code }
        : null,
    };

    if (ridesRes.error || paymentsRes.error || rideMessagesRes.error) {
      return NextResponse.json({ success: false, errors, keyInfo }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      rides: ridesData ?? [],
      payments: paymentsData ?? [],
      ride_messages: rideMessagesData ?? [],
      keyInfo,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: String(err?.message ?? err) }, { status: 500 });
  }
}

export async function POST() {
  // Direct REST test using fetch to the Supabase REST endpoint with the provided key
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !key) {
      return NextResponse.json({ success: false, error: 'Missing SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL' }, { status: 500 });
    }

    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
    const url = `${supabaseUrl}/rest/v1/rides?select=id&limit=1`;
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${key}`,
        // apikey should be the public anon key for REST requests; use anon if available.
        apikey: anon ?? key,
        Accept: 'application/json',
      },
    });

    const text = await res.text();
    return NextResponse.json({ success: res.ok, status: res.status, body: text.slice(0, 2000) });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: String(err?.message ?? err) }, { status: 500 });
  }
}
