/**
 * Media Controls Plugin Bridge
 *
 * TypeScript wrapper for the native MediaControlsPlugin.
 * Only active on Android — no-op on web/iOS.
 */

import { registerPlugin } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';
import { platformService } from '../services/platformService';

interface MediaControlsPluginInterface {
  updateMetadata(options: {
    title: string;
    artist: string;
    album: string;
    artUrl?: string;
  }): Promise<void>;

  updatePlaybackState(options: {
    isPlaying: boolean;
    position: number; // seconds
    duration: number; // seconds
  }): Promise<void>;

  destroy(): Promise<void>;

  addListener(
    event: 'mediaAction',
    handler: (data: { action: string }) => void
  ): Promise<PluginListenerHandle>;
}

const NativePlugin = registerPlugin<MediaControlsPluginInterface>('MediaControls');

// No-op wrapper for non-Android platforms
const noopPlugin: MediaControlsPluginInterface = {
  updateMetadata: async () => {},
  updatePlaybackState: async () => {},
  destroy: async () => {},
  addListener: async () => ({ remove: async () => {} }),
};

/** Get the appropriate plugin (native on Android, no-op elsewhere) */
export const mediaControlsPlugin: MediaControlsPluginInterface =
  platformService.isAndroid ? NativePlugin : noopPlugin;
