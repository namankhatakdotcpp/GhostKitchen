import { useState } from "react";
import { api } from "@/lib/api";
import { AlertCircle, Check, Tag } from "lucide-react";

interface CouponInputProps {
  orderTotal: number;
  onCouponApplied?: (discount: number, finalAmount: number) => void;
  onError?: (error: string) => void;
}

export default function CouponInput({ orderTotal, onCouponApplied, onError }: CouponInputProps) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [applied, setApplied] = useState(false);
  const [discount, setDiscount] = useState(0);
  const [finalAmount, setFinalAmount] = useState(orderTotal);
  const [error, setError] = useState("");

  const handleApply = async () => {
    if (!code.trim()) {
      setError("Please enter a coupon code");
      return;
    }

    try {
      setLoading(true);
      setError("");
      
      const response = await api.post("/coupons/validate", {
        code: code.toUpperCase(),
        orderTotal,
      });

      const { discountAmount, finalAmount: newFinalAmount } = response.data.coupon;
      
      setDiscount(discountAmount);
      setFinalAmount(newFinalAmount);
      setApplied(true);
      
      onCouponApplied?.(discountAmount, newFinalAmount);
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || "Invalid coupon code";
      setError(errorMsg);
      onError?.(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = () => {
    setCode("");
    setApplied(false);
    setDiscount(0);
    setFinalAmount(orderTotal);
    setError("");
    onCouponApplied?.(0, orderTotal);
  };

  if (applied) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
        <div className="flex items-start justify-between">
          <div className="flex gap-3">
            <Check className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-green-900">Coupon Applied</p>
              <p className="text-sm text-green-700 mt-1">
                Discount: ₹{discount.toFixed(2)} | Final: ₹{finalAmount.toFixed(2)}
              </p>
            </div>
          </div>
          <button
            onClick={handleRemove}
            className="text-green-600 hover:text-green-700 font-medium text-sm"
          >
            Remove
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-gray-700">Have a coupon code?</label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Tag className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={code}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase());
              setError("");
            }}
            placeholder="Enter coupon code"
            className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
            disabled={loading}
          />
        </div>
        <button
          onClick={handleApply}
          disabled={loading || !code.trim()}
          className="px-6 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:bg-gray-400 font-medium transition"
        >
          {loading ? "Validating..." : "Apply"}
        </button>
      </div>
      
      {error && (
        <div className="flex gap-2 text-red-600 text-sm">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}
    </div>
  );
}
