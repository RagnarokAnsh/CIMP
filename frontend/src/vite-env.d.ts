/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Portal origin(s) allowed to deliver a reporter hand-off token via postMessage.
  readonly VITE_PORTAL_ORIGINS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
