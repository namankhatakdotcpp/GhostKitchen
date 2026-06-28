"use client";

import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import toast from "react-hot-toast";

const FALLBACK = "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=800&q=80";

const TRUSTED_HOSTS = ["images.unsplash.com", "res.cloudinary.com", "ghostkitchen.onrender.com", "vercel.app"];

function isTrustedImage(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return TRUSTED_HOSTS.some(h => host === h || host.endsWith("." + h));
  } catch {
    return false;
  }
}

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
  isOpen?: boolean;
  statusNote?: string | null;
  offer?: string;
  isNew?: boolean;
  index?: number;
  isFavorited?: boolean;
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
  isOpen = true,
  statusNote,
  offer,
  isNew,
  index = 0,
  isFavorited = false,
}: RestaurantCardProps) {
  const { user } = useAuthStore();
  const [imgSrc, setImgSrc] = useState(() =>
    imageUrl && isTrustedImage(imageUrl) ? imageUrl : FALLBACK
  );
  const [favorited, setFavorited] = useState(isFavorited);
  const [favLoading, setFavLoading] = useState(false);

  const handleFavoriteToggle = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) { toast.error("Sign in to save favorites"); return; }
    setFavLoading(true);
    try {
      const res = await api.post(`/user/favorites/${id}`);
      setFavorited(res.data.favorited);
    } catch {
      toast.error("Could not update favorites");
    } finally {
      setFavLoading(false);
    }
  }, [id, user]);

  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      initial={{ opacity: 0, y: 18 }}
      transition={{ delay: index * 0.05, duration: 0.28, ease: "easeOut" }}
    >
      <Link
        className={`group block overflow-hidden rounded-[20px] border border-border bg-white transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_40px_rgba(28,28,28,0.08)] ${!isOpen ? "grayscale opacity-75" : ""}`}
        href={`/restaurant/${id}`}
      >
        <div className="relative h-[180px] w-full overflow-hidden rounded-t-[20px]">
          <Image
            alt={name}
            className="object-cover transition duration-300 group-hover:scale-[1.03]"
            fill
            onError={() => setImgSrc(FALLBACK)}
            sizes="(max-width: 768px) 50vw, (max-width: 1280px) 33vw, 360px"
            src={imgSrc}
            unoptimized={imgSrc.includes("example.com")}
          />
          <div className="absolute inset-x-0 top-0 flex items-start justify-between p-3">
            {isVeg ? (
              <span className="rounded-pill bg-success px-2.5 py-1 text-[11px] font-bold tracking-[0.14em] text-white">
                VEG ONLY
              </span>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-2">
              {offer ? (
                <span className="rounded-pill bg-brand px-2.5 py-1 text-[11px] font-bold text-white">
                  {offer}
                </span>
              ) : null}
              <button
                onClick={handleFavoriteToggle}
                disabled={favLoading}
                aria-label={favorited ? "Remove from favorites" : "Add to favorites"}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90 shadow-sm backdrop-blur-sm transition hover:scale-110 active:scale-95 disabled:opacity-60"
              >
                <svg
                  className="h-4 w-4"
                  fill={favorited ? "#FF5200" : "none"}
                  stroke={favorited ? "#FF5200" : "#6b7280"}
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
                  />
                </svg>
              </button>
            </div>
          </div>
          {/* Status overlay */}
          {!isOpen && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="rounded-full bg-black/70 px-4 py-1.5 text-[12px] font-bold text-white backdrop-blur-sm">
                {statusNote === "Temporarily Closed" ? "Temporarily Closed" : "Closed"}
              </span>
            </div>
          )}
          {isOpen && statusNote && (
            <div className="absolute bottom-2 left-2">
              <span className="rounded-full bg-yellow-500/90 px-3 py-1 text-[11px] font-bold text-white backdrop-blur-sm">
                Busy
              </span>
            </div>
          )}
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
            <span>{deliveryFee === 0 ? "FREE" : `₹${Math.round(deliveryFee / 100)}`}</span>
          </div>

          <div className="mt-2 text-[12px] text-text-muted">
            Min order ₹{Math.round(minOrder / 100)}
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
