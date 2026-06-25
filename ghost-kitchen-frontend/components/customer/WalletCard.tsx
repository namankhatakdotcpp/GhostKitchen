"use client";

import { useQuery } from "@tanstack/react-query";
import { Wallet, ArrowUpRight, ArrowDownRight } from "lucide-react";

import { api } from "@/lib/api";

interface WalletTransaction {
  id: string;
  type: "EARNED" | "REDEEMED";
  points: number;
  orderId: string | null;
  description: string | null;
  createdAt: string;
}

interface WalletResponse {
  balance: number;
  transactions: WalletTransaction[];
}

async function fetchWallet(): Promise<WalletResponse> {
  const { data } = await api.get("/wallet");
  return data;
}

export function WalletCard() {
  const { data, isLoading } = useQuery({ queryKey: ["wallet"], queryFn: fetchWallet });

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-gray-800 flex items-center gap-2">
          <Wallet className="h-4 w-4 text-orange-600" /> Wallet
        </h2>
        <div className="text-right">
          <p className="text-2xl font-bold text-gray-900 leading-none">
            {isLoading ? "…" : data?.balance ?? 0}
          </p>
          <p className="text-xs text-gray-500">points</p>
        </div>
      </div>

      {!isLoading && (data?.transactions.length ?? 0) === 0 ? (
        <p className="text-sm text-gray-500">No activity yet — earn points on delivered orders.</p>
      ) : null}

      {!isLoading && data && data.transactions.length > 0 ? (
        <ul className="space-y-2 max-h-56 overflow-y-auto">
          {data.transactions.map((txn) => (
            <li key={txn.id} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2 min-w-0">
                {txn.type === "EARNED" ? (
                  <ArrowUpRight className="h-3.5 w-3.5 text-green-600 shrink-0" />
                ) : (
                  <ArrowDownRight className="h-3.5 w-3.5 text-red-500 shrink-0" />
                )}
                <span className="truncate text-gray-700">{txn.description ?? (txn.type === "EARNED" ? "Earned" : "Redeemed")}</span>
              </div>
              <span className={`font-semibold shrink-0 ${txn.type === "EARNED" ? "text-green-600" : "text-red-500"}`}>
                {txn.type === "EARNED" ? "+" : "-"}{txn.points}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
