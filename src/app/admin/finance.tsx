import { createServiceRoleClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth/require';

export default async function AdminFinance() {
  await requireRole('ADMIN');

  let supabase;
  try {
    supabase = createServiceRoleClient();
  } catch (envError) {
    return (
      <div className="card">
        <h2>Finance</h2>
        <div className="alert">
          {envError instanceof Error ? envError.message : String(envError)}
        </div>
      </div>
    );
  }

  const [{ data: rides, error: ridesError }, { data: payments, error: paymentsError }] = await Promise.all([
    supabase
      .from('rides')
      .select('id,passenger_id,driver_id,status,completed_at,estimated_fare_cents,final_fare_cents,platform_fee_cents,driver_payout_cents,payment_status')
      .eq('payment_status', 'PAID')
      .order('completed_at', { ascending: false })
      .limit(50),
    supabase
      .from('payments')
      .select('id,ride_id,user_id,provider,provider_reference,amount_cents,status,paid_at,created_at')
      .eq('status', 'PAID')
      .order('created_at', { ascending: false })
      .limit(20),
  ]);

  if (ridesError || paymentsError) {
    return (
      <div className="card">
        <h2>Finance</h2>
        <div className="alert">
          Failed to load finance data: {ridesError?.message ?? paymentsError?.message}
        </div>
      </div>
    );
  }

  const completedRides = rides ?? [];
  const recentPayments = payments ?? [];
  const totalPlatform = completedRides.reduce((sum, ride) => sum + (ride.platform_fee_cents ?? 0), 0);
  const totalDriver = completedRides.reduce((sum, ride) => sum + (ride.driver_payout_cents ?? 0), 0);
  const totalGross = completedRides.reduce((sum, ride) => sum + (ride.final_fare_cents ?? ride.estimated_fare_cents ?? 0), 0);

  const formatZar = (value: number) =>
    new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(value / 100);

  return (
    <div className="card stack">
      <h2>Finance overview</h2>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card p-4">
          <p className="text-sm uppercase text-slate-400">Gross revenue</p>
          <p className="text-2xl font-semibold">{formatZar(totalGross)}</p>
        </div>
        <div className="card p-4">
          <p className="text-sm uppercase text-slate-400">Platform revenue</p>
          <p className="text-2xl font-semibold">{formatZar(totalPlatform)}</p>
        </div>
        <div className="card p-4">
          <p className="text-sm uppercase text-slate-400">Driver payouts</p>
          <p className="text-2xl font-semibold">{formatZar(totalDriver)}</p>
        </div>
      </div>

      <div className="stack">
        <h3>Recent completed rides</h3>
        {completedRides.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm text-slate-200">
              <thead>
                <tr>
                  <th className="px-3 py-2">Ride</th>
                  <th className="px-3 py-2">Gross</th>
                  <th className="px-3 py-2">Platform</th>
                  <th className="px-3 py-2">Driver</th>
                  <th className="px-3 py-2">Payment</th>
                </tr>
              </thead>
              <tbody>
                {completedRides.map((ride) => (
                  <tr key={ride.id} className="border-t border-white/10">
                    <td className="px-3 py-2">{ride.id.slice(0, 8)}</td>
                    <td className="px-3 py-2">{formatZar(Number(ride.final_fare_cents ?? ride.estimated_fare_cents ?? 0))}</td>
                    <td className="px-3 py-2">{formatZar(Number(ride.platform_fee_cents ?? 0))}</td>
                    <td className="px-3 py-2">{formatZar(Number(ride.driver_payout_cents ?? 0))}</td>
                    <td className="px-3 py-2">{ride.payment_status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">No completed rides yet.</p>
        )}
      </div>

      <div className="stack">
        <h3>Recent payments</h3>
        {recentPayments.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm text-slate-200">
              <thead>
                <tr>
                  <th className="px-3 py-2">Payment</th>
                  <th className="px-3 py-2">Ride</th>
                  <th className="px-3 py-2">Amount</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Method</th>
                  <th className="px-3 py-2">Paid at</th>
                </tr>
              </thead>
              <tbody>
                {recentPayments.map((payment) => (
                  <tr key={payment.id} className="border-t border-white/10">
                    <td className="px-3 py-2">{payment.id.slice(0, 8)}</td>
                    <td className="px-3 py-2">{payment.ride_id?.slice(0, 8) ?? '-'}</td>
                    <td className="px-3 py-2">{formatZar(Number(payment.amount_cents ?? 0))}</td>
                    <td className="px-3 py-2">{payment.status}</td>
                    <td className="px-3 py-2">{payment.provider?.toUpperCase() ?? '-'}</td>
                    <td className="px-3 py-2">{payment.paid_at ? new Date(payment.paid_at).toLocaleString() : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">No payments yet.</p>
        )}
      </div>
    </div>
  );
}
