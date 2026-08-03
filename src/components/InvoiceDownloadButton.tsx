"use client";

import { useState } from "react";

type InvoiceDownloadButtonProps = {
  rideId: string;
};

export default function InvoiceDownloadButton({ rideId }: InvoiceDownloadButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDownload() {
    setError(null);
    setLoading(true);

    try {
      const response = await fetch(`/api/invoice/${rideId}`, {
        method: "GET",
        credentials: "include",
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `Download failed (${response.status})`);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `invoice-${rideId}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to download invoice.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="stack" style={{ gap: 8 }}>
      <button className="btn btn-ghost" type="button" onClick={handleDownload} disabled={loading}>
        {loading ? "Downloading..." : "Download invoice"}
      </button>
      {error ? (
        <div className="alert">
          <strong>Error:</strong> {error}
        </div>
      ) : null}
    </div>
  );
}
