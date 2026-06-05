"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import api from "@/lib/api";
import { toPaise } from "@/lib/utils";
import { useAuthStore } from "@/store/authStore";
import { useUserStore } from "@/store/userStore";

const CUISINES = [
  "Biryani","Pizza","Burger","Chinese","South Indian","North Indian",
  "Desserts","Fast Food","Healthy","Beverages","Continental","Italian",
];
const CATEGORIES = ["Starters","Main Course","Breads","Rice","Beverages","Desserts","Sides"];

type Step1 = { name: string; description: string; cuisines: string[]; imageUrl: string };
type Step2 = { city: string; addressLine: string; deliveryRadius: number; deliveryFee: number; minOrder: number; deliveryTime: number; opensAt: string; closesAt: string };
type Step3 = { itemName: string; itemDescription: string; itemPrice: number; itemCategory: string; itemIsVeg: boolean; itemImageUrl: string; itemIsBestseller: boolean };

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className={`h-2 rounded-full transition-all ${i < current ? "w-8 bg-[#FF5200]" : i === current ? "w-8 bg-[#FF5200]" : "w-4 bg-gray-200"}`} />
      ))}
      <span className="ml-2 text-xs text-gray-500 font-medium">Step {current + 1} of {total}</span>
    </div>
  );
}

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <p className="mt-1 text-xs text-red-600">{msg}</p>;
}

