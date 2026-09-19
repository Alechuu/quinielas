/**
 * Local cabezas / numerazo sync test.
 *
 *   pnpm install
 *   pnpm test:cabezas
 *   pnpm test:cabezas -- --force
 */
import { syncCabezasFromInstagram } from "@/lib/cabezas/sync";

async function main() {
  const force = process.argv.includes("--force");
  const started = Date.now();

  console.log(`[cabezas] sync start (force=${force})`);

  const result = await syncCabezasFromInstagram({ force });

  console.log(JSON.stringify(result, null, 2));
  console.log(`[cabezas] done in ${Date.now() - started}ms, ok=${result.ok}`);

  process.exit(result.ok ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
