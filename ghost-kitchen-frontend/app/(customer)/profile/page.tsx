"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import toast from "react-hot-toast";
import Link from "next/link";
import { Gift, Heart, HelpCircle, MapPin, Plus, Trash2, Home, Briefcase, CheckCircle, Edit2, X, Phone, Bell, BellOff, Users } from "lucide-react";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { WalletCard } from "@/components/customer/WalletCard";
import { toRupees } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { usePushNotifications } from "@/hooks/usePushNotifications";

interface Address {
  id: string;
  label: string;
  line1: string;
  line2?: string | null;
  city: string;
  state?: string | null;
  pincode?: string | null;
  isDefault: boolean;
}

interface AddressFormState {
  label: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  pincode: string;
  isDefault: boolean;
}

const EMPTY_FORM: AddressFormState = {
  label: "Home",
  line1: "",
  line2: "",
  city: "",
  state: "",
  pincode: "",
  isDefault: false,
};

function DonationStat() {
  const { data, isLoading } = useQuery({
    queryKey: ["donation-total"],
    queryFn: () => api.get("/orders/donation-total").then((r) => r.data),
    staleTime: 60_000,
  });
  const totalPaise: number = data?.totalPaise ?? 0;
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-gray-800 flex items-center gap-2">
          <Heart className="h-4 w-4 text-red-500" /> Lifetime donations
        </h2>
        <div className="text-right">
          <p className="text-2xl font-bold text-gray-900 leading-none">
            {isLoading ? "…" : `₹${toRupees(totalPaise).toFixed(0)}`}
          </p>
          <p className="text-xs text-gray-500">contributed</p>
        </div>
      </div>
      <p className="text-xs text-gray-400 mt-3">
        {totalPaise === 0 ? "Add a donation at checkout to feed a child in need." : "Thank you for your generosity. 🤝"}
      </p>
    </div>
  );
}

