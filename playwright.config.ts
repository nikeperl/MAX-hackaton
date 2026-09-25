import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  use: { baseURL: "http://127.0.0.1:5174", headless: true },
  webServer: {
    command: "npm run dev",
    env: {
      NODE_ENV: "development",
      DEMO_MODE: "true",
      MAX_BOT_TOKEN: "",
      MAX_BOT_USERNAME: "",
      MAX_WEBHOOK_SECRET: "",
      PORT: "3003",
      DATABASE_PATH: "./.cache/e2e.sqlite",
      VITE_API_PROXY: "http://127.0.0.1:3003",
      VITE_DEV_PORT: "5174",
    },
    url: "http://127.0.0.1:5174",
    reuseExistingServer: false,
    timeout: 30000,
  },
});
