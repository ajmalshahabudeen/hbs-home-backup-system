/**
 * Better Auth passkey plugin reads options.baseURL (the config object) instead
 * of the per-request ctx.context.baseURL, so LAN hosts collapsed to "localhost".
 * Re-apply after bun install.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const marker = "function resolvePasskeyBaseURL(ctx)";
const needle =
  'typeof ctx.context.options.baseURL === "string" ? ctx.context.options.baseURL : void 0';
const replacement = "resolvePasskeyBaseURL(ctx)";
const helper = `function resolvePasskeyBaseURL(ctx) {
	if (typeof ctx.context.baseURL === "string" && ctx.context.baseURL) return ctx.context.baseURL;
	if (typeof ctx.context.options.baseURL === "string") return ctx.context.options.baseURL;
	return void 0;
}
`;

function main() {
  let file: string;
  try {
    const require = createRequire(import.meta.url);
    file = require.resolve("@better-auth/passkey/dist/index.mjs");
  } catch {
    const fallback = join(
      process.cwd(),
      "node_modules/@better-auth/passkey/dist/index.mjs",
    );
    if (!existsSync(fallback)) {
      console.warn("[hbs] @better-auth/passkey not installed; skip rpID patch");
      return;
    }
    file = fallback;
  }
  let src = readFileSync(file, "utf8");
  if (src.includes(marker) && !src.includes(needle)) {
    return;
  }
  if (!src.includes(needle) && !src.includes(marker)) {
    console.warn("[hbs] passkey plugin shape changed; rpID patch skipped");
    return;
  }
  src = src.replaceAll(needle, replacement);
  if (!src.includes(marker)) {
    src = src.replace(
      "function getRpID(options, baseURL)",
      `${helper}function getRpID(options, baseURL)`,
    );
  }
  writeFileSync(file, src);
  console.log("[hbs] patched @better-auth/passkey to use per-request baseURL as rpID");
}

main();
