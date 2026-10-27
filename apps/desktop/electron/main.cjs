const { app, BrowserWindow, session } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { audioPermissionAllowed } = require("./permissions.cjs");
const localEnv = path.resolve(__dirname, "../../../.env");
const localAppUrl =
  !app.isPackaged && fs.existsSync(localEnv)
    ? require("node:util").parseEnv(fs.readFileSync(localEnv, "utf8"))
        .KYTEW_APP_URL
    : undefined;
const configuredUrl = app.isPackaged
  ? JSON.parse(
      fs.readFileSync(
        path.join(process.resourcesPath, "app-config.json"),
        "utf8",
      ),
    ).appUrl
  : "http://localhost:5173";
const appUrl = process.env.KYTEW_APP_URL || localAppUrl || configuredUrl;
function trusted(value) {
  try {
    const u = new URL(value);
    return u.origin === new URL(appUrl).origin;
  } catch {
    return false;
  }
}
app.whenReady().then(() => {
  const u = new URL(appUrl);
  if (
    u.protocol !== "https:" &&
    !(u.protocol === "http:" && ["localhost", "127.0.0.1"].includes(u.hostname))
  )
    throw new Error("KYTEW_APP_URL must use HTTPS outside localhost.");
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 880,
    minHeight: 600,
    title: "KYTEW",
    backgroundColor: "#10131B",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  session.defaultSession.setPermissionRequestHandler(
    (contents, permission, callback, details) => {
      callback(
        contents === win.webContents &&
          audioPermissionAllowed(
            appUrl,
            details.requestingUrl,
            permission,
            details,
          ),
      );
    },
  );
  session.defaultSession.setPermissionCheckHandler(
    (contents, permission, origin, details) => {
      return (
        contents === win.webContents &&
        audioPermissionAllowed(appUrl, origin, permission, details)
      );
    },
  );
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (event, url) => {
    if (!trusted(url)) event.preventDefault();
  });
  win.webContents.on("will-attach-webview", (event) => event.preventDefault());
  win.loadURL(appUrl);
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) app.relaunch();
  });
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
