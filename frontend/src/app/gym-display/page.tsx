"use client";

import { useState, useEffect, useCallback } from "react";
import { QRCodeSVG } from "qrcode.react";

/**
 * Gym Display Page — Full-screen rotating QR code for attendance.
 *
 * This page is meant to be displayed on a TV/tablet at the gym entrance.
 * It shows a QR code that members scan with their phone to open WhatsApp
 * and mark attendance.
 *
 * URL: /gym-display?gymId=<uuid>
 *
 * Features:
 * - Auto-refreshes the QR code every 30 seconds
 * - Full-screen dark mode (optimized for TV display)
 * - Shows the current code prominently (fallback for manual typing)
 * - No authentication required (public page)
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

interface QRDisplayData {
  gym_name: string;
  code: string;
  whatsapp_url: string;
  checkin_url?: string;
  refresh_in_seconds: number;
  message: string;
}

export default function GymDisplayPage() {
  const [data, setData] = useState<QRDisplayData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(30);
  const [gymId, setGymId] = useState<string | null>(null);

  // Get gymId from URL params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("gymId");
    if (!id) {
      setError("Missing gymId parameter. URL should be: /gym-display?gymId=YOUR_GYM_ID");
    } else {
      setGymId(id);
    }
  }, []);

  // Fetch QR data
  const fetchQRData = useCallback(async () => {
    if (!gymId) return;

    try {
      const response = await fetch(`${API_URL}/gym-display/${gymId}/qr-data`);
      if (!response.ok) {
        throw new Error(`Failed to fetch QR data: ${response.statusText}`);
      }
      const result: QRDisplayData = await response.json();
      setData(result);
      setTimeLeft(result.refresh_in_seconds);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load QR code");
    }
  }, [gymId]);

  // Initial fetch and auto-refresh
  useEffect(() => {
    if (!gymId) return;

    fetchQRData();

    // Refresh every 30 seconds
    const interval = setInterval(fetchQRData, 30_000);
    return () => clearInterval(interval);
  }, [gymId, fetchQRData]);

  // Countdown timer
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prev) => (prev > 0 ? prev - 1 : 30));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-8">
        <div className="text-center">
          <div className="text-red-400 text-2xl mb-4">⚠️ Error</div>
          <p className="text-gray-300 text-lg">{error}</p>
          <button
            onClick={fetchQRData}
            className="mt-6 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Loading state
  if (!data) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-gray-300 text-xl animate-pulse">
          Loading QR Code...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-6 select-none">
      {/* Gym Name */}
      <h1 className="text-white text-3xl md:text-5xl font-bold mb-2 text-center">
        {data.gym_name}
      </h1>

      {/* Instruction */}
      <p className="text-gray-400 text-lg md:text-xl mb-8 text-center">
        Scan this QR code with your phone to mark attendance
      </p>

      {/* QR Code — encodes the self-service check-in URL */}
      <div className="bg-white p-6 md:p-8 rounded-2xl shadow-2xl mb-8">
        <QRCodeSVG
          value={`${window.location.origin}/check-in/${gymId}?code=${data.code}`}
          size={280}
          level="M"
          includeMargin={false}
        />
      </div>

      {/* Current Code (fallback) */}
      <div className="text-center mb-6">
        <p className="text-gray-500 text-sm mb-1">Current Code</p>
        <p className="text-green-400 text-4xl md:text-5xl font-mono font-bold tracking-widest">
          {data.code}
        </p>
        <p className="text-gray-500 text-xs mt-2">
          Scan QR &rarr; Enter your registered phone/name/email &rarr; Done!
        </p>
      </div>

      {/* Timer */}
      <div className="flex items-center gap-2 text-gray-500">
        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
        <span className="text-sm">
          Code refreshes in {timeLeft}s
        </span>
      </div>

      {/* Instructions */}
      <div className="mt-10 text-center max-w-md">
        <div className="grid grid-cols-3 gap-4 text-gray-400 text-sm">
          <div className="flex flex-col items-center">
            <span className="text-2xl mb-1">📱</span>
            <span>Scan QR</span>
          </div>
          <div className="flex flex-col items-center">
            <span className="text-2xl mb-1">✍️</span>
            <span>Enter Details</span>
          </div>
          <div className="flex flex-col items-center">
            <span className="text-2xl mb-1">✅</span>
            <span>Checked In!</span>
          </div>
        </div>
      </div>
    </div>
  );
}
