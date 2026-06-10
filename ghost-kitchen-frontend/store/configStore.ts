import { create } from "zustand";

export interface SiteConfig {
  maintenanceMode: boolean;
  maintenanceReason?: string | null;
  cashOnDelivery: boolean;
  codMinOrder: number;
  maxDeliveryRadius: number;
  defaultDeliveryFee: number;
  newRestaurantReg: boolean;
  riderRegistrations: boolean;
  allowBranches: boolean;
  maxMenuItems: number;
  requireApproval: boolean;
}

const DEFAULT_CONFIG: SiteConfig = {
  maintenanceMode: false,
  maintenanceReason: null,
  cashOnDelivery: true,
  codMinOrder: 0,
  maxDeliveryRadius: 20,
  defaultDeliveryFee: 3000,
  newRestaurantReg: true,
  riderRegistrations: true,
  allowBranches: true,
  maxMenuItems: 200,
  requireApproval: false,
};

interface ConfigStore {
  config: SiteConfig;
  loaded: boolean;
  setConfig: (config: SiteConfig) => void;
}

export const useConfigStore = create<ConfigStore>((set) => ({
  config: DEFAULT_CONFIG,
  loaded: false,
  setConfig: (config) => set({ config, loaded: true }),
}));
