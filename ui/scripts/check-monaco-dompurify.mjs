#!/usr/bin/env node

// Security regression check for Monaco's vendored DOMPurify copy.
//
// Monaco 0.56.0 imports its own dompurify/dompurify.js module instead of the
// package entry used by Mermaid. The Vite plugin in vite.config.ts replaces
// that one import with an isolated 3.4.16 module. Keep this check offline and
// deterministic: it reads only installed source and the already-emitted dist
// assets, never the registry or a browser service.

import { createRequire } from "node:module";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const uiDir = dirname(dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);
const monacoDomSanitizePath = require.resolve(
  "monaco-editor/base/browser/domSanitize.js",
);
const monacoVendoredDompurifyPath = require.resolve(
  "monaco-editor/base/browser/dompurify/dompurify.js",
);
const dompurifyEntryPath = require.resolve("dompurify", {
  paths: [dirname(monacoDomSanitizePath)],
});
const dompurifyDistPath = dirname(dompurifyEntryPath);
const dompurifyPackagePath = join(dompurifyDistPath, "..", "package.json");
const dompurifyEsModulePath = join(dompurifyDistPath, "purify.es.mjs");
const forbiddenVersions = ["3.4.8", "3.4.12"];

function readRequiredFile(path, label) {
  if (!existsSync(path)) {
    throw new Error(`${label} is missing: ${path}`);
  }
  return readFileSync(path, "utf8");
}

const monacoDomSanitizeSource = readRequiredFile(
  monacoDomSanitizePath,
  "Monaco DOMSanitize module",
);
if (!/\bfrom\s+['"]\.\/dompurify\/dompurify\.js['"]/.test(monacoDomSanitizeSource)) {
  throw new Error(
    "Monaco no longer imports ./dompurify/dompurify.js; update the audited Vite replacement.",
  );
}

const monacoVendoredSource = readRequiredFile(
  monacoVendoredDompurifyPath,
  "Monaco vendored DOMPurify module",
);
if (!/DOMPurify\.version\s*=\s*['"][^'"]+['"]/.test(monacoVendoredSource)) {
  throw new Error("Monaco's vendored DOMPurify module is not recognisable.");
}

const dompurifyPackage = JSON.parse(
  readRequiredFile(dompurifyPackagePath, "DOMPurify package manifest"),
);
if (dompurifyPackage.version !== "3.4.16") {
  throw new Error(
    `DOMPurify 3.4.16 is required; found ${String(dompurifyPackage.version)}.`,
  );
}

const replacementSource = readRequiredFile(
  dompurifyEsModulePath,
  "isolated DOMPurify replacement",
);
if (!/DOMPurify\.version\s*=\s*['"]3\.4\.16['"]/.test(replacementSource)) {
  throw new Error("The isolated DOMPurify replacement is not version 3.4.16.");
}

const assetsDir = join(uiDir, "dist", "assets");
if (!existsSync(assetsDir)) {
  throw new Error(`Vite output is missing: ${assetsDir}; run npm run build first.`);
}

const monacoAssets = readdirSync(assetsDir, { withFileTypes: true })
  .filter(
    (entry) =>
      entry.isFile() &&
      /^monaco-[^/]+\.(?:js|mjs|cjs)$/.test(entry.name),
  )
  .map((entry) => entry.name)
  .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));

if (monacoAssets.length === 0) {
  throw new Error(`No emitted Monaco asset found in ${assetsDir}.`);
}

for (const assetName of monacoAssets) {
  const asset = readRequiredFile(join(assetsDir, assetName), "Monaco asset");
  const foundForbidden = forbiddenVersions.filter((version) => asset.includes(version));
  if (foundForbidden.length > 0) {
    throw new Error(
      `${assetName} contains forbidden DOMPurify version(s): ${foundForbidden.join(", ")}.`,
    );
  }
  if (!asset.includes("3.4.16")) {
    throw new Error(`${assetName} does not contain the DOMPurify 3.4.16 replacement.`);
  }
}

console.log(
  `monaco-dompurify: PASS (${monacoAssets.join(", ")} contains isolated DOMPurify 3.4.16)`,
);
