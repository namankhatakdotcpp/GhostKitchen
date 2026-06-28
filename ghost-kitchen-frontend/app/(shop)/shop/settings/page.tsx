"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";

import api from "@/lib/api";
import { toPaise, toRupees } from "@/lib/utils";
import ImageUpload from "@/components/ui/ImageUpload";

interface RestaurantSettings {
  id: string;
  name: string;
  description: string;
  cuisines: string[];
  imageUrl: string;
  isOpen: boolean;
  statusNote: string | null;
  openingTime: string | null;
  closingTime: string | null;
  deliveryRadius: number;
  address: {
    line1?: string;
    city?: string;
    deliveryFee?: number;
    deliveryTime?: number;
    minOrder?: number;
  };
}

const STATUS_OPTIONS = [
  { label: "Open", isOpen: true, note: null, color: "border-green-400 bg-green-50 text-green-800" },
  { label: "Busy — longer wait times", isOpen: true, note: "Busy right now — expect longer wait times", color: "border-yellow-400 bg-yellow-50 text-yellow-800" },
  { label: "Temporarily Closed", isOpen: false, note: "Temporarily closed — will reopen shortly", color: "border-orange-400 bg-orange-50 text-orange-800" },
  { label: "Closed for today", isOpen: false, note: null, color: "border-red-400 bg-red-50 text-red-700" },
] as const;

const CUISINES = [
  "Biryani","Pizza","Burger","Chinese","South Indian","North Indian",
  "Desserts","Fast Food","Healthy","Beverages","Continental","Italian",
];

