import { NextResponse } from "next/server";
import { sendNtfy } from "@/lib/alerts/ntfy";

export const runtime = "nodejs";

function verifyToken(request: Request): boolean {
  const expected = process.env.ALERT_TEST_TOKEN;
  if (!expected) return false;

  const token = new URL(request.url).searchParams.get("token");
  return token === expected;
}

export async function GET(request: Request) {
  if (!process.env.ALERT_TEST_TOKEN) {
    return NextResponse.json(
      { error: "ALERT_TEST_TOKEN no configurado en el servidor" },
      { status: 503 }
    );
  }

  if (!verifyToken(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const message =
    "Quinielas — alerta de prueba\n\nMonitoreo ntfy configurado correctamente.";
  const ntfy = await sendNtfy(message, {
    title: "Quinielas (test)",
    priority: "default",
    tags: ["white_check_mark", "quinielas"],
  });

  if (!ntfy.ok) {
    return NextResponse.json(
      { ok: false, ntfyStatus: ntfy.status },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true, ntfyStatus: ntfy.status });
}
