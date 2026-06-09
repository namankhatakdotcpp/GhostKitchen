"use client";

import { MapPin, ChevronDown, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { INDIAN_CITIES } from "@/lib/indian-cities";

interface CitySearchProps {
  value: string;
  onChange: (city: string) => void;
  error?: string;
  placeholder?: string;
  className?: string;
}

export function CitySearch({
  value,
  onChange,
  error,
  placeholder = "Search city, town, or area…",
  className = "",
}: CitySearchProps) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Keep query in sync if parent resets value
  useEffect(() => { setQuery(value); }, [value]);

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return INDIAN_CITIES.slice(0, 8);
    return INDIAN_CITIES.filter((c) => c.toLowerCase().includes(q)).slice(0, 10);
  }, [query]);

  function select(city: string) {
    setQuery(city);
    onChange(city);
    setOpen(false);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    setQuery(e.target.value);
    onChange(""); // clear confirmed selection until user picks from list
    setOpen(true);
  }

  function handleClear() {
    setQuery("");
    onChange("");
    setOpen(false);
  }

  // Close on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        // If user typed but didn't select, revert to last confirmed value
        if (!value) setQuery("");
        else setQuery(value);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [value]);

  const isConfirmed = value !== "" && value === query;

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div
        className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 transition ${
          error
            ? "border-red-400 bg-red-50"
            : isConfirmed
            ? "border-green-400 bg-green-50"
            : open
            ? "border-[#FF5200] bg-white"
            : "border-[#E8E8E8] bg-white hover:border-[#FF5200]"
        }`}
      >
        <MapPin className={`h-4 w-4 flex-shrink-0 ${isConfirmed ? "text-green-500" : "text-[#93959F]"}`} />
        <input
          type="text"
          value={query}
          onChange={handleInputChange}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent text-sm text-[#1C1C1C] outline-none placeholder:text-[#93959F]"
        />
        {query ? (
          <button type="button" onClick={handleClear} className="flex-shrink-0 text-[#93959F] hover:text-[#1C1C1C]">
            <X className="h-4 w-4" />
          </button>
        ) : (
          <ChevronDown className={`h-4 w-4 flex-shrink-0 text-[#93959F] transition ${open ? "rotate-180" : ""}`} />
        )}
      </div>

      {open && suggestions.length > 0 && (
        <ul className="absolute z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-[#E8E8E8] bg-white shadow-lg">
          {query.trim() && !INDIAN_CITIES.some((c) => c.toLowerCase() === query.trim().toLowerCase()) && (
            <li className="px-4 py-2 text-xs text-[#93959F]">
              Select a city from the list below
            </li>
          )}
          {suggestions.map((city) => (
            <li key={city}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()} // prevent input blur before click
                onClick={() => select(city)}
                className={`flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm transition hover:bg-[#FFF3EE] ${
                  city === value ? "bg-[#FFF3EE] font-semibold text-[#FF5200]" : "text-[#1C1C1C]"
                }`}
              >
                <MapPin className="h-3.5 w-3.5 flex-shrink-0 text-[#93959F]" />
                {city}
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      {isConfirmed && !error && (
        <p className="mt-1 text-xs text-green-600">✓ {value}</p>
      )}
    </div>
  );
}
