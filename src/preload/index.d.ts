import type { ScribeApi } from './index'

declare global {
  interface Window {
    scribe: ScribeApi
  }
}

export {}
