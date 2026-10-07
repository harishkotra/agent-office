/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PRESENCE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
