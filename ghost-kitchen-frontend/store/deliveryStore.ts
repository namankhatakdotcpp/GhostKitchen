"use client";

import { create } from "zustand";

import type { DeliveryAssignment } from "@/types";

type DeliveryPortalState = {
  agentId: string;
  isOnline: boolean;
  incomingAssignment: DeliveryAssignment | null;
  activeAssignment: DeliveryAssignment | null;
  activeStep: 1 | 2 | 3;
  setOnline: (value: boolean) => void;
  receiveAssignment: (assignment: DeliveryAssignment) => void;
  acceptIncoming: () => void;
  declineIncoming: () => void;
  advanceStep: () => void;
  completeDelivery: () => void;
};

export const useDeliveryStore = create<DeliveryPortalState>((set, get) => ({
  agentId: "agent-ravi",
  isOnline: false,
  incomingAssignment: null,
  activeAssignment: null,
  activeStep: 1,
  setOnline: (value) => set({ isOnline: value }),
  receiveAssignment: (assignment) => set({ incomingAssignment: assignment }),
  acceptIncoming: () => {
    const incomingAssignment = get().incomingAssignment;

    if (!incomingAssignment) {
      return;
    }

    set({
      activeAssignment: incomingAssignment,
      incomingAssignment: null,
      activeStep: 1,
    });
  },
  declineIncoming: () => set({ incomingAssignment: null }),
  advanceStep: () => {
    const currentStep = get().activeStep;

    if (currentStep >= 3) {
      return;
    }

    set({ activeStep: (currentStep + 1) as 1 | 2 | 3 });
  },
  completeDelivery: () =>
    set({
      activeAssignment: null,
      incomingAssignment: null,
      activeStep: 1,
    }),
}));
