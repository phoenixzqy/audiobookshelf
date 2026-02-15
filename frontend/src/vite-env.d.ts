/// <reference types="vite/client" />

declare const __BUILD_TARGET__: string;
declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