function ProfilePageContent() {
  const { user } = useAuthStore();
  const { permission, isSubscribing, subscribe } = usePushNotifications();
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<AddressFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [editingProfile, setEditingProfile] = useState(false);
  const [profileName, setProfileName] = useState(user?.name ?? "");
  const [profilePhone, setProfilePhone] = useState(user?.phone ?? "");
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => {
    fetchAddresses();
  }, []);

  const fetchAddresses = async () => {
    try {
      setLoading(true);
      const { data } = await api.get("/user/addresses");
      setAddresses(data.addresses ?? []);
    } catch {
      toast.error("Failed to load addresses");
    } finally {
      setLoading(false);
    }
  };

  const openAddForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(true);
  };

  const openEditForm = (addr: Address) => {
    setForm({
      label: addr.label,
      line1: addr.line1,
      line2: addr.line2 ?? "",
      city: addr.city,
      state: addr.state ?? "",
      pincode: addr.pincode ?? "",
      isDefault: addr.isDefault,
    });
    setEditingId(addr.id);
    setShowForm(true);
  };

  const handleSaveAddress = async () => {
    if (!form.line1.trim() || !form.city.trim()) {
      toast.error("Street address and city are required");
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        const { data } = await api.patch(`/user/addresses/${editingId}`, form);
        setAddresses((prev) => prev.map((a) => (a.id === editingId ? data.address : a)));
        toast.success("Address updated");
      } else {
        const { data } = await api.post("/user/addresses", form);
        setAddresses((prev) => {
          const base = form.isDefault ? prev.map((a) => ({ ...a, isDefault: false })) : prev;
          return [...base, data.address];
        });
        toast.success("Address saved");
      }
      setShowForm(false);
      setEditingId(null);
    } catch {
      toast.error("Failed to save address");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await api.delete(`/user/addresses/${id}`);
      setAddresses((prev) => prev.filter((a) => a.id !== id));
      toast.success("Address removed");
    } catch {
      toast.error("Failed to remove address");
    } finally {
      setDeletingId(null);
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      await api.post(`/user/addresses/${id}/set-default`);
      setAddresses((prev) => prev.map((a) => ({ ...a, isDefault: a.id === id })));
      toast.success("Default address updated");
    } catch {
      toast.error("Failed to update default");
    }
  };

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    try {
      await api.patch("/user/profile", { name: profileName, phone: profilePhone });
      toast.success("Profile updated");
      setEditingProfile(false);
    } catch (err: any) {
      toast.error(err?.error ?? "Failed to update profile");
    } finally {
      setSavingProfile(false);
    }
  };

  const getLabelIcon = (label: string) => {
    if (label.toLowerCase() === "home") return <Home className="h-4 w-4" />;
    if (label.toLowerCase() === "work") return <Briefcase className="h-4 w-4" />;
    return <MapPin className="h-4 w-4" />;
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">My Profile</h1>

      {/* Account Details */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-800">Account Details</h2>
          {!editingProfile && (
            <button onClick={() => setEditingProfile(true)} className="flex items-center gap-1 text-sm text-orange-600 hover:underline">
              <Edit2 className="h-3.5 w-3.5" /> Edit
            </button>
          )}
        </div>

        {editingProfile ? (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Full name</label>
              <input
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Phone number</label>
              <input
                value={profilePhone}
                onChange={(e) => setProfilePhone(e.target.value)}
                placeholder="10-digit mobile number"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleSaveProfile}
                disabled={savingProfile}
                className="px-4 py-2 bg-orange-600 text-white rounded-lg text-sm font-medium hover:bg-orange-700 disabled:opacity-50"
              >
                {savingProfile ? "Saving…" : "Save"}
              </button>
              <button onClick={() => setEditingProfile(false)} className="px-4 py-2 border border-gray-200 rounded-lg text-sm">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Name</span>
              <span className="text-gray-900 font-medium">{user?.name ?? "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Email</span>
              <span className="text-gray-900">{user?.email ?? "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Phone</span>
              <span className="text-gray-900">{user?.phone ?? "Not set"}</span>
            </div>
          </div>
        )}
      </div>

      {/* Wallet / loyalty points */}
      <WalletCard />

      {/* Lifetime donations */}
      <DonationStat />

      {/* Push notifications */}
      {permission !== "unsupported" && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {permission === "granted" ? (
              <Bell className="h-5 w-5 text-green-600" />
            ) : (
              <BellOff className="h-5 w-5 text-gray-400" />
            )}
            <div>
              <p className="font-semibold text-gray-800">Push notifications</p>
              <p className="text-xs text-gray-500">
                {permission === "granted"
                  ? "Enabled — you'll get order updates even when the app is closed."
                  : permission === "denied"
                    ? "Blocked in your browser settings. Re-enable from your browser's site settings."
                    : "Get notified when your order is accepted, out for delivery, or delivered."}
              </p>
            </div>
          </div>
          {permission === "default" && (
            <button
              onClick={async () => {
                const ok = await subscribe()
                if (ok) toast.success('Notifications enabled')
                else toast.error('Could not enable notifications')
              }}
              disabled={isSubscribing}
              className="px-4 py-2 bg-orange-600 text-white rounded-lg text-sm font-medium hover:bg-orange-700 disabled:opacity-50 shrink-0"
            >
              {isSubscribing ? 'Enabling…' : 'Enable'}
            </button>
          )}
        </div>
      )}

      {/* Saved Addresses */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-800">Saved Addresses</h2>
          <button
            onClick={openAddForm}
            className="flex items-center gap-1.5 text-sm font-medium text-orange-600 hover:text-orange-700"
          >
            <Plus className="h-4 w-4" /> Add new
          </button>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => <div key={i} className="h-16 bg-gray-100 rounded-lg animate-pulse" />)}
          </div>
        ) : addresses.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <MapPin className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No saved addresses yet</p>
            <p className="text-xs mt-1">Add one to speed up checkout</p>
          </div>
        ) : (
          <div className="space-y-3">
            {addresses.map((addr) => (
              <div
                key={addr.id}
                className={`rounded-xl border p-4 transition ${addr.isDefault ? "border-orange-300 bg-orange-50" : "border-gray-200"}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2 min-w-0">
                    <span className={`mt-0.5 shrink-0 ${addr.isDefault ? "text-orange-600" : "text-gray-400"}`}>
                      {getLabelIcon(addr.label)}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-gray-900">{addr.label}</span>
                        {addr.isDefault && (
                          <span className="flex items-center gap-0.5 text-xs text-orange-600 font-medium">
                            <CheckCircle className="h-3 w-3" /> Default
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-600">
                        {addr.line1}{addr.line2 ? `, ${addr.line2}` : ""}, {addr.city}
                        {addr.state ? `, ${addr.state}` : ""}
                        {addr.pincode ? ` – ${addr.pincode}` : ""}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {!addr.isDefault && (
                      <button
                        onClick={() => handleSetDefault(addr.id)}
                        className="text-xs text-gray-500 hover:text-orange-600 font-medium whitespace-nowrap"
                      >
                        Set default
                      </button>
                    )}
                    <button onClick={() => openEditForm(addr)} className="text-gray-400 hover:text-gray-700 p-1">
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(addr.id)}
                      disabled={deletingId === addr.id}
                      className="text-gray-400 hover:text-red-500 disabled:opacity-40 p-1"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {showForm && (
          <div className="mt-4 border border-gray-200 rounded-xl p-4 space-y-3 bg-gray-50">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-800">
                {editingId ? "Edit address" : "New address"}
              </h3>
              <button onClick={() => setShowForm(false)}>
                <X className="h-4 w-4 text-gray-400" />
              </button>
            </div>

            <div className="flex gap-2">
              {["Home", "Work", "Other"].map((l) => (
                <button
                  key={l}
                  onClick={() => setForm((f) => ({ ...f, label: l }))}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition ${
                    form.label === l
                      ? "bg-orange-600 text-white border-orange-600"
                      : "border-gray-300 text-gray-600 hover:border-orange-400"
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>

            <input
              value={form.line1}
              onChange={(e) => setForm((f) => ({ ...f, line1: e.target.value }))}
              placeholder="Street address *"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
            <input
              value={form.line2}
              onChange={(e) => setForm((f) => ({ ...f, line2: e.target.value }))}
              placeholder="Apartment, floor, etc. (optional)"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                value={form.city}
                onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                placeholder="City *"
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
              <input
                value={form.state}
                onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
                placeholder="State"
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
            <input
              value={form.pincode}
              onChange={(e) => setForm((f) => ({ ...f, pincode: e.target.value }))}
              placeholder="PIN code"
              maxLength={6}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            />

            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={form.isDefault}
                onChange={(e) => setForm((f) => ({ ...f, isDefault: e.target.checked }))}
                className="rounded border-gray-300 text-orange-600"
              />
              Set as default delivery address
            </label>

            <div className="flex gap-2 pt-1">
              <button
                onClick={handleSaveAddress}
                disabled={saving}
                className="flex-1 py-2 bg-orange-600 text-white rounded-lg text-sm font-semibold hover:bg-orange-700 disabled:opacity-50"
              >
                {saving ? "Saving…" : editingId ? "Update" : "Save address"}
              </button>
              <button onClick={() => setShowForm(false)} className="px-4 py-2 border border-gray-200 rounded-lg text-sm">
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Quick links */}
      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
        {[
          { href: "/referral", icon: Users, label: "Refer & Earn", desc: "Earn ₹50 for every friend you invite" },
          { href: "/help", icon: HelpCircle, label: "Help & Support", desc: "FAQ, contact us, track tickets" },
        ].map(({ href, icon: Icon, label, desc }) => (
          <Link key={href} href={href} className="flex items-center gap-4 px-4 py-4 hover:bg-surface transition">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-50">
              <Icon className="h-5 w-5 text-brand" />
            </span>
            <div>
              <p className="text-sm font-semibold text-gray-800">{label}</p>
              <p className="text-xs text-gray-500">{desc}</p>
            </div>
          </Link>
        ))}
        {process.env.NEXT_PUBLIC_SUPPORT_PHONE && (
          <a href={`tel:${process.env.NEXT_PUBLIC_SUPPORT_PHONE}`} className="flex items-center gap-4 px-4 py-4 hover:bg-surface transition">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-50">
              <Phone className="h-5 w-5 text-brand" />
            </span>
            <div>
              <p className="text-sm font-semibold text-gray-800">Call Customer Care</p>
              <p className="text-xs text-gray-500">{process.env.NEXT_PUBLIC_SUPPORT_PHONE}</p>
            </div>
          </a>
        )}
      </div>
    </div>
  );
}

export default function ProfilePage() {
  return <ProtectedRoute requiredRole={["CUSTOMER"]}><ProfilePageContent /></ProtectedRoute>;
}
