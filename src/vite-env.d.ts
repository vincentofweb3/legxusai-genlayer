/// <reference types="vite/client" />

import type { BrowserProvider } from './lib/genlayer/client'

interface ImportMetaEnv {
  readonly VITE_GENLAYER_ENV?: string
  readonly VITE_DISPUTE_CONTRACT_ADDRESS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare global {
  interface Window {
    ethereum?: BrowserProvider
  }
}

export {}