export default function RestaurantOnboarding() {
  const router = useRouter();
  const { user, setUser } = useUserStore();
  const { setTokens } = useAuthStore();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [s1, setS1] = useState<Step1>({ name: "", description: "", cuisines: [], imageUrl: "" });
  const [s2, setS2] = useState<Step2>({ city: "", addressLine: "", deliveryRadius: 5, deliveryFee: 30, minOrder: 99, deliveryTime: 30, opensAt: "10:00", closesAt: "22:00" });
  const [s3, setS3] = useState<Step3>({ itemName: "", itemDescription: "", itemPrice: 0, itemCategory: "Main Course", itemIsVeg: true, itemImageUrl: "", itemIsBestseller: false });

  function validateStep(n: number) {
    const errs: Record<string, string> = {};
    if (n === 0) {
      if (!s1.name.trim()) errs.name = "Restaurant name is required";
      if (s1.cuisines.length === 0) errs.cuisines = "Select at least one cuisine";
    }
    if (n === 1) {
      if (!s2.city.trim()) errs.city = "City is required";
      if (!s2.addressLine.trim()) errs.addressLine = "Address is required";
      if (s2.deliveryFee < 0) errs.deliveryFee = "Delivery fee cannot be negative";
      if (s2.minOrder < 0) errs.minOrder = "Minimum order cannot be negative";
    }
    if (n === 2) {
      if (!s3.itemName.trim()) errs.itemName = "Item name is required";
      if (s3.itemPrice <= 0) errs.itemPrice = "Price must be greater than 0";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function next() {
    if (!validateStep(step)) return;
    setStep((s) => s + 1);
  }

  async function handleSubmit() {
    if (!validateStep(2)) return;
    setLoading(true);
    try {
      const res = await api.post("/role/register-restaurant", {
        name: s1.name,
        description: s1.description,
        cuisines: s1.cuisines,
        imageUrl: s1.imageUrl,
        addressLine: s2.addressLine,
        city: s2.city,
        deliveryFee: toPaise(s2.deliveryFee),
        deliveryTime: s2.deliveryTime,
        minOrder: toPaise(s2.minOrder),
        deliveryRadius: s2.deliveryRadius,
      });

      const { accessToken, restaurant } = res.data;
      if (accessToken) setTokens(accessToken);

      // Add first menu item
      if (s3.itemName) {
        await api.post(`/restaurants/${restaurant.id}/menu`, {
          name: s3.itemName,
          description: s3.itemDescription,
          price: parseFloat(s3.itemPrice.toString()),
          category: s3.itemCategory,
          isVeg: s3.itemIsVeg,
          imageUrl: s3.itemImageUrl || "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400",
          isBestseller: s3.itemIsBestseller,
        });
      }

      const updatedUser = { ...(user ?? {}), roles: ["CUSTOMER", "RESTAURANT"], secondRole: "RESTAURANT", activeRole: "RESTAURANT", restaurantId: restaurant.id };
      setUser(updatedUser as any);
      // Keep authStore in sync so RoleBanner reads correct roles
      useAuthStore.setState((s) => ({
        user: s.user ? { ...s.user, roles: ["CUSTOMER", "RESTAURANT"], secondRole: "RESTAURANT", activeRole: "RESTAURANT", restaurantId: restaurant.id } : s.user,
      }));
      // Tokens are HttpOnly cookies set by the server — no localStorage write needed
      setSuccess(true);
      setTimeout(() => router.push("/shop/orders"), 2000);
    } catch (err: any) {
      // Already registered — just redirect to the shop
      if (err.code === 409) {
        router.push("/shop/menu");
        return;
      }
      setErrors({ submit: err.error ?? err.response?.data?.message ?? "Something went wrong" });
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-orange-50 px-4">
        <div className="text-center max-w-sm">
          <div className="text-6xl mb-4 animate-bounce">🎉</div>
          <h1 className="text-3xl font-bold text-[#1C1C1C]">Your restaurant is live!</h1>
          <p className="mt-2 text-[#686B78]">Redirecting to your dashboard…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F5F5] px-4 py-8">
      <div className="mx-auto max-w-xl">
        <div className="mb-6">
          <a href="/" className="text-2xl font-extrabold tracking-tight">
            <span className="text-[#1C1C1C]">ghost</span><span className="text-[#FF5200]">kitchen</span>
          </a>
          <p className="mt-1 text-sm text-[#686B78]">Open your restaurant on GhostKitchen</p>
        </div>

        <div className="mb-6"><StepIndicator current={step} total={4} /></div>

        <div className="rounded-2xl border border-[#E8E8E8] bg-white p-6 shadow-sm">

          {/* STEP 0 — Basic info */}
          {step === 0 && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold text-[#1C1C1C]">Basic info</h2>
              <div>
                <label className="block text-sm font-semibold text-[#1C1C1C] mb-1">Restaurant name *</label>
                <input value={s1.name} onChange={e => setS1({ ...s1, name: e.target.value })}
                  className="w-full rounded-xl border border-[#E8E8E8] px-4 py-2.5 text-sm focus:border-[#FF5200] focus:outline-none"
                  placeholder="e.g. Ghost Biryani House" />
                <FieldError msg={errors.name} />
              </div>
              <div>
                <label className="block text-sm font-semibold text-[#1C1C1C] mb-1">Description</label>
                <textarea value={s1.description} onChange={e => setS1({ ...s1, description: e.target.value })} rows={3}
                  className="w-full rounded-xl border border-[#E8E8E8] px-4 py-2.5 text-sm resize-none focus:border-[#FF5200] focus:outline-none"
                  placeholder="Tell customers what makes your food special…" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-[#1C1C1C] mb-1">Cuisines * <span className="font-normal text-[#93959F]">(tap to add)</span></label>
                <div className="flex flex-wrap gap-2">
                  {CUISINES.map(c => (
                    <button key={c} type="button"
                      onClick={() => setS1({ ...s1, cuisines: s1.cuisines.includes(c) ? s1.cuisines.filter(x => x !== c) : [...s1.cuisines, c] })}
                      className={`rounded-full border px-3 py-1 text-sm font-medium transition ${s1.cuisines.includes(c) ? "border-[#FF5200] bg-[#FF5200] text-white" : "border-[#E8E8E8] text-[#686B78] hover:border-[#FF5200]"}`}>
                      {c}
                    </button>
                  ))}
                </div>
                <FieldError msg={errors.cuisines} />
              </div>
              <div>
                <label className="block text-sm font-semibold text-[#1C1C1C] mb-1">Cover photo URL <span className="font-normal text-[#93959F]">(optional)</span></label>
                <input value={s1.imageUrl} onChange={e => setS1({ ...s1, imageUrl: e.target.value })}
                  className="w-full rounded-xl border border-[#E8E8E8] px-4 py-2.5 text-sm focus:border-[#FF5200] focus:outline-none"
                  placeholder="https://…" />
                {s1.imageUrl && (
                  <div className="mt-2 h-32 w-full overflow-hidden rounded-xl border border-[#E8E8E8]">
                    <img src={s1.imageUrl} alt="Preview" className="h-full w-full object-cover" />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 1 — Location & delivery */}
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold text-[#1C1C1C]">Location & delivery</h2>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-[#1C1C1C] mb-1">City *</label>
                  <input value={s2.city} onChange={e => setS2({ ...s2, city: e.target.value })}
                    className="w-full rounded-xl border border-[#E8E8E8] px-4 py-2.5 text-sm focus:border-[#FF5200] focus:outline-none"
                    placeholder="Delhi" />
                  <FieldError msg={errors.city} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-[#1C1C1C] mb-1">Delivery time (min)</label>
                  <div className="flex items-center gap-2">
                    <input type="range" min={10} max={90} value={s2.deliveryTime} onChange={e => setS2({ ...s2, deliveryTime: +e.target.value })} className="flex-1 accent-[#FF5200]" />
                    <span className="text-sm font-semibold w-8 text-right">{s2.deliveryTime}</span>
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-[#1C1C1C] mb-1">Full address *</label>
                <textarea value={s2.addressLine} onChange={e => setS2({ ...s2, addressLine: e.target.value })} rows={2}
                  className="w-full rounded-xl border border-[#E8E8E8] px-4 py-2.5 text-sm resize-none focus:border-[#FF5200] focus:outline-none"
                  placeholder="Street, area, landmark" />
                <FieldError msg={errors.addressLine} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-[#1C1C1C] mb-1">Delivery fee ₹</label>
                  <input type="number" min={0} value={s2.deliveryFee} onChange={e => setS2({ ...s2, deliveryFee: +e.target.value })}
                    className="w-full rounded-xl border border-[#E8E8E8] px-4 py-2.5 text-sm focus:border-[#FF5200] focus:outline-none" />
                  <FieldError msg={errors.deliveryFee} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-[#1C1C1C] mb-1">Min. order ₹</label>
                  <input type="number" min={0} value={s2.minOrder} onChange={e => setS2({ ...s2, minOrder: +e.target.value })}
                    className="w-full rounded-xl border border-[#E8E8E8] px-4 py-2.5 text-sm focus:border-[#FF5200] focus:outline-none" />
                  <FieldError msg={errors.minOrder} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-[#1C1C1C] mb-1">Delivery radius: {s2.deliveryRadius} km</label>
                <input type="range" min={1} max={20} value={s2.deliveryRadius} onChange={e => setS2({ ...s2, deliveryRadius: +e.target.value })} className="w-full accent-[#FF5200]" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-[#1C1C1C] mb-1">Opens at</label>
                  <input type="time" value={s2.opensAt} onChange={e => setS2({ ...s2, opensAt: e.target.value })}
                    className="w-full rounded-xl border border-[#E8E8E8] px-4 py-2.5 text-sm focus:border-[#FF5200] focus:outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-[#1C1C1C] mb-1">Closes at</label>
                  <input type="time" value={s2.closesAt} onChange={e => setS2({ ...s2, closesAt: e.target.value })}
                    className="w-full rounded-xl border border-[#E8E8E8] px-4 py-2.5 text-sm focus:border-[#FF5200] focus:outline-none" />
                </div>
              </div>
            </div>
          )}

          {/* STEP 2 — First menu item */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-bold text-[#1C1C1C]">Add your first dish</h2>
                <p className="text-sm text-[#686B78]">You can add more items after setup</p>
              </div>
              <div>
                <label className="block text-sm font-semibold text-[#1C1C1C] mb-1">Item name *</label>
                <input value={s3.itemName} onChange={e => setS3({ ...s3, itemName: e.target.value })}
                  className="w-full rounded-xl border border-[#E8E8E8] px-4 py-2.5 text-sm focus:border-[#FF5200] focus:outline-none"
                  placeholder="e.g. Signature Biryani" />
                <FieldError msg={errors.itemName} />
              </div>
              <div>
                <label className="block text-sm font-semibold text-[#1C1C1C] mb-1">Description</label>
                <textarea value={s3.itemDescription} onChange={e => setS3({ ...s3, itemDescription: e.target.value })} rows={2}
                  className="w-full rounded-xl border border-[#E8E8E8] px-4 py-2.5 text-sm resize-none focus:border-[#FF5200] focus:outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-[#1C1C1C] mb-1">Price ₹ *</label>
                  <input type="number" min={1} value={s3.itemPrice} onChange={e => setS3({ ...s3, itemPrice: +e.target.value })}
                    className="w-full rounded-xl border border-[#E8E8E8] px-4 py-2.5 text-sm focus:border-[#FF5200] focus:outline-none" />
                  <FieldError msg={errors.itemPrice} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-[#1C1C1C] mb-1">Category</label>
                  <select value={s3.itemCategory} onChange={e => setS3({ ...s3, itemCategory: e.target.value })}
                    className="w-full rounded-xl border border-[#E8E8E8] px-4 py-2.5 text-sm focus:border-[#FF5200] focus:outline-none bg-white">
                    {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setS3({ ...s3, itemIsVeg: true })}
                  className={`flex-1 rounded-xl border py-3 text-sm font-semibold transition ${s3.itemIsVeg ? "border-green-500 bg-green-50 text-green-700" : "border-[#E8E8E8] text-[#686B78]"}`}>
                  🟢 Veg
                </button>
                <button type="button" onClick={() => setS3({ ...s3, itemIsVeg: false })}
                  className={`flex-1 rounded-xl border py-3 text-sm font-semibold transition ${!s3.itemIsVeg ? "border-red-500 bg-red-50 text-red-700" : "border-[#E8E8E8] text-[#686B78]"}`}>
                  🔴 Non-veg
                </button>
              </div>
              <div>
                <label className="block text-sm font-semibold text-[#1C1C1C] mb-1">Item photo URL</label>
                <input value={s3.itemImageUrl} onChange={e => setS3({ ...s3, itemImageUrl: e.target.value })}
                  className="w-full rounded-xl border border-[#E8E8E8] px-4 py-2.5 text-sm focus:border-[#FF5200] focus:outline-none"
                  placeholder="https://…" />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={s3.itemIsBestseller} onChange={e => setS3({ ...s3, itemIsBestseller: e.target.checked })} className="accent-[#FF5200]" />
                <span className="text-sm text-[#1C1C1C]">Mark as bestseller</span>
              </label>
            </div>
          )}

          {/* STEP 3 — Review & launch */}
          {step === 3 && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold text-[#1C1C1C]">Review & launch</h2>
              <div className="rounded-xl border border-[#E8E8E8] overflow-hidden">
                {s1.imageUrl && (
                  <div className="h-36 w-full overflow-hidden">
                    <img src={s1.imageUrl} alt={s1.name} className="h-full w-full object-cover" />
                  </div>
                )}
                <div className="p-4">
                  <h3 className="text-lg font-bold">{s1.name || "Your restaurant"}</h3>
                  <p className="text-sm text-[#686B78] mt-0.5">{s1.cuisines.join(" · ")}</p>
                  <div className="mt-2 flex gap-3 text-xs text-[#686B78]">
                    <span>📍 {s2.city}</span>
                    <span>🕐 {s2.deliveryTime} min</span>
                    <span>₹{s2.deliveryFee} delivery</span>
                    <span>Min ₹{s2.minOrder}</span>
                  </div>
                </div>
              </div>
              {s3.itemName && (
                <div className="rounded-xl border border-[#E8E8E8] p-4 flex justify-between items-center">
                  <div>
                    <p className="text-sm font-semibold">{s3.itemName}</p>
                    <p className="text-xs text-[#686B78]">{s3.itemCategory} · {s3.itemIsVeg ? "Veg" : "Non-veg"}</p>
                  </div>
                  <p className="text-sm font-bold">₹{s3.itemPrice}</p>
                </div>
              )}
              {errors.submit && <p className="text-sm text-red-600 bg-red-50 rounded-xl p-3">{errors.submit}</p>}
            </div>
          )}

          <div className="mt-6 flex gap-3">
            {step > 0 && (
              <button type="button" onClick={() => setStep(s => s - 1)}
                className="flex-1 rounded-xl border border-[#E8E8E8] py-3 text-sm font-semibold text-[#1C1C1C] hover:bg-[#F5F5F5] transition">
                Back
              </button>
            )}
            {step < 3 ? (
              <button type="button" onClick={next}
                className="flex-1 rounded-xl bg-[#FF5200] py-3 text-sm font-bold text-white hover:bg-[#E84800] transition">
                Next
              </button>
            ) : (
              <button type="button" onClick={handleSubmit} disabled={loading}
                className="flex-1 rounded-xl bg-[#FF5200] py-3 text-sm font-bold text-white hover:bg-[#E84800] disabled:bg-gray-300 transition">
                {loading ? "Launching…" : "🚀 Launch my restaurant"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
