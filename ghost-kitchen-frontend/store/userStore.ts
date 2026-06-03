"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { LocationOption } from "@/types";

export type AppRole = "CUSTOMER" | "RESTAURANT" | "DELIVERY" | "ADMIN";

export interface AppUser {
  id: string;
  name: string;
  email: string;
  roles: AppRole[];
  activeRole: AppRole;
  secondRole?: AppRole | null;
  restaurantId?: string | null;
  phone?: string | null;
}

type UserStore = {
  user: AppUser | null;
  location: LocationOption | null;
  isLocationModalOpen: boolean;

  setUser: (user: AppUser | null) => void;
  setActiveRole: (role: AppRole) => void;
  logout: () => void;
  setLocation: (location: LocationOption) => void;
  openLocationModal: () => void;
  closeLocationModal: () => void;
  clearLocation: () => void;
};

export const useUserStore = create<UserStore>()(
  persist(
    (set, get) => ({
      user: null,
      location: null,
      isLocationModalOpen: false,

      setUser: (user) => set({ user }),
      setActiveRole: (role) => {
        const { user } = get();
        if (user) set({ user: { ...user, activeRole: role } });
      },
      logout: () => set({ user: null }),

      setLocation: (location) => set({ location, isLocationModalOpen: false }),
      openLocationModal: () => set({ isLocationModalOpen: true }),
      closeLocationModal: () => set({ isLocationModalOpen: false }),
      clearLocation: () => set({ location: null }),
    }),
    {
      name: "gk-user",
      partialize: (s) => ({ user: s.user, location: s.location }),
    }
  )
);
