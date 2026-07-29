import { readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
const distDirectory = path.join(projectRoot, "dist");
const generatedConfigPath = path.join(
  distDirectory,
  "server",
  "wrangler.json",
);

if (
  path.dirname(distDirectory) !== projectRoot ||
  path.basename(distDirectory) !== "dist"
) {
  throw new Error("Refusing to remove an unexpected build directory");
}

await rm(distDirectory, { recursive: true, force: true });

const npmCli = process.env.npm_execpath;
if (!npmCli) {
  throw new Error("npm_execpath is required to run the clean-build regression");
}

const build = spawnSync(process.execPath, [npmCli, "run", "build"], {
  cwd: projectRoot,
  env: {
    ...process.env,
    NEXT_PUBLIC_SITE_URL: "https://release-audit.example",
    NEXT_PUBLIC_SUPABASE_URL: "https://release-audit.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "publishable-build-placeholder",
  },
  encoding: "utf8",
  stdio: "pipe",
});

if (build.error) {
  throw build.error;
}

if (build.status !== 0) {
  process.stderr.write(build.stdout ?? "");
  process.stderr.write(build.stderr ?? "");
  throw new Error(`Clean production build failed with exit ${build.status}`);
}

await stat(generatedConfigPath);
const generatedConfig = JSON.parse(
  await readFile(generatedConfigPath, "utf8"),
);
const requiredSecrets = generatedConfig.secrets?.required;

if (
  !Array.isArray(requiredSecrets) ||
  requiredSecrets.length !== 1 ||
  requiredSecrets[0] !== "SUPABASE_SERVICE_ROLE_KEY"
) {
  throw new Error(
    "Generated Wrangler config must require exactly SUPABASE_SERVICE_ROLE_KEY",
  );
}

process.stdout.write(
  "Clean build generated the required Worker secret name without a value.\n",
);