export default function ShopSettingsPage() {
  const [restaurant, setRestaurant] = useState<RestaurantSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleteInput, setDeleteInput] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [cuisines, setCuisines] = useState<string[]>([]);
  const [imageUrl, setImageUrl] = useState("");
  const [addressLine, setAddressLine] = useState("");
  const [deliveryRadius, setDeliveryRadius] = useState(5);
  const [deliveryFee, setDeliveryFee] = useState(30);
  const [minOrder, setMinOrder] = useState(99);
  const [deliveryTime, setDeliveryTime] = useState(30);
  const [openingTime, setOpeningTime] = useState("");
  const [closingTime, setClosingTime] = useState("");

  useEffect(() => {
    api.get("/restaurants/mine")
      .then(r => {
        const rest = r.data?.data ?? r.data;
        rest.statusNote = rest.statusNote ?? null;
        setRestaurant(rest);
        setName(rest.name ?? "");
        setDescription(rest.description ?? "");
        setCuisines(rest.cuisines ?? []);
        setImageUrl(rest.imageUrl ?? "");
        const addr = rest.address ?? {};
        setAddressLine(addr.line1 ?? "");
        setDeliveryRadius(rest.deliveryRadius ?? 5);
        setDeliveryFee(toRupees(addr.deliveryFee ?? 3000));
        setMinOrder(toRupees(addr.minOrder ?? 9900));
        setDeliveryTime(addr.deliveryTime ?? 30);
        setOpeningTime(rest.openingTime ?? "");
        setClosingTime(rest.closingTime ?? "");
      })
      .catch(() => toast.error("Could not load restaurant settings"))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    if (!restaurant) return;
    setSaving(true);
    try {
      await api.put("/role/my-restaurant", {
        restaurantId: restaurant.id,
        name,
        description,
        cuisines,
        imageUrl,
        addressLine,
        deliveryRadius,
        deliveryFee: toPaise(deliveryFee),
        minOrder: toPaise(minOrder),
        deliveryTime,
        openingTime: openingTime || null,
        closingTime: closingTime || null,
      });
      toast.success("Settings saved!");
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleSetStatus(isOpen: boolean, note: string | null) {
    if (!restaurant) return;
    try {
      await api.patch(`/restaurants/${restaurant.id}/set-status`, { isOpen, statusNote: note });
      setRestaurant({ ...restaurant, isOpen, statusNote: note });
      toast.success(isOpen ? "Restaurant is now open" : "Restaurant closed");
    } catch {
      toast.error("Failed to update status");
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-8 space-y-4">
        {[1,2,3].map(i => <div key={i} className="h-32 animate-pulse rounded-2xl bg-gray-100" />)}
      </div>
    );
  }

  if (!restaurant) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-8 text-center">
        <p className="text-lg font-semibold text-gray-600">No restaurant found for your account.</p>
        <a href="/onboarding/restaurant" className="mt-4 inline-block rounded-xl bg-[#FF5200] px-6 py-3 text-sm font-bold text-white">
          Create a restaurant
        </a>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#1C1C1C]">Restaurant settings</h1>
        <p className="text-sm text-[#686B78] mt-1">{restaurant.name}</p>
      </div>

      {/* Basic info */}
      <section className="rounded-2xl border border-[#E8E8E8] bg-white p-6 space-y-4">
        <h2 className="text-base font-bold text-[#1C1C1C]">Basic info</h2>
        <div>
          <label className="block text-sm font-semibold mb-1">Restaurant name</label>
          <input value={name} onChange={e => setName(e.target.value)}
            className="w-full rounded-xl border border-[#E8E8E8] px-4 py-2.5 text-sm focus:border-[#FF5200] focus:outline-none" />
        </div>
        <div>
          <label className="block text-sm font-semibold mb-1">Description</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3}
            className="w-full rounded-xl border border-[#E8E8E8] px-4 py-2.5 text-sm resize-none focus:border-[#FF5200] focus:outline-none" />
        </div>
        <div>
          <label className="block text-sm font-semibold mb-1">Cuisines</label>
          <div className="flex flex-wrap gap-2">
            {CUISINES.map(c => (
              <button key={c} type="button"
                onClick={() => setCuisines(cuisines.includes(c) ? cuisines.filter(x => x !== c) : [...cuisines, c])}
                className={`rounded-full border px-3 py-1 text-sm font-medium transition ${cuisines.includes(c) ? "border-[#FF5200] bg-[#FF5200] text-white" : "border-[#E8E8E8] text-[#686B78]"}`}>
                {c}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-sm font-semibold mb-1">Cover photo</label>
          <ImageUpload value={imageUrl} onChange={setImageUrl} folder="ghostkitchen/restaurants" />
        </div>
      </section>

      {/* Location & hours */}
      <section className="rounded-2xl border border-[#E8E8E8] bg-white p-6 space-y-4">
        <h2 className="text-base font-bold text-[#1C1C1C]">Location & delivery</h2>
        <div>
          <label className="block text-sm font-semibold mb-1">City <span className="font-normal text-xs text-[#93959F]">(contact admin to change)</span></label>
          <input value={restaurant.address?.city ?? ""} disabled
            className="w-full rounded-xl border border-[#E8E8E8] bg-gray-50 px-4 py-2.5 text-sm text-gray-500 cursor-not-allowed" />
        </div>
        <div>
          <label className="block text-sm font-semibold mb-1">Address</label>
          <textarea value={addressLine} onChange={e => setAddressLine(e.target.value)} rows={2}
            className="w-full rounded-xl border border-[#E8E8E8] px-4 py-2.5 text-sm resize-none focus:border-[#FF5200] focus:outline-none" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold mb-1">Delivery fee ₹</label>
            <input type="number" min={0} value={deliveryFee} onChange={e => setDeliveryFee(+e.target.value)}
              className="w-full rounded-xl border border-[#E8E8E8] px-4 py-2.5 text-sm focus:border-[#FF5200] focus:outline-none" />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1">Min. order ₹</label>
            <input type="number" min={0} value={minOrder} onChange={e => setMinOrder(+e.target.value)}
              className="w-full rounded-xl border border-[#E8E8E8] px-4 py-2.5 text-sm focus:border-[#FF5200] focus:outline-none" />
          </div>
        </div>
        <div>
          <label className="block text-sm font-semibold mb-1">Delivery time: {deliveryTime} min</label>
          <input type="range" min={10} max={90} value={deliveryTime} onChange={e => setDeliveryTime(+e.target.value)} className="w-full accent-[#FF5200]" />
        </div>
        <div>
          <label className="block text-sm font-semibold mb-1">Delivery radius: {deliveryRadius} km</label>
          <input type="range" min={1} max={20} value={deliveryRadius} onChange={e => setDeliveryRadius(+e.target.value)} className="w-full accent-[#FF5200]" />
        </div>
        <div>
          <label className="block text-sm font-semibold mb-1">Operating hours <span className="font-normal text-xs text-[#93959F]">(leave blank to stay open 24/7)</span></label>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-[#686B78] mb-1">Opens at</label>
              <input type="time" value={openingTime} onChange={e => setOpeningTime(e.target.value)}
                className="w-full rounded-xl border border-[#E8E8E8] px-4 py-2.5 text-sm focus:border-[#FF5200] focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs text-[#686B78] mb-1">Closes at</label>
              <input type="time" value={closingTime} onChange={e => setClosingTime(e.target.value)}
                className="w-full rounded-xl border border-[#E8E8E8] px-4 py-2.5 text-sm focus:border-[#FF5200] focus:outline-none" />
            </div>
          </div>
          {openingTime && closingTime && (
            <p className="mt-1.5 text-xs text-[#686B78]">
              Orders blocked outside {openingTime}–{closingTime}. Overnight window supported (e.g. 22:00–02:00).
            </p>
          )}
        </div>
      </section>

      {/* Save */}
      <button onClick={handleSave} disabled={saving}
        className="w-full rounded-xl bg-[#FF5200] py-3.5 text-sm font-bold text-white hover:bg-[#E84800] disabled:bg-gray-200 transition">
        {saving ? "Saving…" : "Save changes"}
      </button>

      {/* Status */}
      <section className="rounded-2xl border border-[#E8E8E8] bg-white p-6 space-y-4">
        <div>
          <h2 className="text-base font-bold text-[#1C1C1C]">Restaurant status</h2>
          <p className="text-xs text-[#686B78] mt-1">
            Current:&nbsp;
            <span className={`font-semibold ${restaurant.isOpen ? "text-green-700" : "text-red-600"}`}>
              {restaurant.isOpen ? "Open" : "Closed"}
            </span>
            {restaurant.statusNote && <span className="text-[#686B78]"> — {restaurant.statusNote}</span>}
          </p>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {STATUS_OPTIONS.map((opt) => {
            const isActive = restaurant.isOpen === opt.isOpen && restaurant.statusNote === opt.note;
            return (
              <button
                key={opt.label}
                type="button"
                onClick={() => handleSetStatus(opt.isOpen, opt.note)}
                className={`rounded-xl border-2 px-4 py-3 text-sm font-semibold text-left transition ${isActive ? opt.color + " border-current" : "border-[#E8E8E8] bg-white text-[#1C1C1C] hover:border-[#FF5200]/40"}`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </section>

      {/* Danger zone */}
      <section className="rounded-2xl border border-red-200 bg-red-50 p-6 space-y-4">
        <h2 className="text-base font-bold text-red-700">Danger zone</h2>
        <div>
          <p className="text-sm font-semibold text-red-700">Delete restaurant</p>
          <p className="text-xs text-red-600 mt-1">Type &quot;{restaurant.name}&quot; to confirm</p>
          <input value={deleteInput} onChange={e => setDeleteInput(e.target.value)}
            className="mt-2 w-full rounded-xl border border-red-300 px-4 py-2.5 text-sm focus:outline-none focus:border-red-500"
            placeholder={restaurant.name} />
          <button disabled={deleteInput !== restaurant.name}
            className="mt-3 w-full rounded-xl bg-red-600 py-2.5 text-sm font-bold text-white disabled:bg-gray-200 disabled:text-gray-400 transition">
            Permanently delete restaurant
          </button>
        </div>
      </section>
    </div>
  );
}
