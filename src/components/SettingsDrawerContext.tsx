"use client";

import { createContext, useContext, useState, useCallback } from "react";

interface SettingsDrawerContextValue {
  isOpen: boolean;
  openSettingsDrawer: () => void;
  closeSettingsDrawer: () => void;
  toggleDrawer: () => void;
}

const SettingsDrawerContext = createContext<SettingsDrawerContextValue | undefined>(undefined);

export function SettingsDrawerProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  const openSettingsDrawer = useCallback(() => setIsOpen(true), []);
  const closeSettingsDrawer = useCallback(() => setIsOpen(false), []);
  const toggleDrawer = useCallback(() => setIsOpen((prev) => !prev), []);

  return (
    <SettingsDrawerContext.Provider value={{ isOpen, openSettingsDrawer, closeSettingsDrawer, toggleDrawer }}>
      {children}
    </SettingsDrawerContext.Provider>
  );
}

export function useSettingsDrawer() {
  const context = useContext(SettingsDrawerContext);
  if (context === undefined) {
    throw new Error("useSettingsDrawer must be used within a SettingsDrawerProvider");
  }
  return context;
}
