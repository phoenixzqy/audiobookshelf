/**
 * App Update Plugin Bridge
 *
 * TypeScript wrapper for the native AppUpdatePlugin.
 * Only active on Android — no-op on web/iOS.
 */

import { registerPlugin } from '@capacitor/core';
import { platformService } from '../services/platformService';

interface AppUpdatePluginInterface {
  installApk(options: { path: string }): Promise<void>;
}

const NativePlugin = registerPlugin<AppUpdatePluginInterface>('AppUpdate');

const noopPlugin: AppUpdatePluginInterface = {
  installApk: async () => {},
};

export const appUpdatePlugin: AppUpdatePluginInterface =
  platformService.isAndroid ? NativePlugin : noopPlugin;
