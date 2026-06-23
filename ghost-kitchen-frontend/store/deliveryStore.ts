"use client";

import { create } from "zustand";

import { api } from "@/lib/api";
import type { DeliveryAssignment } from "@/types";

type DeliveryPortalState = {
  agentId: string;
  isOnline: boolean;
  incomingAssignment: DeliveryAssignment | null;
  activeAssignment: DeliveryAssignment | null;
  activeStep: 1 | 2 | 3;
  offerError: string | null;
  setOnline: (value: boolean) => void;
  receiveAssignment: (assignment: DeliveryAssignment) => void;
  confirmAssignment: (assignment: DeliveryAssignment) => void;
  acceptIncoming: () => Promise<void>;
  declineIncoming: () => Promise<void>;
  advanceStep: () => void;
  completeDelivery: () => void;
};

export const useDeliveryStore = create<DeliveryPortalState>((set, get) => ({
  agentId: "agent-ravi",
  isOnline: false,
  incomingAssignment: null,
  activeAssignment: null,
  activeStep: 1,
  offerError: null,
  setOnline: (value) => set({ isOnline: value }),
  // Order has been OFFERED — shows the full-screen accept/decline modal.
  // Does not, by itself, mean the rider is delivering anything yet.
  receiveAssignment: (assignment) => set({ incomingAssignment: assignment }),
  // Order has been CONFIRMED-assigned (post-acceptance, from order:assigned)
  // — transitions straight into the active-delivery flow.
  confirmAssignment: (assignment) =>
    set({ activeAssignment: assignment, incomingAssignment: null, activeStep: 1 }),
  // Previously only mutated local state — the rider's "Accept" never told
  // the backend anything, so the order stayed offered-but-unconfirmed
  // forever and the customer/shop never found out. Now calls the real
  // accept endpoint and only enters the active-delivery flow on success.
  acceptIncoming: async () => {
    const incomingAssignment = get().incomingAssignment;
    if (!incomingAssignment) return;

    try {
      await api.post(`/delivery/orders/${incomingAssignment.orderId}/accept`);
      set({
        activeAssignment: incomingAssignment,
        incomingAssignment: null,
        activeStep: 1,
        offerError: null,
      });
    } catch (err: any) {
      // Most likely cause: the offer already expired/was reassigned
      // (someone else accepted, or the 30s timeout swept it) — dismiss the
      // modal either way since this offer is no longer actionable.
      set({ incomingAssignment: null, offerError: err?.error ?? "That order is no longer available." });
    }
  },
  declineIncoming: async () => {
    const incomingAssignment = get().incomingAssignment;
    set({ incomingAssignment: null });
    if (!incomingAssignment) return;

    try {
      await api.post(`/delivery/orders/${incomingAssignment.orderId}/reject`);
    } catch {
      // Non-fatal — if the offer already expired/was claimed, there's
      // nothing to reject; the backend's reassignment job is the fallback.
    }
  },
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
