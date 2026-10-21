import { en } from "./en"

export type Key = keyof typeof en

export function t(key: Key): string {
  return en[key]
}
