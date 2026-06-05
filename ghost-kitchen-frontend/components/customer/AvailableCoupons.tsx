"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface Coupon {
  code: string;
  description: string | null;
  discountType: string;
  discountValue: number;
  minOrder: number;
  expiresAt: string;
}

interface Props {
  restaurantId?: string;
  onSelect?: (code: string) => void;
}

export default function AvailableCoupons({ restaurantId, onSelect }: Props) {
  const [coupons, setCoupons] = useState<Coupon[]>([]);

  useEffect(() => {
    const params = restaurantId ? `?restaurantId=${restaurantId}` : "";
    api
      .get(`/coupons/available${params}`)
      .then((r) => setCoupons(r.data.coupons ?? []))
      .catch(() => {});
  }, [restaurantId]);

  if (coupons.length === 0) return null;

  return (
    <div className="space-y-2 pt-1">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Available offers</p>
      <div className="flex flex-wrap gap-2">
        {coupons.map((c) => (
          <button
            key={c.code}
            type="button"
            onClick={() => onSelect?.(c.code)}
            className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-orange-300 bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-700 hover:bg-orange-100 transition"
          >
            <span className="font-mono">{c.code}</span>
            <span className="text-orange-500">—</span>
            <span>
              {c.discountType === "PERCENTAGE"
                ? `${c.discountValue}% off`
                : `₹${(c.discountValue / 100).toFixed(0)} off`}{" "}
              {c.minOrder > 0 && `above ₹${(c.minOrder / 100).toFixed(0)}`}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
