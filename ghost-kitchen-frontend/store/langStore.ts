"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { messages, type LangCode } from "@/lib/i18n";

type LangState = {
  lang: LangCode;
  setLang: (l: LangCode) => void;
  t: (key: string) => string;
};

export const useLangStore = create<LangState>()(
  persist(
    (set, get) => ({
      lang: "en",
      setLang: (lang) => set({ lang }),
      t: (key: string) => messages[get().lang][key] ?? messages.en[key] ?? key,
    }),
    { name: "gk-lang" }
  )
);
