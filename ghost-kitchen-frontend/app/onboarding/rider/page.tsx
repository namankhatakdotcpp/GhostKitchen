"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import api from "@/lib/api";
import { useUserStore } from "@/store/userStore";

const VEHICLE_TYPES = [
  { id: "CYCLE", emoji: "🚲", label: "Bicycle", note: "Great for short distances, eco-friendly", color: "green" },
  { id: "SCOOTER", emoji: "🛵", label: "Scooter", note: "Best for urban delivery, most popular", color: "blue" },
  { id: "BIKE", emoji: "🏍️", label: "Motorbike", note: "Highest earning, wider delivery radius", color: "orange" },
] as const;

export default function RiderOnboarding() {
  const router = useRouter();
  const { user, setUser } = useUserStore();

  const [vehicleType, setVehicleType] = useState<string>("SCOOTER");
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [city, setCity] = useState("");
  const [profilePhotoUrl, setProfilePhotoUrl] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  function validate() {
    const errs: Record<string, string> = {};
    if (!vehicleNumber.trim()) errs.vehicleNumber = "Vehicle number is required";
    if (!agreed) errs.agreed = "You must agree to the terms";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    setError("");
    try {
      const res = await api.post("/role/register-rider", {
        vehicleType,
        vehicleNumber: vehicleNumber.toUpperCase(),
        city,
      });
      const { token } = res.data;
      if (user) {
        setUser({ ...user, roles: ["CUSTOMER", "DELIVERY"], secondRole: "DELIVERY", activeRole: "DELIVERY" });
      }
      setSuccess(true);
      setTimeout(() => router.push("/delivery/home"), 2000);
    } catch (err: any) {
      setError(err.response?.data?.message ?? "Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-blue-50 px-4">
        <div className="text-center max-w-sm">
          <div className="text-6xl mb-4">🏍️</div>
          <h1 className="text-3xl font-bold text-[#1C1C1C]">You&apos;re a GhostKitchen rider!</h1>
          <p className="mt-2 text-[#686B78]">Redirecting to your dashboard…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F5F5] px-4 py-8">
      <div className="mx-auto max-w-md">
        <div className="mb-6">
          <a href="/" className="text-2xl font-extrabold tracking-tight">
            <span className="text-[#1C1C1C]">ghost</span><span className="text-[#FF5200]">kitchen</span>
          </a>
          <p className="mt-1 text-sm text-[#686B78]">Become a delivery partner</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Pre-filled user info */}
          <div className="rounded-2xl border border-[#E8E8E8] bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold text-[#1C1C1C] mb-3">Your details</h2>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-[#686B78]">Name</span>
                <span className="font-medium">{user?.name ?? "—"}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[#686B78]">Email</span>
                <span className="font-medium">{user?.email ?? "—"}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[#686B78]">Phone</span>
                <span className="font-medium">{user?.phone ?? "Not set"}</span>
              </div>
            </div>
          </div>

          {/* Vehicle type */}
          <div className="rounded-2xl border border-[#E8E8E8] bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold text-[#1C1C1C] mb-3">Choose your vehicle</h2>
            <div className="space-y-3">
              {VEHICLE_TYPES.map((v) => {
                const colorMap = {
                  green: "border-green-400 bg-green-50",
                  blue: "border-blue-400 bg-blue-50",
                  orange: "border-[#FF5200] bg-orange-50",
                };
                const isSelected = vehicleType === v.id;
                return (
                  <button key={v.id} type="button" onClick={() => setVehicleType(v.id)}
                    className={`w-full flex items-center gap-4 rounded-xl border-2 p-4 text-left transition ${isSelected ? colorMap[v.color] : "border-[#E8E8E8] bg-white hover:border-gray-300"}`}>
                    <span className="text-3xl">{v.emoji}</span>
                    <div>
                      <p className={`text-sm font-semibold ${isSelected ? "text-[#1C1C1C]" : "text-[#1C1C1C]"}`}>{v.label}</p>
                      <p className="text-xs text-[#686B78]">{v.note}</p>
                    </div>
                    {isSelected && (
                      <svg className="ml-auto h-5 w-5 text-[#FF5200]" fill="none" viewBox="0 0 20 20">
                        <path d="M4 10l4.5 4.5L16 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Vehicle number */}
          <div className="rounded-2xl border border-[#E8E8E8] bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold text-[#1C1C1C] mb-3">Vehicle details</h2>
            <div>
              <label className="block text-sm font-semibold text-[#1C1C1C] mb-1">Number plate *</label>
              <input value={vehicleNumber} onChange={e => setVehicleNumber(e.target.value.toUpperCase())}
                className="w-full rounded-xl border border-[#E8E8E8] px-4 py-2.5 text-sm font-mono tracking-widest uppercase focus:border-[#FF5200] focus:outline-none"
                placeholder="DL 01 AB 1234" maxLength={12} />
              {errors.vehicleNumber && <p className="mt-1 text-xs text-red-600">{errors.vehicleNumber}</p>}
            </div>
          </div>

          {/* City + profile photo */}
          <div className="rounded-2xl border border-[#E8E8E8] bg-white p-5 shadow-sm space-y-3">
            <h2 className="text-lg font-bold text-[#1C1C1C]">Delivery area</h2>
            <div>
              <label className="block text-sm font-semibold text-[#1C1C1C] mb-1">City where you want to deliver *</label>
              <input value={city} onChange={e => setCity(e.target.value)}
                className="w-full rounded-xl border border-[#E8E8E8] px-4 py-2.5 text-sm focus:border-[#FF5200] focus:outline-none"
                placeholder="e.g. Delhi" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-[#1C1C1C] mb-1">Profile photo URL <span className="font-normal text-xs text-[#93959F]">(optional)</span></label>
              <input value={profilePhotoUrl} onChange={e => setProfilePhotoUrl(e.target.value)}
                className="w-full rounded-xl border border-[#E8E8E8] px-4 py-2.5 text-sm focus:border-[#FF5200] focus:outline-none"
                placeholder="https://…" />
            </div>
          </div>

          {/* Agreement */}
          <div className="rounded-2xl border border-[#E8E8E8] bg-white p-5 shadow-sm">
            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#FF5200]" />
              <span className="text-sm text-[#1C1C1C]">
                I agree to GhostKitchen&apos;s{" "}
                <a href="#" className="text-[#FF5200] underline">delivery partner terms</a> and confirm that the information provided is accurate.
              </span>
            </label>
            {errors.agreed && <p className="mt-1 text-xs text-red-600">{errors.agreed}</p>}
          </div>

          {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}

          <button type="submit" disabled={loading}
            className="w-full rounded-xl bg-[#FF5200] py-4 text-base font-bold text-white hover:bg-[#E84800] disabled:bg-gray-300 transition">
            {loading ? "Signing you up…" : "Start delivering 🚴"}
          </button>
        </form>
      </div>
    </div>
  );
}
