"use client";

import { useEffect, useState } from "react";

export function SplashScreen({ onDone }: { onDone: () => void }) {
  const [hide, setHide] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setHide(true), 2200);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (hide) {
      const t = setTimeout(onDone, 400);
      return () => clearTimeout(t);
    }
  }, [hide, onDone]);

  return (
    <div
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-white transition-opacity duration-400 ${hide ? "opacity-0 pointer-events-none" : "opacity-100"}`}
    >
      {/* Road scene */}
      <div className="relative w-full max-w-sm h-48 select-none overflow-hidden">
        {/* Sky */}
        <div className="absolute inset-0 bg-white" />

        {/* Bridge / wires */}
        <svg
          className="absolute inset-0 w-full h-full"
          viewBox="0 0 400 180"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* road surface */}
          <rect x="0" y="148" width="400" height="32" fill="#F0F0F0" />
          {/* road line dashes */}
          <line x1="0" y1="164" x2="400" y2="164" stroke="#CCCCCC" strokeWidth="1.5" strokeDasharray="24 16" />

          {/* bridge pillars */}
          {[60, 200, 340].map((x) => (
            <g key={x}>
              <rect x={x - 4} y="60" width="8" height="88" fill="#D0D0D0" rx="2" />
              {/* suspension cables */}
              <path
                d={`M ${x} 60 Q ${x - 60} 30 ${x - 120} 60`}
                stroke="#C0C0C0" strokeWidth="1.5" fill="none"
              />
              <path
                d={`M ${x} 60 Q ${x + 60} 30 ${x + 120} 60`}
                stroke="#C0C0C0" strokeWidth="1.5" fill="none"
              />
              {/* vertical cable ties */}
              {[-90, -60, -30, 30, 60, 90].map((dx) => (
                <line
                  key={dx}
                  x1={x + dx} y1="44"
                  x2={x + dx} y2="148"
                  stroke="#D8D8D8" strokeWidth="0.8"
                />
              ))}
            </g>
          ))}
        </svg>

        {/* Rider SVG — rides across with CSS animation */}
        <div className="absolute bottom-[32px] rider-ride">
          <svg width="72" height="52" viewBox="0 0 72 52" fill="none" xmlns="http://www.w3.org/2000/svg">
            {/* scooter body */}
            <ellipse cx="36" cy="40" rx="28" ry="6" fill="#D1D5DB" />
            {/* wheels */}
            <circle cx="14" cy="43" r="8" fill="#374151" />
            <circle cx="14" cy="43" r="4" fill="#9CA3AF" />
            <circle cx="56" cy="43" r="8" fill="#374151" />
            <circle cx="56" cy="43" r="4" fill="#9CA3AF" />
            {/* scooter platform */}
            <path d="M10 35 Q36 28 60 35 L58 40 Q36 34 12 40Z" fill="#6B7280" />
            {/* handlebar */}
            <path d="M54 25 L60 22 L62 28" stroke="#374151" strokeWidth="2.5" strokeLinecap="round" fill="none" />
            {/* rider body */}
            <rect x="30" y="10" width="18" height="24" rx="6" fill="#F97316" />
            {/* rider head */}
            <circle cx="39" cy="8" r="7" fill="#F97316" />
            {/* helmet */}
            <path d="M32 7 Q39 0 46 7 L45 10 Q39 6 33 10Z" fill="#1F2937" />
            {/* delivery box */}
            <rect x="14" y="18" width="18" height="16" rx="3" fill="#1F2937" />
            <text x="17" y="30" fontSize="8" fill="#F97316" fontWeight="bold">GK</text>
            {/* rider arm */}
            <path d="M48 22 Q56 24 60 22" stroke="#F97316" strokeWidth="3" strokeLinecap="round" fill="none" />
          </svg>
        </div>
      </div>

      {/* Logo */}
      <div className="mt-2 text-[28px] font-extrabold tracking-tight">
        <span className="text-[#1C1C1C]">ghost</span>
        <span className="text-[#FF5200]">kitchen</span>
      </div>
      <p className="mt-1 text-sm text-[#686B78]">Delivering happiness</p>

      <style>{`
        @keyframes rideAcross {
          0%   { transform: translateX(-90px); }
          100% { transform: translateX(420px); }
        }
        .rider-ride {
          animation: rideAcross 2s linear forwards;
        }
      `}</style>
    </div>
  );
}
