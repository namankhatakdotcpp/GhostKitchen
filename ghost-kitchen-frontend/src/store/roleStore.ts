import { create } from "zustand";

export type Role = "Customer" | "Restaurant" | "Delivery";

type RoleStore = {
  activeRole: Role;
  setRole: (role: Role) => void;
};

export const useRoleStore = create<RoleStore>()((set) => ({
  activeRole: "Customer",
  setRole: (role) => set({ activeRole: role }),
}));
