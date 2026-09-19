/**
 *   pnpm test:alert
 */
import { sendNtfy } from "@/lib/alerts/ntfy";

async function main() {
  const message =
    "Quinielas — alerta de prueba\n\nMonitoreo ntfy configurado correctamente.";
  const result = await sendNtfy(message, {
    title: "Quinielas (test)",
    priority: "default",
    tags: ["white_check_mark", "quinielas"],
  });

  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
