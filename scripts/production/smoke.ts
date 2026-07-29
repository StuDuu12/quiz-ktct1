import {
  PRODUCTION_SMOKE_ROUTES,
  parseProductionEnvironment,
} from "./lib";

async function main() {
  const { siteOrigin } = parseProductionEnvironment(process.env);

  for (const route of PRODUCTION_SMOKE_ROUTES) {
    const response = await fetch(new URL(route.path, siteOrigin), {
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
    });
    const location = response.headers.get("location");

    if (route.access === "public" && response.status !== 200) {
      throw new Error(`Smoke check failed for ${route.path}: ${response.status}`);
    }
    if (
      route.access === "redirect" &&
      (response.status < 300 || response.status >= 400)
    ) {
      throw new Error(`Smoke check failed for ${route.path}: ${response.status}`);
    }
    if (
      route.access === "protected" &&
      (response.status < 300 ||
        response.status >= 400 ||
        !location ||
        new URL(location, siteOrigin).pathname !== "/login")
    ) {
      throw new Error(`Protected-route check failed for ${route.path}`);
    }
    console.log(`${route.path}: ${response.status}`);
  }
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : "Production smoke check failed");
  process.exitCode = 1;
}
