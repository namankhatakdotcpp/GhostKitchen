"use client";

import { useEffect, useState } from "react";
import { Copy, Gift, Users } from "lucide-react";
import toast from "react-hot-toast";
import api from "@/lib/api";

type Referral = {
  id: string;
  rewardedAt: string | null;
  rewardPaise: number;
  referee: { name: string; createdAt: string };
};

type Stats = {
  referralCode: string;
  referrals: Referral[];
  totalEarned: number;
};

export default function ReferralPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [inputCode, setInputCode] = useState("");
  const [applying, setApplying] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/user/referral/stats")
      .then((r) => setStats(r.data))
      .catch(() => toast.error("Could not load referral stats"))
      .finally(() => setLoading(false));
  }, []);

  function copyCode() {
    if (!stats) return;
    navigator.clipboard.writeText(stats.referralCode);
    toast.success("Referral code copied!");
  }

  function shareWhatsApp() {
    if (!stats) return;
    const text = encodeURIComponent(`Try GhostKitchen — order food fast and fresh! Use my referral code *${stats.referralCode}* to get ₹50 off your first order. Download now!`);
    window.open(`https://wa.me/?text=${text}`, "_blank");
  }

  async function applyCode() {
    if (!inputCode.trim()) return;
    setApplying(true);
    try {
      await api.post("/user/referral/apply", { code: inputCode.trim() });
      toast.success("Referral code applied! ₹50 will be credited after your first order.");
      setInputCode("");
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? "Invalid referral code");
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#1C1C1C]">Refer & Earn</h1>
        <p className="text-sm text-[#686B78] mt-1">Invite friends and earn ₹50 for each friend who places their first order</p>
      </div>

      {loading ? (
        <div className="space-y-4">{[1,2,3].map(i => <div key={i} className="h-20 animate-pulse rounded-2xl bg-gray-100" />)}</div>
      ) : (
        <>
          {/* Your code */}
          <div className="rounded-2xl border border-orange-200 bg-orange-50 p-5 space-y-4">
            <div className="flex items-center gap-3">
              <Gift className="h-6 w-6 text-brand" />
              <p className="text-sm font-bold text-[#1C1C1C]">Your referral code</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-1 rounded-xl bg-white border border-orange-200 px-4 py-3">
                <p className="text-2xl font-extrabold tracking-[0.2em] text-brand">{stats?.referralCode}</p>
              </div>
              <button onClick={copyCode} className="rounded-xl bg-brand text-white p-3 hover:bg-brand/90 transition" type="button">
                <Copy className="h-5 w-5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={copyCode} className="rounded-xl border border-brand py-2.5 text-sm font-semibold text-brand hover:bg-brand-light transition" type="button">
                Copy code
              </button>
              <button onClick={shareWhatsApp} className="rounded-xl bg-[#25D366] py-2.5 text-sm font-semibold text-white hover:bg-[#1ebe57] transition" type="button">
                Share on WhatsApp
              </button>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-2xl border border-border bg-white p-4 text-center">
              <Users className="h-6 w-6 text-brand mx-auto mb-1" />
              <p className="text-2xl font-extrabold text-[#1C1C1C]">{stats?.referrals.length ?? 0}</p>
              <p className="text-xs text-[#686B78]">Friends invited</p>
            </div>
            <div className="rounded-2xl border border-border bg-white p-4 text-center">
              <Gift className="h-6 w-6 text-brand mx-auto mb-1" />
              <p className="text-2xl font-extrabold text-[#1C1C1C]">₹{((stats?.totalEarned ?? 0) / 100).toFixed(0)}</p>
              <p className="text-xs text-[#686B78]">Total earned</p>
            </div>
          </div>

          {/* Apply a friend's code */}
          <div className="rounded-2xl border border-border bg-white p-5 space-y-3">
            <p className="text-sm font-bold text-[#1C1C1C]">Have a friend's code?</p>
            <div className="flex gap-2">
              <input
                value={inputCode}
                onChange={e => setInputCode(e.target.value.toUpperCase())}
                placeholder="Enter referral code"
                className="flex-1 text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
              <button
                onClick={applyCode}
                disabled={applying || !inputCode.trim()}
                className="rounded-xl bg-brand px-4 text-sm font-bold text-white hover:bg-brand/90 disabled:opacity-60 transition"
                type="button"
              >
                {applying ? "…" : "Apply"}
              </button>
            </div>
            <p className="text-xs text-[#686B78]">You'll both earn ₹50 in wallet credits after your first order is delivered.</p>
          </div>

          {/* Referral list */}
          {(stats?.referrals.length ?? 0) > 0 && (
            <div className="rounded-2xl border border-border bg-white overflow-hidden">
              <div className="px-5 py-4 border-b border-border">
                <p className="text-sm font-bold text-[#1C1C1C]">Your referrals</p>
              </div>
              <div className="divide-y divide-border">
                {stats?.referrals.map((r) => (
                  <div key={r.id} className="flex items-center justify-between px-5 py-3">
                    <div>
                      <p className="text-sm font-medium text-[#1C1C1C]">{r.referee.name}</p>
                      <p className="text-xs text-[#686B78]">Joined {new Date(r.referee.createdAt).toLocaleDateString("en-IN")}</p>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${r.rewardedAt ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
                      {r.rewardedAt ? "Rewarded" : "Pending"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
