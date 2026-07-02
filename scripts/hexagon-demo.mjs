import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const videoDir = path.join(repoRoot, ".github/media");
const outputPath = path.join(videoDir, "hexagon-demo.webm");
const appUrl = process.env.HEXAGON_DEMO_URL || "http://localhost:3000";

fs.mkdirSync(videoDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  recordVideo: {
    dir: videoDir,
    size: { width: 1280, height: 720 },
  },
  viewport: { width: 1280, height: 720 },
});
const page = await context.newPage();

await page.goto(appUrl, { waitUntil: "networkidle", timeout: 120_000 });
await page.waitForSelector("canvas.interactive", { timeout: 30_000 });
await page.waitForTimeout(1500);

await page.getByTestId("toolbar-hexagon").click({ force: true });
await page.waitForTimeout(500);

const canvas = page.locator("canvas.interactive");
const box = await canvas.boundingBox();

if (!box) {
  throw new Error("Could not find interactive canvas bounding box");
}

const drawShape = async (fromX, fromY, toX, toY) => {
  await page.mouse.move(box.x + fromX, box.y + fromY);
  await page.mouse.down();
  await page.mouse.move(box.x + toX, box.y + toY, { steps: 24 });
  await page.mouse.up();
  await page.waitForTimeout(800);
};

await drawShape(180, 120, 420, 320);
await drawShape(500, 140, 760, 340);

await page.waitForTimeout(1200);

const video = page.video();
await context.close();
await browser.close();

if (!video) {
  throw new Error("Playwright did not record a video");
}

const recordedPath = await video.path();
fs.copyFileSync(recordedPath, outputPath);
console.log(`Saved demo video to ${outputPath}`);
