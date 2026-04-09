import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Copy, Check } from "lucide-react";

interface Coupon {
  code: string;
  discountType: string;
  discountValue: number;
  minOrder: number;
  expiresAt: string;
  availableUses: number;
}

export default function AvailableCoupons() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  useEffect(() => {
    fetchCoupons();
  }, []);

  const fetchCoupons = async () => {
    try {
      setLoading(false);
      const response = await api.get("/coupons/active");
      setCoupons(response.data.coupons);
    } catch (error) {
      console.error("Failed to fetch coupons:", error);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  if (loading) {
    return <div className="text-center py-4 text-gray-500">Loading coupons...</div>;
  }

  if (coupons.length === 0) {
    return null; // Don't show section if no active coupons
  }

  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-gray-900">Available Offers</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {coupons.map((coupon) => (
          <div key={coupon.code} className="border-2 border-dashed border-orange-200 rounded-lg p-4 hover:bg-orange-50 transition">
            <div className="flex items-start justify-between mb-2">
              <div>
                <p className="font-bold text-orange-600 text-lg">
                  {coupon.discountType === "PERCENTAGE"
                    ? `${coupon.discountValue}% OFF`
                    : `₹${coupon.discountValue} OFF`}
                </p>
                <p className="text-xs text-gray-600 mt-1">Min order: ₹{coupon.minOrder}</p>
              </div>
              <button
                onClick={() => copyToClipboard(coupon.code)}
                className="p-2 hover:bg-white rounded transition"
              >
                {copiedCode === coupon.code ? (
                  <Check className="h-4 w-4 text-green-600" />
                ) : (
                  <Copy className="h-4 w-4 text-gray-600" />
                )}
              </button>
            </div>
            <p className="font-mono font-bold text-sm text-gray-900 mb-2">{coupon.code}</p>
            <p className="text-xs text-gray-500">
              {coupon.availableUses} uses left • Expires{" "}
              {new Date(coupon.expiresAt).toLocaleDateString()}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
