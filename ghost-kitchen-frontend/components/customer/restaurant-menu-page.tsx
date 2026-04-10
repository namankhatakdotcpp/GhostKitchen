"use client";

import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { MenuItemCard } from "@/components/customer/MenuItemCard";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useCartStore } from "@/store/cartStore";

type RestaurantMenuPageProps = {
  restaurantId: string;
};

const STICKY_HEADER_HEIGHT = 64;
const STICKY_CATEGORY_HEIGHT = 56;

function BackIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
      <path
        d="m15 18-6-6 6-6"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function CartIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
      <path
        d="M4 5h2l1.6 8.2a1 1 0 0 0 1 .8h8.6a1 1 0 0 0 1-.76L20 7H7"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <circle cx="10" cy="19" fill="currentColor" r="1.5" />
      <circle cx="17" cy="19" fill="currentColor" r="1.5" />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg aria-hidden="true" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
      <path d="m12 3 2.8 5.66L21 9.6l-4.5 4.4 1.06 6.21L12 17.32l-5.56 2.89L7.5 14 3 9.6l6.2-.94L12 3Z" fill="#FF5200" stroke="#FF5200" strokeLinejoin="round" strokeWidth="1.2"/>
    </svg>
  );
}

export function RestaurantMenuPage({
  restaurantId,
}: RestaurantMenuPageProps) {
  const router = useRouter();
  const [vegOnly, setVegOnly] = useState(false);
  const { items, getRestaurantId, updateQuantity, clearCart } = useCartStore();
  const cartRestaurantId = getRestaurantId();
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const [activeCategory, setActiveCategory] = useState<string>("");

  const { data: restaurant, isLoading: restaurantLoading } = useQuery({
    queryKey: ['restaurant', restaurantId],
    queryFn: () => api.get(`/restaurants/${restaurantId}`).then(r => r.data?.data ?? r.data),
  });

  const { data: menuByCategory = {}, isLoading: menuLoading } = useQuery({
    queryKey: ['menu', restaurantId],
    queryFn: () => api.get(`/restaurants/${restaurantId}/menu`).then(r => r.data),
    enabled: !!restaurantId,
  });

  const isLoading = restaurantLoading || menuLoading;

  // Transform menu data from { "Category": [ items ] } to array format
  const menu = useMemo(() => {
    return Object.entries(menuByCategory || {}).map(([category, items]) => ({
      category,
      items: items as typeof undefined[],
    }));
  }, [menuByCategory]);

  useEffect(() => {
    if (menu.length > 0 && !activeCategory) {
      setActiveCategory(menu[0].category);
    }
  }, [menu, activeCategory]);

  const currentCartItems = useMemo(
    () =>
      cartRestaurantId === restaurantId
        ? items
        : [],
    [items, cartRestaurantId, restaurantId],
  );
  const totalQuantity = currentCartItems.reduce(
    (sum, item) => sum + item.quantity,
    0,
  );
  const subtotal = currentCartItems.reduce(
    (sum, item) => sum + item.menuItem.price * item.quantity,
    0,
  );
  const deliveryFee = restaurant?.address?.deliveryFee || 0;
  const total = subtotal + deliveryFee;

  const filteredMenu = useMemo(
    () =>
      menu
        .map((section) => ({
          ...section,
          items: vegOnly
            ? section.items.filter((item: any) => item?.isVeg)
            : section.items,
        }))
        .filter((section) => section.items.length > 0),
    [menu, vegOnly],
  );

  useEffect(() => {
    if (!filteredMenu.find((section) => section.category === activeCategory)) {
      setActiveCategory(filteredMenu[0]?.category ?? "");
    }
  }, [activeCategory, filteredMenu]);

  useEffect(() => {
    const observers = filteredMenu
      .map((section) => {
        const node = sectionRefs.current[section.category];

        if (!node) {
          return null;
        }

        const observer = new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              if (entry.isIntersecting) {
                setActiveCategory(section.category);
              }
            });
          },
          {
            rootMargin: `-${STICKY_HEADER_HEIGHT + STICKY_CATEGORY_HEIGHT + 24}px 0px -55% 0px`,
            threshold: 0.15,
          },
        );

        observer.observe(node);
        return observer;
      })
      .filter(Boolean);

    return () => {
      observers.forEach((observer) => observer?.disconnect());
    };
  }, [filteredMenu]);

  function scrollToCategory(category: string) {
    const targetNode = sectionRefs.current[category];

    if (!targetNode) {
      return;
    }

    const top =
      targetNode.getBoundingClientRect().top +
      window.scrollY -
      STICKY_HEADER_HEIGHT -
      STICKY_CATEGORY_HEIGHT -
      12;

    window.scrollTo({ top, behavior: "smooth" });
    setActiveCategory(category);
  }

  return (
    <div className="min-h-screen bg-surface pb-24 lg:pb-10 lg:pr-[360px]">
      <header className="sticky top-0 z-40 border-b border-border bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-shell items-center justify-between gap-3 px-4 md:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border text-text-primary transition hover:border-brand/30 hover:bg-brand-light hover:text-brand"
              onClick={() => router.back()}
              type="button"
            >
              <BackIcon />
            </button>
            <div className="min-w-0">
              <h1 className="line-clamp-1 text-base font-bold text-text-primary md:text-lg">{restaurant?.name || "Unknown Restaurant"}</h1>
              <p className="line-clamp-1 text-xs text-text-secondary">{restaurant?.cuisines?.join(', ') || "Cuisines not available"}</p>
            </div>
          </div>

          <Link
            className="relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-border text-text-primary transition hover:border-brand/30 hover:bg-brand-light hover:text-brand"
            href="/cart"
          >
            <CartIcon />
            <span className="absolute -right-1 -top-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-white">
              {totalQuantity}
            </span>
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-shell">
        <div className="relative h-[220px] w-full">
          <Image
            alt={restaurant?.name || "Restaurant image"}
            className="object-cover"
            fill
            priority
            sizes="100vw"
            src={restaurant?.imageUrl || "/fallback.jpg"}
          />
        </div>

        <section className="relative z-10 mx-4 -mt-8 rounded-[18px] border border-border bg-white p-4 shadow-[0_2px_8px_rgba(0,0,0,0.08)] md:mx-6 lg:mx-8">
          <h2 className="text-[22px] font-bold text-text-primary">
            {restaurant?.name || "Unknown Restaurant"}
          </h2>
          <p className="mt-1 text-[13px] text-text-secondary">
            {restaurant?.cuisines?.join(' • ') || "Cuisines not available"}
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-2 text-[13px] text-text-secondary">
            <span className="inline-flex items-center gap-1 font-semibold text-text-primary">
              <StarIcon />
              {restaurant?.rating?.toFixed(1) || '0'}
            </span>
          </div>
        </section>
      </div>

      <div className="sticky top-16 z-30 mt-5 border-b border-border bg-white">
        <div className="mx-auto flex max-w-shell items-center justify-between gap-4 px-4 md:px-6 lg:px-8">
          <div className="scrollbar-none flex flex-1 gap-5 overflow-x-auto">
            {filteredMenu.map((section) => {
              const isActive = activeCategory === section.category;

              return (
                <button
                  className={cn(
                    "relative h-14 shrink-0 text-sm transition",
                    isActive
                      ? "font-semibold text-text-primary"
                      : "font-normal text-text-secondary",
                  )}
                  key={section.category}
                  onClick={() => scrollToCategory(section.category)}
                  type="button"
                >
                  {section.category}
                  <span
                    className={cn(
                      "absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-brand transition",
                      isActive ? "opacity-100" : "opacity-0",
                    )}
                  />
                </button>
              );
            })}
          </div>

          <button
            className={cn(
              "inline-flex h-9 items-center gap-2 rounded-pill border px-3 text-sm font-medium transition",
              vegOnly
                ? "border-success bg-success/10 text-success"
                : "border-border bg-white text-text-secondary",
            )}
            onClick={() => setVegOnly((currentState) => !currentState)}
            type="button"
          >
            <span>Veg Only</span>
            <span
              className={cn(
                "relative h-5 w-9 rounded-full transition",
                vegOnly ? "bg-success" : "bg-border",
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 h-4 w-4 rounded-full bg-white transition",
                  vegOnly ? "left-[18px]" : "left-0.5",
                )}
              />
            </span>
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-shell px-4 pb-8 pt-2 md:px-6 lg:px-8">
        <div className="max-w-3xl">
          {filteredMenu.map((section) => (
            <section
              className="scroll-mt-[136px]"
              key={section.category}
              ref={(node) => {
                sectionRefs.current[section.category] = node;
              }}
            >
              <h3 className="mt-6 text-[16px] font-bold text-text-primary">
                {section.category}
              </h3>
              <div className="mt-1">
                {section.items.map((item: any) => (
                  <MenuItemCard
                    customizable={item.category !== "Beverages"}
                    description={item.description}
                    id={item.id}
                    imageUrl={item.imageUrl}
                    isBestseller={item.isBestseller}
                    isVeg={item.isVeg}
                    key={item.id}
                    name={item.name}
                    price={item.price}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>

      <AnimatePresence>
        {currentCartItems.length ? (
          <>
            <motion.aside
              animate={{ x: 0, opacity: 1 }}
              className="fixed right-0 top-0 hidden h-screen w-[340px] border-l border-border bg-white lg:block"
              exit={{ x: 24, opacity: 0 }}
              initial={{ x: 24, opacity: 0 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
            >
              <div className="flex h-full flex-col pt-16">
                <div className="border-b border-border px-6 py-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-text-muted">
                    Cart
                  </p>
                  <h3 className="mt-2 text-2xl font-bold text-text-primary">
                    {totalQuantity} items
                  </h3>
                  <p className="mt-1 text-sm text-text-secondary">
                    From {restaurant.name}
                  </p>
                </div>
                <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
                  {currentCartItems.map((item) => (
                    <div
                      className="rounded-2xl border border-border bg-surface p-4"
                      key={item.menuItem.id}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="line-clamp-1 text-sm font-semibold text-text-primary">
                            {item.menuItem.name}
                          </p>
                          <p className="mt-1 text-xs text-text-secondary">
                            ₹{item.menuItem.price} each
                          </p>
                        </div>
                        <div className="flex items-center gap-2 rounded-pill border border-brand px-2 py-1">
                          <button
                            className="text-brand"
                            onClick={() =>
                              updateQuantity(item.menuItem.id, item.quantity - 1)
                            }
                            type="button"
                          >
                            -
                          </button>
                          <span className="w-5 text-center text-sm font-semibold text-brand">
                            {item.quantity}
                          </span>
                          <button
                            className="text-brand"
                            onClick={() =>
                              updateQuantity(item.menuItem.id, item.quantity + 1)
                            }
                            type="button"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="border-t border-border px-6 py-5">
                  <div className="space-y-2 text-sm text-text-secondary">
                    <div className="flex items-center justify-between">
                      <span>Subtotal</span>
                      <span className="font-semibold text-text-primary">₹{subtotal}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Delivery fee</span>
                      <span className="font-semibold text-text-primary">
                        ₹{deliveryFee}
                      </span>
                    </div>
                    <div className="flex items-center justify-between border-t border-border pt-3 text-base">
                      <span className="font-semibold text-text-primary">Total</span>
                      <span className="font-bold text-text-primary">₹{total}</span>
                    </div>
                  </div>
                  <Link href="/checkout">
                    <Button className="mt-5 h-[52px] w-full rounded-lg">
                      Proceed to checkout
                    </Button>
                  </Link>
                  <button
                    className="mt-3 w-full text-sm font-semibold text-text-secondary"
                    onClick={clearCart}
                    type="button"
                  >
                    Clear cart
                  </button>
                </div>
              </div>
            </motion.aside>

            <motion.div
              animate={{ y: 0, opacity: 1 }}
              className="fixed inset-x-0 bottom-0 z-40 rounded-t-[24px] border-t border-border bg-white px-4 pb-6 pt-4 shadow-[0_-12px_30px_rgba(28,28,28,0.12)] lg:hidden"
              exit={{ y: 80, opacity: 0 }}
              initial={{ y: 80, opacity: 0 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
            >
              <div className="mx-auto max-w-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-text-primary">
                      {totalQuantity} items in cart
                    </p>
                    <p className="mt-1 text-xs text-text-secondary">
                      Subtotal ₹{subtotal} + delivery ₹{deliveryFee}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-text-primary">₹{total}</p>
                    <p className="text-xs text-text-secondary">Total</p>
                  </div>
                </div>
                <Link href="/checkout">
                  <Button className="mt-4 h-[52px] w-full rounded-lg">
                    Proceed to checkout
                  </Button>
                </Link>
              </div>
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
