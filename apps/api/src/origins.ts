import { networkInterfaces } from "node:os";
import { isIPv4 } from "node:net";

function privateIPv4(address: string): boolean {
  if (!isIPv4(address)) return false;
  const [a, b] = address.split(".").map(Number);
  return (
    a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
  );
}

function originUrl(value: string): URL {
  const url = new URL(value);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new Error(
      "WEB_ORIGIN/WEB_ORIGINS yalnızca http(s) kaynak adresleri içermelidir.",
    );
  return url;
}

// Never infer trust from Host, forwarded headers, or a client's private IP.
// Only this machine's actual private interfaces are added in development.
export function createBrowserOriginPolicy(
  env: NodeJS.ProcessEnv = process.env,
  localAddresses: string[] = Object.values(networkInterfaces()).flatMap(
    (interfaces) =>
      interfaces
        ?.filter((i) => !i.internal && i.family === "IPv4")
        .map((i) => i.address) ?? [],
  ),
) {
  const primary = originUrl(env.WEB_ORIGIN ?? "http://localhost:5173");
  const allowed = new Set([primary.origin]);
  for (const value of (env.WEB_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)) {
    allowed.add(originUrl(value).origin);
  }
  if (env.NODE_ENV === "development" && env.ALLOW_LAN_ORIGINS !== "false") {
    for (const address of [
      "127.0.0.1",
      ...localAddresses.filter(privateIPv4),
    ]) {
      const url = new URL(primary.origin);
      url.hostname = address;
      allowed.add(url.origin);
    }
  }
  return {
    allowed: [...allowed],
    isAllowed: (origin: string | undefined) =>
      typeof origin === "string" && allowed.has(origin),
  };
}

export const browserOrigins = createBrowserOriginPolicy();
