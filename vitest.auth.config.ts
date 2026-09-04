import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": new URL("./src", import.meta.url).pathname } },
  test: {
    environment: "node",
    include: ["tests/public-auth-integration.test.ts"],
    env: { PUBLIC_AUTH_INTEGRATION: "1" },
  },
});
