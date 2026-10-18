export async function register() {
  // The processing worker needs Node APIs and a database; skip the edge runtime and builds.
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.DATABASE_URL) {
    const { startWorker } = await import("./lib/processing/worker");
    startWorker();
  }
}
