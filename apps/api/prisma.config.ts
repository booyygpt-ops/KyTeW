import { defineConfig } from "prisma/config";
import { PrismaPg } from "@prisma/adapter-pg";
// Rust-free engines: npm integrity covers the shipped WASM compiler artifacts.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  experimental: { adapter: true },
  engine: "js",
  adapter: async () =>
    new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});
