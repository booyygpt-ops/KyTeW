const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { randomBytes } = require("node:crypto");
const { isIPv4 } = require("node:net");
const root = path.resolve(__dirname, "..");
const envPath = path.join(root, ".env");
if (!fs.existsSync(envPath))
  fs.copyFileSync(path.join(root, ".env.example"), envPath);
process.loadEnvFile(envPath);
const addresses = Object.values(os.networkInterfaces())
  .flat()
  .filter((i) => i && !i.internal && i.family === "IPv4")
  .map((i) => i.address);
const preferred =
  addresses.find((i) => i.startsWith("192.168.")) ||
  addresses.find((i) => i.startsWith("10.")) ||
  addresses.find((i) => /^172\.(1[6-9]|2\d|3[01])\./.test(i));
const values = {
  LIVEKIT_API_KEY:
    process.env.LIVEKIT_API_KEY || `kytew_${randomBytes(12).toString("hex")}`,
  LIVEKIT_API_SECRET:
    process.env.LIVEKIT_API_SECRET || randomBytes(32).toString("hex"),
  LIVEKIT_INTERNAL_URL:
    process.env.LIVEKIT_INTERNAL_URL || "http://localhost:7880",
  LIVEKIT_URL: process.env.LIVEKIT_URL || "/livekit",
};
const nodeIp = process.env.LIVEKIT_NODE_IP || preferred || "127.0.0.1";
if (!isIPv4(nodeIp))
  throw new Error(
    "LIVEKIT_NODE_IP must be the IPv4 address reachable by participants.",
  );
if (
  !/^[A-Za-z0-9_]+$/.test(values.LIVEKIT_API_KEY) ||
  values.LIVEKIT_API_SECRET.length < 32 ||
  /\s/.test(values.LIVEKIT_API_SECRET)
)
  throw new Error(
    "Use an alphanumeric API key and a secret of at least 32 non-whitespace characters.",
  );
const original = fs.readFileSync(envPath, "utf8");
const additions = Object.entries(values)
  .filter(([key]) => !process.env[key])
  .map(([key, value]) => `${key}=${JSON.stringify(value)}`);
if (additions.length)
  fs.appendFileSync(
    envPath,
    `\n# Local LiveKit credentials (generated; never commit)\n${additions.join("\n")}\n`,
    { mode: 0o600 },
  );
if (process.platform !== "win32") fs.chmodSync(envPath, 0o600);
const local = path.join(root, ".local");
fs.mkdirSync(local, { recursive: true });
const configPath = path.join(local, "livekit.yaml");
const config = `port: 7880\nbind_addresses: ["0.0.0.0"]\nrtc:\n  tcp_port: 7881\n  udp_port: 7882\n  use_external_ip: false\n  node_ip: ${JSON.stringify(nodeIp)}\nkeys:\n  ${JSON.stringify(values.LIVEKIT_API_KEY)}: ${JSON.stringify(values.LIVEKIT_API_SECRET)}\n`;
fs.writeFileSync(configPath, config, { mode: 0o600 });
console.log(
  `LiveKit configuration prepared for media IP ${nodeIp}. Existing credential values were preserved.`,
);
console.log(
  "Start: docker compose --profile voice up -d --wait; then restart npm run dev.",
);
