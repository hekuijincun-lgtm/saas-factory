import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ✅ repo root = apps/web/../..
const repoRoot = path.join(__dirname, "..", "..");

/** @type {import("next").NextConfig} */
const config = {
  turbopack: {
    root: repoRoot,
  },
};

export default config;
