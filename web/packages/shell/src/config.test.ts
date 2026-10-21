import { describe, expect, it } from "vitest"
import { readConfig } from "./config"

describe("readConfig", () => {
  it("requires https outside localhost", () => {
    expect(() => readConfig({ apiUrl: "http://api.example.com", authUrl: "https://x" })).toThrow()
  })
  it("requires all values", () => {
    expect(() => readConfig({ apiUrl: "https://api.example.com" })).toThrow("authUrl")
  })
  it("strips the trailing slash", () => {
    expect(readConfig({ apiUrl: "https://api.example.com/", authUrl: "https://api.example.com/auth/v1" }).apiUrl).toBe("https://api.example.com")
  })
})
