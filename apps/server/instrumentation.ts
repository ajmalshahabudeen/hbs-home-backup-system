export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { printBootBanner, term } = await import("./lib/term-log");
    printBootBanner();
    term("BOOT", "Next.js instrumentation register() complete");
  }
}

export async function onRequestError(
  err: { digest?: string } & Error,
  request: { path?: string; method?: string },
  context: { routePath?: string; routeType?: string; routerKind?: string },
) {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { term } = await import("./lib/term-log");
  term(
    "ERROR",
    `unhandled ${request.method ?? "?"} ${request.path ?? context.routePath ?? "?"}`,
    {
      digest: err.digest,
      message: err.message,
      routeType: context.routeType,
      routerKind: context.routerKind,
    },
    "error",
  );
}
