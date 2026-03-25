"use client";

import { create } from "zustand";

import type { LocationOption, UserRole } from "@/types";

type UserStore = {
  role: UserRole;
  location: LocationOption | null;
  isLocationModalOpen: boolean;
  setRole: (role: UserRole) => void;
  setLocation: (location: LocationOption) => void;
  openLocationModal: () => void;
  closeLocationModal: () => void;
  clearLocation: () => void;
};

export const useUserStore = create<UserStore>((set) => ({
  role: "customer",
  location: null,
  isLocationModalOpen: false,
  setRole: (role) => set({ role }),
  setLocation: (location) => set({ location, isLocationModalOpen: false }),
  openLocationModal: () => set({ isLocationModalOpen: true }),
  closeLocationModal: () => set({ isLocationModalOpen: false }),
  clearLocation: () => set({ location: null }),
}));
