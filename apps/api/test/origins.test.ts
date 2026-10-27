import { test } from "node:test";
import assert from "node:assert/strict";
import { createBrowserOriginPolicy } from "../src/origins";

test("local HTTPS uses the same trusted LAN interfaces without allowing HTTP downgrade", () => {
  const policy = createBrowserOriginPolicy(
    { NODE_ENV: "development", WEB_ORIGIN: "https://localhost:5173" },
    ["192.168.1.50"],
  );
  assert.equal(policy.isAllowed("https://192.168.1.50:5173"), true);
  assert.equal(policy.isAllowed("http://192.168.1.50:5173"), false);
});

test("development trusts only this host's private IPv4 interfaces on the configured port", () => {
  const policy = createBrowserOriginPolicy(
    { NODE_ENV: "development", WEB_ORIGIN: "http://localhost:5173" },
    ["192.168.1.50", "10.0.0.8", "172.18.0.1", "203.0.113.3"],
  );
  for (const origin of [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://192.168.1.50:5173",
    "http://10.0.0.8:5173",
    "http://172.18.0.1:5173",
  ])
    assert.equal(policy.isAllowed(origin), true, origin);
  for (const origin of [
    undefined,
    "null",
    "https://attacker.invalid",
    "http://192.168.1.51:5173",
    "http://192.168.1.50:6000",
    "https://192.168.1.50:5173",
    "http://203.0.113.3:5173",
    "http://192.168.1.50.attacker.invalid:5173",
  ])
    assert.equal(policy.isAllowed(origin), false, String(origin));
});

test("LAN inference is disabled outside development and can be explicitly disabled", () => {
  for (const env of [
    { NODE_ENV: "production" },
    { NODE_ENV: "test" },
    {},
    { NODE_ENV: "development", ALLOW_LAN_ORIGINS: "false" },
  ]) {
    const policy = createBrowserOriginPolicy(env, ["192.168.1.50"]);
    assert.equal(policy.isAllowed("http://localhost:5173"), true);
    assert.equal(policy.isAllowed("http://192.168.1.50:5173"), false);
  }
});

test("explicit origins extend the primary origin without enabling arbitrary sites", () => {
  const policy = createBrowserOriginPolicy(
    {
      NODE_ENV: "production",
      WEB_ORIGIN: "https://chat.example.com/",
      WEB_ORIGINS:
        " https://app.example.com, http://192.168.1.50:5173,https://chat.example.com ",
    },
    ["10.0.0.8"],
  );
  assert.equal(policy.isAllowed("https://chat.example.com"), true);
  assert.equal(policy.isAllowed("https://app.example.com"), true);
  assert.equal(policy.isAllowed("http://192.168.1.50:5173"), true);
  assert.equal(policy.isAllowed("http://10.0.0.8:5173"), false);
  assert.equal(
    policy.isAllowed("https://app.example.com.attacker.invalid"),
    false,
  );
  assert.equal(policy.allowed.length, 3);
});

test("invalid configurations fail closed instead of allowing wildcard origins", () => {
  for (const origin of [
    "*",
    "null",
    "file:///tmp/app",
    "https://app.example.com/path",
    "https://user:pass@app.example.com",
    "https://app.example.com/?q=1",
    "https://app.example.com/#fragment",
  ]) {
    assert.throws(() => createBrowserOriginPolicy({ WEB_ORIGINS: origin }, []));
  }
});
