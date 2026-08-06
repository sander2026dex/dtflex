const os = require("os");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// Salt embutido (ofuscado) — dificulta edição manual do arquivo de licença.
const SALT = Buffer.from("ZHRmbGV4cHJvLWRlc2t0b3AtbGljZW5zZS12MQ==", "base64").toString();
const API_BASE = "https://dtflexpro.com";

function deviceId() {
  const nets = os.networkInterfaces();
  let mac = "";
  Object.keys(nets).forEach((k) => {
    (nets[k] || []).forEach((n) => {
      if (!n.internal && n.mac && n.mac !== "00:00:00:00:00:00" && !mac) mac = n.mac;
    });
  });
  const raw = [os.hostname(), os.platform(), os.arch(), os.userInfo().username, mac].join("|");
  return crypto.createHash("sha256").update(SALT + raw).digest("hex").slice(0, 64);
}

function key() {
  return crypto.createHash("sha256").update(SALT + deviceId()).digest();
}

function licensePath(app) {
  return path.join(app.getPath("userData"), "license.bin");
}

function save(app, data) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(JSON.stringify(data), "utf8"), cipher.final()]);
  const payload = Buffer.concat([iv, cipher.getAuthTag(), enc]);
  fs.mkdirSync(path.dirname(licensePath(app)), { recursive: true });
  fs.writeFileSync(licensePath(app), payload);
}

function load(app) {
  try {
    const buf = fs.readFileSync(licensePath(app));
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key(), iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]);
    return JSON.parse(dec.toString("utf8"));
  } catch (_) {
    return null;
  }
}

function clear(app) {
  try {
    fs.unlinkSync(licensePath(app));
  } catch (_) {}
}

// Relógio anti-retrocesso: se a data do sistema voltar no tempo, invalida.
function isValid(lic) {
  if (!lic || !lic.expiresAt || !lic.signature) return false;
  if (lic.deviceId !== deviceId()) return false;
  const now = Date.now();
  if (lic.lastSeen && now < lic.lastSeen - 6 * 3600 * 1000) return false;
  return new Date(lic.expiresAt).getTime() > now;
}

async function activate(email, code) {
  const res = await fetch(`${API_BASE}/api/public/desktop-activate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, code, deviceId: deviceId() }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    throw new Error(data.error || "Não foi possível ativar. Verifique o código.");
  }
  return { ...data, lastSeen: Date.now(), activatedAt: Date.now() };
}

// Revalidação silenciosa quando há internet (bloqueia plano revogado/expirado).
async function revalidate(app, lic) {
  try {
    const fresh = await activate(lic.email, lic.code);
    save(app, { ...fresh, code: lic.code });
    return { ok: true };
  } catch (e) {
    if (String(e && e.message).match(/expirad|bloquead|inválid/i)) {
      clear(app);
      return { ok: false, error: e.message };
    }
    // Offline: mantém a licença dentro da validade.
    save(app, { ...lic, lastSeen: Date.now() });
    return { ok: true, offline: true };
  }
}

module.exports = { deviceId, save, load, clear, isValid, activate, revalidate };
