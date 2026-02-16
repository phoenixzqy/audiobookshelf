import { create } from 'zustand';
import { networkService, type NetworkStatus, type ConnectionMode } from '../services/networkService';

interface NetworkStoreState {
  status: NetworkStatus;
  connectionMode: ConnectionMode;
  lastOnlineAt: number | null;

  /** Convenience getters */
  isOnline: boolean;
  isWiFi: boolean;

  /** Force a connectivity check */
  checkNow: () => Promise<boolean>;
}

export const useNetworkStore = create<NetworkStoreState>()((set) => {
  // Seed from current service state
  const initial = networkService.getState();

  // Subscribe to changes from networkService
  networkService.subscribe((state) => {
    set({
      status: state.status,
      connectionMode: state.connectionMode,
      lastOnlineAt: state.lastOnlineAt,
      isOnline: state.status === 'online',
      isWiFi: state.connectionMode === 'wifi',
    });
  });

  return {
    status: initial.status,
    connectionMode: initial.connectionMode,
    lastOnlineAt: initial.lastOnlineAt,
    isOnline: initial.status === 'online',
    isWiFi: initial.connectionMode === 'wifi',

    checkNow: async () => {
      const online = await networkService.checkNow();
      return online;
    },
  };
});
