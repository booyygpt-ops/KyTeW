const { contextBridge } = require("electron");
// No filesystem, shell, token, or arbitrary IPC access is exposed to the renderer.
contextBridge.exposeInMainWorld(
  "kytew",
  Object.freeze({ platform: process.platform, version: "0.2.0" }),
);
