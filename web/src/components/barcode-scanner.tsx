"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface BarcodeScannerProps {
  onScan: (code: string) => void;
  onClose: () => void;
}

export function BarcodeScanner({
  onScan,
  onClose,
}: BarcodeScannerProps) {
  const scannerRef = useRef<HTMLDivElement>(null);
  const html5QrCodeRef = useRef<unknown>(null);
  const stoppingRef = useRef(false);
  const [error, setError] = useState("");

  const stopScannerSafely = useCallback(
    async (scanner: {
      stop?: () => Promise<void>;
      clear?: () => Promise<void> | void;
      getState?: () => number;
    }) => {
      if (stoppingRef.current) return;
      stoppingRef.current = true;

      try {
        const state = scanner.getState?.();
        const canStop = state === undefined || state === 2 || state === 3;
        if (canStop && scanner.stop) {
          await scanner.stop().catch(() => {});
        }
      } finally {
        if (scanner.clear) {
          await Promise.resolve(scanner.clear()).catch(() => {});
        }
      }
    },
    [],
  );

  useEffect(() => {
    let mounted = true;

    async function start() {
      try {
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import("html5-qrcode");

        if (!mounted || !scannerRef.current) return;

        const scanner = new Html5Qrcode("barcode-scanner-region", {
          formatsToSupport: [
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
          ],
          verbose: false,
        });
        html5QrCodeRef.current = scanner;

        const config = {
          fps: 10,
          qrbox: { width: 280, height: 150 },
        };

        const onDecode = (decodedText: string) => {
          onScan(decodedText);
          void stopScannerSafely(scanner).finally(() => {
            onClose();
          });
        };

        const onDecodeError = () => {};

        try {
          await scanner.start({ facingMode: "environment" }, config, onDecode, onDecodeError);
        } catch (primaryErr) {
          const cameras = await Html5Qrcode.getCameras();
          if (!cameras.length) {
            throw primaryErr;
          }
          const preferredCamera = cameras.find((camera: { label: string }) =>
            /(back|rear|environment)/i.test(camera.label),
          );
          const selectedCamera = preferredCamera ?? cameras[0];
          await scanner.start(selectedCamera.id, config, onDecode, onDecodeError);
        }
      } catch (err: unknown) {
        if (mounted) {
          const message =
            err instanceof Error ? err.message : "Camera access failed";
          setError(message);
        }
      }
    }

    void start();

    return () => {
      mounted = false;
      const scanner = html5QrCodeRef.current as {
        stop?: () => Promise<void>;
        clear?: () => Promise<void> | void;
        getState?: () => number;
      } | null;
      if (scanner) {
        void stopScannerSafely(scanner);
      }
    };
  }, [onClose, onScan, stopScannerSafely]);

  return (
    <div className="scannerOverlay" onClick={onClose}>
      <div className="scannerModal" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>Scan Barcode</h3>
          <button className="button secondary" onClick={onClose} style={{ padding: "4px 12px" }}>
            &#10005;
          </button>
        </div>

        {error ? (
          <div className="badge badge--error" style={{ display: "block", marginBottom: 8 }}>
            <span className="badge__dot" />
            {error}
          </div>
        ) : null}

        <div id="barcode-scanner-region" ref={scannerRef} style={{ width: "100%" }} />

        <div className="muted" style={{ fontSize: 12, marginTop: 8, textAlign: "center" }}>
          Point your camera at a UPC barcode
        </div>
      </div>
    </div>
  );
}
