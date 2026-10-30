"use client";
import { Scanner } from "@yudiel/react-qr-scanner";

/**
 * Camera-based QR scanner. Uses the device's back camera if available.
 * Calls onScan(value) the moment a QR is decoded.
 */
export function QrScanner({ onScan }: { onScan: (value: string) => void }) {
  return (
    <div className="rounded-xl overflow-hidden bg-zinc-900">
      <Scanner
        onScan={(detected) => {
          if (detected && detected.length > 0) {
            const v = detected[0].rawValue;
            if (v) onScan(v);
          }
        }}
        formats={["qr_code"]}
        constraints={{ facingMode: "environment" }}
        styles={{ container: { width: "100%", paddingTop: 0 } }}
      />
    </div>
  );
}
