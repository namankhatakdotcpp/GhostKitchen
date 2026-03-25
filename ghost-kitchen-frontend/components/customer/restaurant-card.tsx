"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";

type RestaurantCardProps = {
  id: string;
  name: string;
  cuisines: string[];
  rating: number;
  deliveryTime: number;
  deliveryFee: number;
  minOrder: number;
  imageUrl: string;
  isVeg: boolean;
  offer?: string;
  isNew?: boolean;
  index?: number;
};

export function RestaurantCard({
  id,
  name,
  cuisines,
  rating,
  deliveryTime,
  deliveryFee,
  minOrder,
  imageUrl,
  isVeg,
  offer,
  isNew,
  index = 0,
}: RestaurantCardProps) {
  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      initial={{ opacity: 0, y: 18 }}
      transition={{ delay: index * 0.05, duration: 0.28, ease: "easeOut" }}
    >
      <Link
        className="group block overflow-hidden rounded-[20px] border border-border bg-white transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_40px_rgba(28,28,28,0.08)]"
        href={`/restaurant/${id}`}
      >
        <div className="relative h-[180px] w-full overflow-hidden rounded-t-[20px]">
          <Image
            alt={name}
            className="object-cover transition duration-300 group-hover:scale-[1.03]"
            fill
            sizes="(max-width: 768px) 50vw, (max-width: 1280px) 33vw, 360px"
            src={imageUrl}
          />
          <div className="absolute inset-x-0 top-0 flex items-start justify-between p-3">
            {isVeg ? (
              <span className="rounded-pill bg-success px-2.5 py-1 text-[11px] font-bold tracking-[0.14em] text-white">
                VEG ONLY
              </span>
            ) : (
              <span />
            )}
            {offer ? (
              <span className="rounded-pill bg-brand px-2.5 py-1 text-[11px] font-bold text-white">
                {offer}
              </span>
            ) : null}
          </div>
        </div>

        <div className="rounded-b-[20px] bg-white p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="line-clamp-1 text-[15px] font-bold text-text-primary">
                {name}
              </h3>
              <p className="mt-1 line-clamp-1 text-xs text-text-secondary">
                {cuisines.join(" • ")}
              </p>
            </div>
            {isNew ? (
              <span className="rounded-pill bg-success/10 px-2 py-1 text-[10px] font-bold tracking-[0.14em] text-success">
                NEW
              </span>
            ) : null}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px] text-text-secondary">
            <span className="inline-flex items-center gap-1 font-semibold text-text-primary">
              <svg aria-hidden="true" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
                <path
                  d="m12 3 2.8 5.66L21 9.6l-4.5 4.4 1.06 6.21L12 17.32l-5.56 2.89L7.5 14 3 9.6l6.2-.94L12 3Z"
                  fill="#FF5200"
                  stroke="#FF5200"
                  strokeLinejoin="round"
                  strokeWidth="1.2"
                />
              </svg>
              {rating.toFixed(1)}
            </span>
            <span>•</span>
            <span>{deliveryTime} mins</span>
            <span>•</span>
            <span>{deliveryFee === 0 ? "FREE" : `₹${deliveryFee}`}</span>
          </div>

          <div className="mt-2 text-[12px] text-text-muted">
            Min order ₹{minOrder}
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
