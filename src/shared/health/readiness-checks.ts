export type ReadinessDependencies = {
  authentication: () => Promise<void>;
  database: () => Promise<void>;
  objectStorage: () => Promise<void>;
};

async function passes(check: () => Promise<void>): Promise<boolean> {
  try {
    await check();
    return true;
  } catch {
    return false;
  }
}

export async function runReadinessChecks(dependencies: ReadinessDependencies) {
  const [authentication, database, objectStorage] = await Promise.all([
    passes(dependencies.authentication),
    passes(dependencies.database),
    passes(dependencies.objectStorage),
  ]);

  return { authentication, database, objectStorage };
}
