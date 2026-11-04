import { createContext, useContext, type ReactNode } from "react";
import { systemService } from "../services/analysisService";
import type { PublicSettings } from "../types/api";
import { useAsync } from "./useAsync";

interface SettingsState {
  settings: PublicSettings | null;
  error: string | null;
  loading: boolean;
  reload: () => Promise<void>;
}

const SettingsContext = createContext<SettingsState>({
  settings: null,
  error: null,
  loading: true,
  reload: async () => {},
});

export function AppSettingsProvider({ children }: { children: ReactNode }) {
  const { data, error, loading, reload } = useAsync(() => systemService.settings(), []);
  return <SettingsContext.Provider value={{ settings: data, error, loading, reload }}>{children}</SettingsContext.Provider>;
}

export const useAppSettings = () => useContext(SettingsContext);
