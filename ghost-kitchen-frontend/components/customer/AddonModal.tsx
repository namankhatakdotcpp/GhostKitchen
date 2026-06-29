"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import toast from "react-hot-toast";
import { api } from "@/lib/api";

type AddonOption = {
  id: string;
  name: string;
  pricePaise: number;
  isDefault: boolean;
};

type AddonGroup = {
  id: string;
  name: string;
  required: boolean;
  multiSelect: boolean;
  maxSelect: number | null;
  options: AddonOption[];
};

type Props = {
  itemId: string;
  itemName: string;
  basePrice: number;
  open: boolean;
  onClose: () => void;
  onConfirm: (selections: AddonSelection[]) => void;
};

export type AddonSelection = {
  groupId: string;
  groupName: string;
  optionId: string;
  optionName: string;
  pricePaise: number;
};

export function AddonModal({ itemId, itemName, basePrice, open, onClose, onConfirm }: Props) {
  const [groups, setGroups] = useState<AddonGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [selections, setSelections] = useState<Record<string, string[]>>({});

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    api.get(`/menu-items/${itemId}/addons`)
      .then((r) => {
        const g: AddonGroup[] = r.data.groups ?? [];
        setGroups(g);
        // Pre-select defaults
        const defaults: Record<string, string[]> = {};
        g.forEach((group) => {
          const def = group.options.filter((o) => o.isDefault).map((o) => o.id);
          if (def.length) defaults[group.id] = def;
        });
        setSelections(defaults);
      })
      .catch(() => toast.error("Could not load customization options"))
      .finally(() => setLoading(false));
  }, [open, itemId]);

  function toggle(group: AddonGroup, optionId: string) {
    setSelections((prev) => {
      const cur = prev[group.id] ?? [];
      if (group.multiSelect) {
        const next = cur.includes(optionId) ? cur.filter((x) => x !== optionId) : [...cur, optionId];
        if (group.maxSelect && next.length > group.maxSelect) {
          toast.error(`Max ${group.maxSelect} selections for "${group.name}"`);
          return prev;
        }
        return { ...prev, [group.id]: next };
      } else {
        return { ...prev, [group.id]: cur[0] === optionId ? [] : [optionId] };
      }
    });
  }

  function handleConfirm() {
    for (const group of groups) {
      if (group.required && !(selections[group.id]?.length)) {
        toast.error(`Please select an option for "${group.name}"`);
        return;
      }
    }
    const result: AddonSelection[] = [];
    groups.forEach((group) => {
      (selections[group.id] ?? []).forEach((optId) => {
        const opt = group.options.find((o) => o.id === optId);
        if (opt) result.push({ groupId: group.id, groupName: group.name, optionId: opt.id, optionName: opt.name, pricePaise: opt.pricePaise });
      });
    });
    onConfirm(result);
    onClose();
  }

  const addonTotal = groups.reduce((sum, group) => {
    return sum + (selections[group.id] ?? []).reduce((s, oid) => {
      const opt = group.options.find((o) => o.id === oid);
      return s + (opt?.pricePaise ?? 0);
    }, 0);
  }, 0);

  if (!open) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center">
        <motion.div
          animate={{ opacity: 1 }}
          className="absolute inset-0 bg-black/50"
          exit={{ opacity: 0 }}
          initial={{ opacity: 0 }}
          onClick={onClose}
        />
        <motion.div
          animate={{ y: 0, opacity: 1 }}
          className="relative z-10 w-full max-w-lg rounded-t-3xl bg-white md:rounded-3xl max-h-[85vh] flex flex-col"
          exit={{ y: 40, opacity: 0 }}
          initial={{ y: 40, opacity: 0 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <div>
              <h2 className="text-lg font-bold text-text-primary">{itemName}</h2>
              <p className="text-sm text-text-secondary">Customize your order</p>
            </div>
            <button onClick={onClose} className="rounded-full p-2 hover:bg-surface" type="button">
              <X className="h-5 w-5 text-text-secondary" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
            {loading ? (
              <div className="space-y-4">
                {[1, 2].map((i) => <div key={i} className="h-20 animate-pulse rounded-2xl bg-gray-100" />)}
              </div>
            ) : groups.length === 0 ? (
              <p className="text-center py-8 text-text-secondary text-sm">No customization options available.</p>
            ) : groups.map((group) => (
              <div key={group.id}>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-bold text-text-primary">
                    {group.name}
                    {group.required && <span className="ml-1 text-[10px] font-normal text-brand uppercase tracking-wide">Required</span>}
                  </p>
                  {group.multiSelect && (
                    <span className="text-xs text-text-muted">
                      {group.maxSelect ? `Choose up to ${group.maxSelect}` : "Choose any"}
                    </span>
                  )}
                </div>
                <div className="space-y-2">
                  {group.options.map((opt) => {
                    const selected = (selections[group.id] ?? []).includes(opt.id);
                    return (
                      <button
                        key={opt.id}
                        onClick={() => toggle(group, opt.id)}
                        className={`w-full flex items-center justify-between rounded-2xl border px-4 py-3 text-left transition ${selected ? "border-brand bg-brand-light" : "border-border hover:border-brand/40"}`}
                        type="button"
                      >
                        <div className="flex items-center gap-3">
                          <span className={`h-4 w-4 rounded-full border-2 flex items-center justify-center transition ${selected ? "border-brand" : "border-gray-300"}`}>
                            {selected && <span className="h-2 w-2 rounded-full bg-brand" />}
                          </span>
                          <span className="text-sm font-medium text-text-primary">{opt.name}</span>
                        </div>
                        {opt.pricePaise > 0 && (
                          <span className="text-sm text-text-secondary">+₹{(opt.pricePaise / 100).toFixed(0)}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="px-5 py-4 border-t border-border">
            <button
              onClick={handleConfirm}
              className="w-full rounded-2xl bg-brand py-3.5 text-sm font-bold text-white hover:bg-brand/90 transition"
              type="button"
            >
              Add to cart — ₹{((basePrice + addonTotal) / 100).toFixed(0)}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
