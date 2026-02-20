"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface BarcodeScannerDebugEvent {
  type:
    | "init"
    | "start"
    | "start-fallback"
    | "decode"
    | "decode-progress"
    | "stop"
    | "error";
  message: string;
  details?: Record<string, unknown>;
}

interface BarcodeScannerProps {
  onScan: (code: string) => void;
  onClose: () => void;
  debug?: boolean;
  onDebugEvent?: (event: BarcodeScannerDebugEvent) => void;
}

export function BarcodeScanner({
  onScan,
  onClose,
  debug = false,
  onDebugEvent,
}: BarcodeScannerProps) {
  const scannerRef = useRef<HTMLDivElement>(null);
  const html5QrCodeRef = useRef<unknown>(null);
  const decodeFailCountRef = useRef(0);
  const stoppingRef = useRef(false);
  const [error, setError] = useState("");

  const emitDebug = useCallback(
    (event: BarcodeScannerDebugEvent) => {
      if (!debug) return;
      onDebugEvent?.(event);
      // Keep console logging local to explicit debug mode.
      console.debug("[scanner]", event.type, event.message, event.details ?? {});
    },
    [debug, onDebugEvent],
  );

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
          emitDebug({ type: "stop", message: "Scanner stopped during cleanup" });
        }
      } finally {
        if (scanner.clear) {
          await Promise.resolve(scanner.clear()).catch(() => {});
        }
      }
    },
    [emitDebug],
  );

  useEffect(() => {
    let mounted = true;

    async function start() {
      try {
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import("html5-qrcode");

        if (!mounted || !scannerRef.current) return;
        emitDebug({ type: "init", message: "Scanner module loaded" });

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
          emitDebug({
            type: "decode",
            message: "Decode success",
            details: {
              raw: decodedText,
              length: decodedText.length,
            },
          });
          onScan(decodedText);
          void stopScannerSafely(scanner).finally(() => {
            onClose();
          });
        };

        const onDecodeError = () => {
          decodeFailCountRef.current += 1;
          if (debug && decodeFailCountRef.current % 25 === 0) {
            emitDebug({
              type: "decode-progress",
              message: `Still scanning (${decodeFailCountRef.current} decode misses)`,
            });
          }
        };

        try {
          await scanner.start({ facingMode: "environment" }, config, onDecode, onDecodeError);
          emitDebug({
            type: "start",
            message: "Scanner started with environment-facing camera",
          });
        } catch (primaryErr) {
          emitDebug({
            type: "start-fallback",
            message: "Environment camera start failed; trying available camera list",
            details: {
              error:
                primaryErr instanceof Error ? primaryErr.message : "unknown primary start error",
            },
          });

          const cameras = await Html5Qrcode.getCameras();
          if (!cameras.length) {
            throw primaryErr;
          }
          const preferredCamera = cameras.find((camera: { label: string }) =>
            /(back|rear|environment)/i.test(camera.label),
          );
          const selectedCamera = preferredCamera ?? cameras[0];
          await scanner.start(selectedCamera.id, config, onDecode, onDecodeError);
          emitDebug({
            type: "start",
            message: "Scanner started with fallback camera",
            details: {
              cameraLabel: selectedCamera.label,
              cameraId: selectedCamera.id,
              cameraCount: cameras.length,
            },
          });
        }
      } catch (err: unknown) {
        if (mounted) {
          const message =
            err instanceof Error ? err.message : "Camera access failed";
          setError(message);
          emitDebug({
            type: "error",
            message: "Scanner failed to start",
            details: { error: message },
          });
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
  }, [debug, emitDebug, onClose, onScan, stopScannerSafely]);

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
