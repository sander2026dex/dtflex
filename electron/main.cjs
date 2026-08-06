const { app, BrowserWindow, shell, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const http = require("http");
const license = require("./license.cjs");

const ROOT = path.join(__dirname, "..", "app");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".woff2": "font/woff2",
  ".wasm": "application/wasm",
};

let mainWindow = null;
let activationWindow = null;

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
      if (urlPath === "/" || urlPath === "") urlPath = "/index.html";
      urlPath = urlPath.replace(/^\/dtflex-tool/, "");
      if (urlPath === "" || urlPath === "/") urlPath = "/index.html";
      const filePath = path.join(ROOT, path.normalize(urlPath).replace(/^(\.\.[/\\])+/, ""));
      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404);
          res.end("not found");
          return;
        }
        res.writeHead(200, {
          "Content-Type": MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream",
          "Cache-Control": "no-store",
        });
        res.end(data);
      });
    });
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

function openActivation() {
  if (activationWindow) return activationWindow.focus();
  activationWindow = new BrowserWindow({
    width: 460,
    height: 560,
    resizable: false,
    backgroundColor: "#0e1116",
    autoHideMenuBar: true,
    title: "Ativação — DTFLEXPRO Studio",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });
  activationWindow.loadFile(path.join(__dirname, "activation.html"));
  activationWindow.on("closed", () => {
    activationWindow = null;
    if (!mainWindow) app.quit();
  });
}

async function openStudio() {
  if (mainWindow) return mainWindow.focus();
  const port = await startServer();
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    backgroundColor: "#0e1116",
    autoHideMenuBar: true,
    title: "DTFLEXPRO — Halftone Studio",
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  mainWindow.loadURL(`http://127.0.0.1:${port}/index.html`);
}

// Checagem periódica: se o plano vencer com o app aberto, volta para a ativação.
function watchLicense() {
  setInterval(() => {
    const lic = license.load(app);
    if (!license.isValid(lic)) {
      if (mainWindow) {
        mainWindow.destroy();
        mainWindow = null;
      }
      openActivation();
    }
  }, 5 * 60 * 1000);
}

ipcMain.handle("license:activate", async (_e, { email, code }) => {
  try {
    const data = await license.activate(email, code);
    license.save(app, { ...data, code });
    if (activationWindow) {
      const w = activationWindow;
      activationWindow = null;
      w.destroy();
    }
    await openStudio();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
});

async function boot() {
  const lic = license.load(app);
  if (license.isValid(lic)) {
    const res = await license.revalidate(app, lic);
    if (res.ok) {
      await openStudio();
      watchLicense();
      return;
    }
    dialog.showErrorBox("Plano expirado", res.error || "Renove seu plano para continuar.");
  }
  openActivation();
  watchLicense();
}

// Instância única: evita múltiplas cópias burlando a checagem de licença.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) mainWindow.focus();
    else if (activationWindow) activationWindow.focus();
  });
  app.whenReady().then(boot);
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) boot();
});
