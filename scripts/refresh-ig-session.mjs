import { chromium } from "playwright";
import { readFileSync, writeFileSync, existsSync } from "fs";
import path from "path";

const ROOT = process.cwd();
const ENV_PATH = path.join(ROOT, ".env");
const COOKIES_PATH = path.join(ROOT, "data", "ig-cookies.json");

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return {};
  const vars = {};
  for (const line of readFileSync(filePath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    vars[trimmed.slice(0, idx)] = trimmed.slice(idx + 1);
  }
  return vars;
}

function upsertEnvVar(filePath, key, value) {
  const line = `${key}=${value}`;
  if (!existsSync(filePath)) {
    writeFileSync(filePath, `${line}\n`, "utf8");
    return;
  }

  const content = readFileSync(filePath, "utf8");
  const pattern = new RegExp(`^${key}=.*$`, "m");
  if (pattern.test(content)) {
    writeFileSync(filePath, content.replace(pattern, line), "utf8");
    return;
  }

  const suffix = content.endsWith("\n") ? "" : "\n";
  writeFileSync(filePath, `${content}${suffix}${line}\n`, "utf8");
}

async function waitForSessionId(context, timeoutMs = 120_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const cookies = await context.cookies("https://www.instagram.com");
    const session = cookies.find((cookie) => cookie.name === "sessionid");
    if (session?.value) return session.value;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return null;
}

async function main() {
  const fileEnv = loadEnvFile(ENV_PATH);
  const username = process.env.IG_USERNAME ?? fileEnv.IG_USERNAME;
  const password = process.env.IG_PASSWORD ?? fileEnv.IG_PASSWORD;
  const headless = process.argv.includes("--headless");

  if (!username || !password) {
    console.error(
      "Faltan credenciales. Agregá IG_USERNAME e IG_PASSWORD en .env"
    );
    process.exit(1);
  }

  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
    locale: "es-AR",
  });
  const page = await context.newPage();

  try {
    await page.goto("https://www.instagram.com/accounts/login/", {
      waitUntil: "domcontentloaded",
    });

    await page.fill('input[name="username"]', username);
    await page.fill('input[name="password"]', password);
    await page.click('button[type="submit"]');

    console.log(
      headless
        ? "Iniciando sesión..."
        : "Si Instagram pide verificación, completala en el navegador..."
    );

    const sessionId = await waitForSessionId(context);
    if (!sessionId) {
      throw new Error(
        "No se obtuvo sessionid. Revisá usuario/clave o completá la verificación."
      );
    }

    const cookies = await context.cookies("https://www.instagram.com");
    writeFileSync(COOKIES_PATH, JSON.stringify(cookies, null, 2), "utf8");
    upsertEnvVar(ENV_PATH, "INSTAGRAM_SESSION_ID", sessionId);

    console.log("Listo. INSTAGRAM_SESSION_ID actualizado en .env");
    console.log(`Cookies guardadas en ${COOKIES_PATH}`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
