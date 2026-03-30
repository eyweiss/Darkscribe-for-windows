import type { DarkscribeAPI } from '../../../preload/index'

declare global {
  interface Window {
    darkscribe: DarkscribeAPI
  }
}

export {}
