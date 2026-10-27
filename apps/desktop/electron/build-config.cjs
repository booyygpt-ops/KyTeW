const fs = require("node:fs");
const path = require("node:path");
const appUrl = process.env.KYTEW_APP_URL;
if (!appUrl || new URL(appUrl).protocol !== "https:")
  throw new Error(
    "Windows packaging requires KYTEW_APP_URL=https://your-deployed-host",
  );
const dir = path.join(__dirname, "../.local");
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(
  path.join(dir, "app-config.json"),
  JSON.stringify({ appUrl }, null, 2),
);
console.log("KYTEW deployment URL configured for packaging.");
