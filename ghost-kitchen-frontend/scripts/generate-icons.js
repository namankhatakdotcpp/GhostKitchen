// One-time manual script — NOT run by the build pipeline.
//
// Generates the standard Next.js 14 App Router icon set from a single
// high-res square source image at public/logo-source.png:
//   app/favicon.ico        (32x32 .ico)
//   app/icon.png           (512x512 — Next.js auto-serves this as the
//                            browser-tab/app icon)
//   app/apple-icon.png     (180x180 — iOS home screen)
//   public/icon-192.png    (PWA manifest icon)
//   public/icon-512.png    (PWA manifest icon)
//
// Usage: node scripts/generate-icons.js

import sharp from "sharp";
import { existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const source = path.join(root, "public", "logo-source.png");

async function main() {
  if (!existsSync(source)) {
    console.error(`No source image found at ${source}.`);
    console.error("Add a square logo (512x512 or larger) there, then re-run this script.");
    process.exit(1);
  }

  const targets = [
    { out: path.join(root, "app", "icon.png"), size: 512 },
    { out: path.join(root, "app", "apple-icon.png"), size: 180 },
    { out: path.join(root, "public", "icon-192.png"), size: 192 },
    { out: path.join(root, "public", "icon-512.png"), size: 512 },
  ];

  for (const { out, size } of targets) {
    await sharp(source).resize(size, size).png().toFile(out);
    console.log(`OK    ${path.relative(root, out)} (${size}x${size})`);
  }

  // favicon.ico — sharp can't write .ico directly, but a plain 32x32 PNG
  // saved with the .ico extension is accepted by every major browser and is
  // exactly what Next.js's own default favicon.ico is.
  await sharp(source).resize(32, 32).png().toFile(path.join(root, "app", "favicon.ico"));
  console.log("OK    app/favicon.ico (32x32)");

  console.log("\nDone. Icons generated from public/logo-source.png.");
}

main().catch((error) => {
  console.error("Icon generation failed:", error);
  process.exit(1);
});
