"use client";

import { useEffect, useState } from "react";

type VerifyStripeProps = {
  sessionId: string;
};

export default function VerifyStripe({ sessionId }: VerifyStripeProps) {
  const [statusMessage, setStatusMessage] = useState("Verifying payment...");
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    let canceled = false;

    async function verify() {
      try {
        const response = await fetch("/api/payment/verify-stripe", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({ sessionId }),
        });

        if (response.ok) {
          if (canceled) return;
          setStatusMessage("Payment successful. Returning to your ride...");
          setIsComplete(true);
          window.setTimeout(() => {
            if (!canceled) {
              window.location.href =
                "/passenger?msg=" +
                encodeURIComponent(
                  "Payment successful! Your ride has been confirmed. A driver will be assigned shortly."
                );
            }
          }, 1200);
          return;
        }

        const data = await response.json().catch(() => null);
        if (canceled) return;
        setStatusMessage(data?.error ?? "Payment verification failed.");
      } catch (error) {
        if (canceled) return;
        if (error instanceof Error) {
          setStatusMessage(error.message);
        } else {
          setStatusMessage("Payment verification failed.");
        }
      }
    }

    verify();

    return () => {
      canceled = true;
    };
  }, [sessionId]);

  return (
    <div className="alert">
      <strong>Payment status:</strong> {statusMessage}
      {isComplete ? <div className="mt-2 text-sm text-emerald-300">You can continue once you are redirected back to the passenger page.</div> : null}
    </div>
  );
}
