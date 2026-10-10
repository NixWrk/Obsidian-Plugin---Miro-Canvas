import esbuild from "esbuild";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { offlinePdfPlugin } from "./scripts/offline-pdf-build.mjs";
import { checkProductionBundle } from "./scripts/check-production.mjs";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");
export const workerInjection = path.join(rootDir, "__miro-export-worker-source__.js");
const workerInputs = new Set([
  "src/export-worker.ts",
  "src/export-worker-protocol.ts",
  "src/export-files.ts",
].map((file) => path.join(rootDir, file)));

// Bundle a reviewed worker entry at build time, including its watch dependencies.
export const exportWorkerPlugin = {
  name: "miro-export-worker",
  setup(build) {
    build.onResolve({ filter: /__miro-export-worker-source__\.js$/ }, () => ({
      path: workerInjection,
      namespace: "miro-export-worker",
    }));
    build.onLoad({ filter: /.*/, namespace: "miro-export-worker" }, async () => {
      const worker = await esbuild.build({
        absWorkingDir: rootDir,
        entryPoints: [path.join(rootDir, "src", "export-worker.ts")],
        bundle: true,
        platform: "browser",
        format: "iife",
        target: "es2020",
        write: false,
        metafile: true,
        sourcemap: false,
        minify: production,
        logLevel: "silent",
      });
      const inputs = Object.keys(worker.metafile.inputs).map((file) => path.resolve(rootDir, file));
      if (inputs.some((file) => !workerInputs.has(file))
        || Object.values(worker.metafile.outputs).some((output) => output.imports.length > 0)) {
        throw new Error("Export worker must contain only the reviewed local packing modules.");
      }
      return {
        contents: `export const __MIRO_EXPORT_WORKER_SOURCE__ = ${JSON.stringify(worker.outputFiles[0].text)};`,
        loader: "js",
        watchFiles: inputs,
      };
    });
  },
};

// Importing the build hooks for verification never writes main.js.
if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  const pdfLicenses = await Promise.all(["jspdf", "svg2pdf.js", "fflate"].map(async name => {
    const license = await readFile(path.join(rootDir, "node_modules", name, "LICENSE"), "utf8");
    return `Bundled ${name}:\n${license.replace(/\r\n/g, "\n")}`;
  }));
  const context = await esbuild.context({
    entryPoints: [path.join(rootDir, "src", "main.ts")],
    outfile: path.join(rootDir, "main.js"),
    bundle: true,
    platform: "browser",
    format: "cjs",
    target: "es2020",
    external: ["obsidian", "electron"],
    inject: [workerInjection],
    plugins: [exportWorkerPlugin, offlinePdfPlugin],
    banner: { js: `/*! Offline PDF dependency notices\n${pdfLicenses.join("\n")} */` },
    sourcemap: production ? false : "inline",
    minify: production,
    logLevel: "info"
  });

  if (watch) {
    await context.watch();
    console.log("[miro-canvas] watching for changes");

    const dispose = async () => {
      await context.dispose();
    };
    process.once("SIGINT", dispose);
    process.once("SIGTERM", dispose);
  } else {
    try {
      await context.rebuild();
      if (production) await checkProductionBundle(path.join(rootDir, "main.js"));
    } finally {
      await context.dispose();
    }
  }
}
