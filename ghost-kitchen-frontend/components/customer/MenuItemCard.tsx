"use client";

import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";
import { useParams } from "next/navigation";

import { useCartStore } from "@/store/cartStore";
import type { MenuItem } from "@/types";

export interface MenuItemCardProps {
  id: string;
  name: string;
  description: string;
  price: number;
  imageUrl: string;
  isVeg: boolean;
  isBestseller?: boolean;
  customizable?: boolean;
}

function FoodTypeIcon({ isVeg }: { isVeg: boolean }) {
  return (
    <span
      className={`inline-flex h-4 w-4 items-center justify-center rounded-[4px] border ${
        isVeg ? "border-success" : "border-danger"
      }`}
    >
      <span
        className={`h-2 w-2 rounded-full ${
          isVeg ? "bg-success" : "bg-danger"
        }`}
      />
    </span>
  );
}

export function MenuItemCard({
  id,
  name,
  description,
  price,
  imageUrl,
  isVeg,
  isBestseller,
  customizable,
}: MenuItemCardProps) {
  const params = useParams<{ id: string }>();
  const { items, addItem, updateQuantity } = useCartStore();

  const currentItem = items.find((item) => item.menuItem.id === id);
  const quantity = currentItem?.quantity ?? 0;

  const menuItem: MenuItem = {
    id,
    restaurantId: params.id,
    name,
    description,
    price,
    imageUrl,
    category: "",
    isVeg,
    isAvailable: true,
    isBestseller: Boolean(isBestseller),
  };

  return (
    <div className="flex gap-4 border-b border-border bg-white py-4">
      <div className="min-w-0 flex-1">
        <FoodTypeIcon isVeg={isVeg} />
        {isBestseller ? (
          <div className="mt-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-brand">
            Bestseller
          </div>
        ) : null}
        <h3 className="mt-2 text-[15px] font-medium text-text-primary">{name}</h3>
        <p className="mt-2 line-clamp-2 text-[13px] leading-5 text-text-secondary">
          {description}
        </p>
        {customizable ? (
          <p className="mt-2 text-xs font-medium text-text-muted">
            Customizable
          </p>
        ) : null}
        <div className="mt-3 text-[15px] font-bold text-text-primary">₹{price}</div>
      </div>

      <div className="flex w-[120px] flex-col items-center gap-3">
        <div className="relative h-24 w-24 overflow-hidden rounded-[12px] border border-border">
          <Image
            alt={name}
            className="object-cover"
            fill
            sizes="96px"
            src={imageUrl}
          />
        </div>

        <AnimatePresence initial={false} mode="wait">
          {quantity > 0 ? (
            <motion.div
              animate={{ opacity: 1, scale: 1, y: 0 }}
              className="flex h-10 w-[104px] items-center justify-between rounded-md border border-brand bg-brand-light px-3"
              exit={{ opacity: 0, scale: 0.92, y: 6 }}
              initial={{ opacity: 0, scale: 0.92, y: 6 }}
              key="stepper"
              transition={{ duration: 0.18, ease: "easeOut" }}
            >
              <button
                className="text-lg font-bold text-brand"
                onClick={() => updateQuantity(id, quantity - 1)}
                type="button"
              >
                -
              </button>
              <span className="text-sm font-bold text-brand">{quantity}</span>
              <button
                className="text-lg font-bold text-brand"
                onClick={() => addItem(menuItem)}
                type="button"
              >
                +
              </button>
            </motion.div>
          ) : (
            <motion.button
              animate={{ opacity: 1, scale: 1, y: 0 }}
              className="h-10 w-[104px] rounded-md border border-brand bg-white text-sm font-bold text-brand shadow-[0_6px_18px_rgba(255,82,0,0.12)]"
              exit={{ opacity: 0, scale: 0.92, y: 6 }}
              initial={{ opacity: 0, scale: 0.92, y: 6 }}
              key="add"
              onClick={() => addItem(menuItem)}
              transition={{ duration: 0.18, ease: "easeOut" }}
              type="button"
            >
              ADD
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
