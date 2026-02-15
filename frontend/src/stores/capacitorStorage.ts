/**
 * Capacitor-aware storage adapter for Zustand persist middleware.
 *
 * On native platforms, uses Capacitor Preferences (survives app updates).
 * On web, falls back to localStorage (default Zustand behavior).
 */

import type { StateStorage } from 'zustand/middleware';
import { platformService } from '../services/platformService';

export const capacitorStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    if (platformService.isNative) {
      return platformService.getPreference(name);
    }
    return localStorage.getItem(name);
  },

  setItem: async (name: string, value: string): Promise<void> => {
    if (platformService.isNative) {
      await platformService.setPreference(name, value);
    } else {
      localStorage.setItem(name, value);
    }
  },

  removeItem: async (name: string): Promise<void> => {
    if (platformService.isNative) {
      await platformService.removePreference(name);
    } else {
      localStorage.removeItem(name);
    }
  },
};
