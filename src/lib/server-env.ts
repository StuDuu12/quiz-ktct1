import "next/dist/compiled/server-only";

import { parseOptionalServerEnv } from "@/src/lib/server-env-schema";

export function getOptionalServerEnv() {
  return parseOptionalServerEnv(process.env);
}
