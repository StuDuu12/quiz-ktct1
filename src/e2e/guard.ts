import "server-only";

type E2EEnvironment = {
  E2E_MODE?: string;
  E2E_TEST_SERVER?: string;
  NODE_ENV?: string;
};

export function isE2EEnabled(
  environment?: E2EEnvironment,
) {
  const resolved = environment ?? {
    E2E_MODE: process.env.E2E_MODE,
    E2E_TEST_SERVER: process.env.E2E_TEST_SERVER,
    NODE_ENV: process.env.NODE_ENV,
  };
  return (
    resolved.E2E_MODE === "1" &&
    resolved.E2E_TEST_SERVER === "1" &&
    resolved.NODE_ENV !== "production"
  );
}

export function assertE2EEnabled() {
  if (!isE2EEnabled()) throw new Error("E2E_FIXTURE_DISABLED");
}
