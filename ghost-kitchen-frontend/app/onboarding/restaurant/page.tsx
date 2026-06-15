"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { CitySearch } from "@/components/ui/city-search";
import api from "@/lib/api";
import { getCurrentLocationOption, GeoLocationError } from "@/lib/geolocation";
import { toPaise } from "@/lib/utils";
import { useAuthStore } from "@/store/authStore";
import { useUserStore } from "@/store/userStore";

const CUISINES = [
  "Biryani", "Pizza", "Burger", "Chinese", "South Indian", "North Indian",
  "Desserts", "Fast Food", "Healthy", "Beverages", "Continental", "Italian",
];
const CATEGORIES = ["Starters", "Main Course", "Breads", "Rice", "Beverages", "Desserts", "Sides"];

type Step1 = { name: string; description: string; cuisines: string[]; imageUrl: string };
type Step2 = { city: string; addressLine: string; deliveryRadius: number; deliveryFee: number; minOrder: number; deliveryTime: number; opensAt: string; closesAt: string; lat?: number; lng?: number; state?: string };
type Step3 = { itemName: string; itemDescription: string; itemPrice: number; itemCategory: string; itemIsVeg: boolean; itemImageUrl: string; itemIsBestseller: boolean };

interface ExistingRestaurant {
  id: string;
  name: string;
  description: string;
  cuisines: string[];
  imageUrl: string;
}

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className={`h-2 rounded-full transition-all ${i <= current ? "w-8 bg-[#FF5200]" : "w-4 bg-gray-200"}`} />
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

  const [mode, setMode] = useState<"new" | "branch">("new");
  const [existingRestaurants, setExistingRestaurants] = useState<ExistingRestaurant[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<ExistingRestaurant | null>(null);
  const [loadingExisting, setLoadingExisting] = useState(false);

  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsMsg, setGpsMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const [s1, setS1] = useState<Step1>({ name: "", description: "", cuisines: [], imageUrl: "" });
  const [s2, setS2] = useState<Step2>({ city: "", addressLine: "", deliveryRadius: 5, deliveryFee: 30, minOrder: 99, deliveryTime: 30, opensAt: "10:00", closesAt: "22:00" });
  const [s3, setS3] = useState<Step3>({ itemName: "", itemDescription: "", itemPrice: 0, itemCategory: "Main Course", itemIsVeg: true, itemImageUrl: "", itemIsBestseller: false });

  const isBranchOwner = user?.roles?.includes("RESTAURANT") ?? false;

  // Fetch existing restaurants if user already owns one
  useEffect(() => {
    if (!isBranchOwner) return;
    setLoadingExisting(true);
    api.get("/role/my-restaurants")
      .then((res) => {
        const list: ExistingRestaurant[] = (res.data.restaurants ?? []).map((r: any) => ({
          id: r.id, name: r.name, description: r.description, cuisines: r.cuisines, imageUrl: r.imageUrl,
        }));
        setExistingRestaurants(list);
        if (list.length > 0) {
          setMode("branch");
          setSelectedBranch(list[0]);
          setS1({ name: list[0].name, description: list[0].description, cuisines: list[0].cuisines, imageUrl: list[0].imageUrl });
        }
      })
      .catch(() => {})
      .finally(() => setLoadingExisting(false));
  }, [isBranchOwner]);

  function handleModeSwitch(m: "new" | "branch") {
    setMode(m);
    setErrors({});
    if (m === "branch" && selectedBranch) {
      setS1({ name: selectedBranch.name, description: selectedBranch.description, cuisines: selectedBranch.cuisines, imageUrl: selectedBranch.imageUrl });
    } else if (m === "new") {
      setS1({ name: "", description: "", cuisines: [], imageUrl: "" });
    }
  }

  function handleBranchSelect(r: ExistingRestaurant) {
    setSelectedBranch(r);
    setS1({ name: r.name, description: r.description, cuisines: r.cuisines, imageUrl: r.imageUrl });
  }

  async function detectRestaurantLocation() {
    setGpsLoading(true);
    setGpsMsg(null);
    try {
      const { location } = await getCurrentLocationOption();
      setS2((prev) => ({
        ...prev,
        city: location.city !== "Current Location" ? location.city : prev.city,
        lat: location.lat,
        lng: location.lng,
      }));
      setGpsMsg({ text: `Detected: ${location.label}`, ok: true });
    } catch (err) {
      const msg = err instanceof GeoLocationError ? err.message : "Could not detect location.";
      setGpsMsg({ text: msg, ok: false });
    } finally {
      setGpsLoading(false);
    }
  }

  function validateStep(n: number) {
    const errs: Record<string, string> = {};
    if (n === 0 && mode === "new") {
      if (!s1.name.trim()) errs.name = "Restaurant name is required";
      if (s1.cuisines.length === 0) errs.cuisines = "Select at least one cuisine";
    }
    if (n === 0 && mode === "branch") {
      if (!selectedBranch) errs.branch = "Select which restaurant to open a branch of";
    }
    if (n === 1) {
      if (!s2.city.trim()) errs.city = "Select a city from the list";
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
      let restaurant: any;
      let serverUser: any;
      let accessToken: string | undefined;

      const payload = {
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
        ...(s2.lat !== undefined && { lat: s2.lat }),
        ...(s2.lng !== undefined && { lng: s2.lng }),
      };

      if (mode === "branch") {
        // Use the add-restaurant endpoint (no role change needed)
        const res = await api.post("/role/add-restaurant", {
          ...payload,
          ...(s3.itemName && {
            firstMenuItem: {
              name: s3.itemName,
              description: s3.itemDescription,
              price: parseFloat(s3.itemPrice.toString()),
              category: s3.itemCategory,
              isVeg: s3.itemIsVeg,
              imageUrl: s3.itemImageUrl || "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400",
              isBestseller: s3.itemIsBestseller,
            },
          }),
        });
        restaurant = res.data.restaurant;
      } else {
        // First menu item is embedded in the registration so no separate role-gated call is needed
        const res = await api.post("/role/register-restaurant", {
          ...payload,
          ...(s3.itemName && {
            firstMenuItem: {
              name: s3.itemName,
              description: s3.itemDescription,
              price: parseFloat(s3.itemPrice.toString()),
              category: s3.itemCategory,
              isVeg: s3.itemIsVeg,
              imageUrl: s3.itemImageUrl || "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400",
              isBestseller: s3.itemIsBestseller,
            },
          }),
        });
        restaurant = res.data.restaurant;
        serverUser = res.data.user;
        accessToken = res.data.token ?? res.data.accessToken;
      }

      if (mode === "new") {
        const updatedUser = serverUser
          ? { ...serverUser, activeRole: "RESTAURANT" }
          : { ...(user ?? {}), roles: ["CUSTOMER", "RESTAURANT"], secondRole: "RESTAURANT", activeRole: "RESTAURANT", restaurantId: restaurant?.id };
        // Single atomic update — avoids a window where token and user are mismatched
        useAuthStore.setState({ ...(accessToken ? { accessToken } : {}), user: updatedUser as any });
        setUser(updatedUser as any);
      }

      setSuccess(true);
      setTimeout(() => router.push("/shop/orders"), 2000);
    } catch (err: any) {
      if (err.code === 409) {
        try { await useAuthStore.getState().getCurrentUser(); } catch { /* non-fatal */ }
        router.push("/shop/orders");
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
          <div className="text-6xl mb-4 animate-bounce">{mode === "branch" ? "🏪" : "🎉"}</div>
          <h1 className="text-3xl font-bold text-[#1C1C1C]">
            {mode === "branch" ? "New branch is live!" : "Your restaurant is live!"}
          </h1>
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
          <p className="mt-1 text-sm text-[#686B78]">
            {mode === "branch" ? "Open a new branch" : "Open your restaurant on GhostKitchen"}
          </p>
        </div>

        <div className="mb-6"><StepIndicator current={step} total={4} /></div>

        <div className="rounded-2xl border border-[#E8E8E8] bg-white p-6 shadow-sm">

          {/* ── STEP 0 ── */}
          {step === 0 && (
            <div className="space-y-5">
              <h2 className="text-xl font-bold text-[#1C1C1C]">
                {mode === "branch" ? "Choose your restaurant" : "Basic info"}
              </h2>

              {/* Mode selector (only for existing restaurant owners) */}
              {isBranchOwner && !loadingExisting && (
                <div className="flex rounded-xl border border-[#E8E8E8] overflow-hidden text-sm font-semibold">
                  <button
                    type="button"
                    onClick={() => handleModeSwitch("branch")}
                    className={`flex-1 py-2.5 transition ${mode === "branch" ? "bg-[#FF5200] text-white" : "text-[#686B78] hover:bg-[#F5F5F5]"}`}
                  >
                    🏪 Open a Branch
                  </button>
                  <button
                    type="button"
                    onClick={() => handleModeSwitch("new")}
                    className={`flex-1 py-2.5 transition ${mode === "new" ? "bg-[#FF5200] text-white" : "text-[#686B78] hover:bg-[#F5F5F5]"}`}
                  >
                    ✨ New Brand
                  </button>
                </div>
              )}

              {/* Branch mode — pick existing restaurant */}
              {mode === "branch" && (
                <div className="space-y-3">
                  <p className="text-sm text-[#686B78]">Select which restaurant to open a new branch of:</p>
                  {existingRestaurants.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => handleBranchSelect(r)}
                      className={`w-full flex items-center gap-3 rounded-xl border p-3 text-left transition ${
                        selectedBranch?.id === r.id ? "border-[#FF5200] bg-[#FFF3EE]" : "border-[#E8E8E8] hover:border-[#FF5200]"
                      }`}
                    >
                      {r.imageUrl && (
                        <img src={r.imageUrl} alt={r.name} className="h-12 w-12 rounded-lg object-cover flex-shrink-0"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                      )}
                      <div>
                        <p className="font-semibold text-[#1C1C1C]">{r.name}</p>
                        <p className="text-xs text-[#686B78]">{r.cuisines.slice(0, 3).join(" · ")}</p>
                      </div>
                      {selectedBranch?.id === r.id && (
                        <span className="ml-auto text-[#FF5200] font-bold">✓</span>
                      )}
                    </button>
                  ))}
                  <FieldError msg={errors.branch} />
                  {selectedBranch && (
                    <div className="rounded-xl bg-[#F5F5F5] p-3 text-xs text-[#686B78]">
                      The new branch will use <strong>{selectedBranch.name}</strong>&apos;s name and branding.
                      You&apos;ll only set a new city and delivery details in the next step.
                    </div>
                  )}
                </div>
              )}

              {/* New brand mode — full form */}
              {mode === "new" && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-[#1C1C1C] mb-1">Restaurant name *</label>
                    <input
                      value={s1.name}
                      onChange={(e) => setS1({ ...s1, name: e.target.value })}
                      className="w-full rounded-xl border border-[#E8E8E8] px-4 py-2.5 text-sm focus:border-[#FF5200] focus:outline-none"
                      placeholder="e.g. Ghost Biryani House"
                    />
                    <FieldError msg={errors.name} />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-[#1C1C1C] mb-1">Description</label>
                    <textarea
                      value={s1.description}
                      onChange={(e) => setS1({ ...s1, description: e.target.value })}
                      rows={3}
                      className="w-full rounded-xl border border-[#E8E8E8] px-4 py-2.5 text-sm resize-none focus:border-[#FF5200] focus:outline-none"
                      placeholder="Tell customers what makes your food special…"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-[#1C1C1C] mb-1">
                      Cuisines * <span className="font-normal text-[#93959F]">(tap to add)</span>
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {CUISINES.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setS1({ ...s1, cuisines: s1.cuisines.includes(c) ? s1.cuisines.filter((x) => x !== c) : [...s1.cuisines, c] })}
                          className={`rounded-full border px-3 py-1 text-sm font-medium transition ${
                            s1.cuisines.includes(c) ? "border-[#FF5200] bg-[#FF5200] text-white" : "border-[#E8E8E8] text-[#686B78] hover:border-[#FF5200]"
                          }`}
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                    <FieldError msg={errors.cuisines} />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-[#1C1C1C] mb-1">
                      Cover photo URL <span className="font-normal text-[#93959F]">(optional)</span>
                    </label>
                    <input
                      value={s1.imageUrl}
                      onChange={(e) => setS1({ ...s1, imageUrl: e.target.value })}
                      className="w-full rounded-xl border border-[#E8E8E8] px-4 py-2.5 text-sm focus:border-[#FF5200] focus:outline-none"
                      placeholder="https://…"
                    />
                    {s1.imageUrl && (
                      <div className="mt-2 h-32 w-full overflow-hidden rounded-xl border border-[#E8E8E8]">
                        <img src={s1.imageUrl} alt="Preview" className="h-full w-full object-cover" />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── STEP 1 — Location & delivery ── */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-bold text-[#1C1C1C]">Location & delivery</h2>
                {mode === "branch" && selectedBranch && (
                  <p className="mt-1 text-sm text-[#686B78]">
                    Opening <strong>{selectedBranch.name}</strong> in a new city
                  </p>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm font-semibold text-[#1C1C1C]">City / Area *</label>
                  <button
                    type="button"
                    disabled={gpsLoading}
                    onClick={detectRestaurantLocation}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#FF5200] hover:underline disabled:opacity-60"
                  >
                    {gpsLoading ? "Detecting…" : "📍 Auto-detect location"}
                  </button>
                </div>
                <CitySearch
                  value={s2.city}
                  onChange={(city) => setS2({ ...s2, city, lat: undefined, lng: undefined })}
                  error={errors.city}
                  placeholder="Search your city or neighbourhood…"
                />
                {gpsMsg && (
                  <p className={`mt-1 text-xs ${gpsMsg.ok ? "text-green-600" : "text-red-600"}`}>
                    {gpsMsg.text}
                  </p>
                )}
                {s2.lat && s2.lng && (
                  <p className="mt-1 text-xs text-green-600">
                    ✓ GPS coordinates captured ({s2.lat.toFixed(4)}, {s2.lng.toFixed(4)})
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-semibold text-[#1C1C1C] mb-1">Full address *</label>
                <textarea
                  value={s2.addressLine}
                  onChange={(e) => setS2({ ...s2, addressLine: e.target.value })}
                  rows={2}
                  className="w-full rounded-xl border border-[#E8E8E8] px-4 py-2.5 text-sm resize-none focus:border-[#FF5200] focus:outline-none"
                  placeholder="Street, area, landmark"
                />
                <FieldError msg={errors.addressLine} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-[#1C1C1C] mb-1">Delivery fee ₹</label>
                  <input
                    type="number"
                    min={0}
                    value={s2.deliveryFee}
                    onChange={(e) => setS2({ ...s2, deliveryFee: +e.target.value })}
                    className="w-full rounded-xl border border-[#E8E8E8] px-4 py-2.5 text-sm focus:border-[#FF5200] focus:outline-none"
                  />
                  <FieldError msg={errors.deliveryFee} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-[#1C1C1C] mb-1">Min. order ₹</label>
                  <input
                    type="number"
                    min={0}
                    value={s2.minOrder}
                    onChange={(e) => setS2({ ...s2, minOrder: +e.target.value })}
                    className="w-full rounded-xl border border-[#E8E8E8] px-4 py-2.5 text-sm focus:border-[#FF5200] focus:outline-none"
                  />
                  <FieldError msg={errors.minOrder} />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-[#1C1C1C] mb-1">
                  Delivery time: <span className="text-[#FF5200]">{s2.deliveryTime} min</span>
                </label>
                <input
                  type="range" min={10} max={90}
                  value={s2.deliveryTime}
                  onChange={(e) => setS2({ ...s2, deliveryTime: +e.target.value })}
                  className="w-full accent-[#FF5200]"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-[#1C1C1C] mb-1">
                  Delivery radius: <span className="text-[#FF5200]">{s2.deliveryRadius} km</span>
                </label>
                <input
                  type="range" min={1} max={20}
                  value={s2.deliveryRadius}
                  onChange={(e) => setS2({ ...s2, deliveryRadius: +e.target.value })}
                  className="w-full accent-[#FF5200]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-[#1C1C1C] mb-1">Opens at</label>
                  <input
                    type="time" value={s2.opensAt}
                    onChange={(e) => setS2({ ...s2, opensAt: e.target.value })}
                    className="w-full rounded-xl border border-[#E8E8E8] px-4 py-2.5 text-sm focus:border-[#FF5200] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-[#1C1C1C] mb-1">Closes at</label>
                  <input
                    type="time" value={s2.closesAt}
                    onChange={(e) => setS2({ ...s2, closesAt: e.target.value })}
                    className="w-full rounded-xl border border-[#E8E8E8] px-4 py-2.5 text-sm focus:border-[#FF5200] focus:outline-none"
                  />
                </div>
              </div>
            </div>
          )}

          {/* ── STEP 2 — First menu item ── */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-bold text-[#1C1C1C]">Add your first dish</h2>
                <p className="text-sm text-[#686B78]">You can add more items after setup</p>
              </div>
              <div>
                <label className="block text-sm font-semibold text-[#1C1C1C] mb-1">Item name *</label>
                <input
                  value={s3.itemName}
                  onChange={(e) => setS3({ ...s3, itemName: e.target.value })}
                  className="w-full rounded-xl border border-[#E8E8E8] px-4 py-2.5 text-sm focus:border-[#FF5200] focus:outline-none"
                  placeholder="e.g. Signature Biryani"
                />
                <FieldError msg={errors.itemName} />
              </div>
              <div>
                <label className="block text-sm font-semibold text-[#1C1C1C] mb-1">Description</label>
                <textarea
                  value={s3.itemDescription}
                  onChange={(e) => setS3({ ...s3, itemDescription: e.target.value })}
                  rows={2}
                  className="w-full rounded-xl border border-[#E8E8E8] px-4 py-2.5 text-sm resize-none focus:border-[#FF5200] focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-[#1C1C1C] mb-1">Price ₹ *</label>
                  <input
                    type="number" min={1}
                    value={s3.itemPrice}
                    onChange={(e) => setS3({ ...s3, itemPrice: +e.target.value })}
                    className="w-full rounded-xl border border-[#E8E8E8] px-4 py-2.5 text-sm focus:border-[#FF5200] focus:outline-none"
                  />
                  <FieldError msg={errors.itemPrice} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-[#1C1C1C] mb-1">Category</label>
                  <select
                    value={s3.itemCategory}
                    onChange={(e) => setS3({ ...s3, itemCategory: e.target.value })}
                    className="w-full rounded-xl border border-[#E8E8E8] px-4 py-2.5 text-sm focus:border-[#FF5200] focus:outline-none bg-white"
                  >
                    {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setS3({ ...s3, itemIsVeg: true })}
                  className={`flex-1 rounded-xl border py-3 text-sm font-semibold transition ${s3.itemIsVeg ? "border-green-500 bg-green-50 text-green-700" : "border-[#E8E8E8] text-[#686B78]"}`}
                >
                  🟢 Veg
                </button>
                <button
                  type="button"
                  onClick={() => setS3({ ...s3, itemIsVeg: false })}
                  className={`flex-1 rounded-xl border py-3 text-sm font-semibold transition ${!s3.itemIsVeg ? "border-red-500 bg-red-50 text-red-700" : "border-[#E8E8E8] text-[#686B78]"}`}
                >
                  🔴 Non-veg
                </button>
              </div>
              <div>
                <label className="block text-sm font-semibold text-[#1C1C1C] mb-1">Item photo URL</label>
                <input
                  value={s3.itemImageUrl}
                  onChange={(e) => setS3({ ...s3, itemImageUrl: e.target.value })}
                  className="w-full rounded-xl border border-[#E8E8E8] px-4 py-2.5 text-sm focus:border-[#FF5200] focus:outline-none"
                  placeholder="https://…"
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={s3.itemIsBestseller}
                  onChange={(e) => setS3({ ...s3, itemIsBestseller: e.target.checked })}
                  className="accent-[#FF5200]"
                />
                <span className="text-sm text-[#1C1C1C]">Mark as bestseller</span>
              </label>
            </div>
          )}

          {/* ── STEP 3 — Review & launch ── */}
          {step === 3 && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold text-[#1C1C1C]">
                {mode === "branch" ? "Review & open branch" : "Review & launch"}
              </h2>
              <div className="rounded-xl border border-[#E8E8E8] overflow-hidden">
                {s1.imageUrl && (
                  <div className="h-36 w-full overflow-hidden">
                    <img src={s1.imageUrl} alt={s1.name} className="h-full w-full object-cover" />
                  </div>
                )}
                <div className="p-4">
                  <h3 className="text-lg font-bold">{s1.name || "Your restaurant"}</h3>
                  <p className="text-sm text-[#686B78] mt-0.5">{s1.cuisines.join(" · ")}</p>
                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-[#686B78]">
                    <span>📍 {s2.city}</span>
                    <span>🕐 {s2.deliveryTime} min</span>
                    <span>₹{s2.deliveryFee} delivery</span>
                    <span>Min ₹{s2.minOrder}</span>
                  </div>
                  {s2.addressLine && (
                    <p className="mt-1 text-xs text-[#93959F]">{s2.addressLine}</p>
                  )}
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

          {/* Navigation */}
          <div className="mt-6 flex gap-3">
            {step > 0 && (
              <button
                type="button"
                onClick={() => setStep((s) => s - 1)}
                className="flex-1 rounded-xl border border-[#E8E8E8] py-3 text-sm font-semibold text-[#1C1C1C] hover:bg-[#F5F5F5] transition"
              >
                Back
              </button>
            )}
            {step < 3 ? (
              <button
                type="button"
                onClick={next}
                className="flex-1 rounded-xl bg-[#FF5200] py-3 text-sm font-bold text-white hover:bg-[#E84800] transition"
              >
                Next
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={loading}
                className="flex-1 rounded-xl bg-[#FF5200] py-3 text-sm font-bold text-white hover:bg-[#E84800] disabled:bg-gray-300 transition"
              >
                {loading ? "Launching…" : mode === "branch" ? "🏪 Open Branch" : "🚀 Launch my restaurant"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
