import { test } from "node:test";
import assert from "node:assert/strict";
const {
  audioPermissionAllowed,
} = require("../../desktop/electron/permissions.cjs");
test("Electron only permits microphone access for its trusted main frame", () => {
  const origin = "https://chat.example.com";
  assert.equal(
    audioPermissionAllowed(origin, origin + "/room", "media", {
      isMainFrame: true,
      mediaTypes: ["audio"],
    }),
    true,
  );
  assert.equal(
    audioPermissionAllowed(origin, origin, "media", {
      isMainFrame: true,
      mediaType: "audio",
    }),
    true,
  );
  assert.equal(
    audioPermissionAllowed(origin, origin, "speaker-selection", {
      isMainFrame: true,
    }),
    true,
  );
  for (const request of [
    [origin, "media", { isMainFrame: false, mediaTypes: ["audio"] }],
    [
      "https://attacker.invalid",
      "media",
      { isMainFrame: true, mediaTypes: ["audio"] },
    ],
    [origin, "media", { isMainFrame: true, mediaTypes: ["audio", "video"] }],
    [origin, "display-capture", { isMainFrame: true, mediaTypes: ["audio"] }],
    [origin, "media", { isMainFrame: true }],
  ])
    assert.equal(audioPermissionAllowed(origin, ...request), false);
});
