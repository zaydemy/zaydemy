/** Runs once when the server starts. Node-only work lives in its own module. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}
