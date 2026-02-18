import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// 👇 ここが本命：Turbopack の root を apps/web に固定
const config = {
  turbopack: {
    root: __dirname,
  },
};

export default config;
