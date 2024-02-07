import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { colorize } from "consola/utils";
import { isIgnored } from "@nuxt/kit";
import type { Nuxt } from "@nuxt/schema";
import { createTar, parseTar } from "nanotar";
import { hash, murmurHash, objectHash } from "ohash";
import { consola, readFilesRecursive } from "./utils";
import { provider, type ProviderName } from "std-env";

type HashSource = { name: string; data: any };
type Hashes = { hash: string; sources: HashSource[] };

const cacheDirs: Partial<Record<ProviderName, string>> & { default: string } = {
  default: "node_modules/.cache/nuxt/builds",
  cloudflare_pages: ".next/cache/nuxt",
};

export async function getHashes(nuxt: Nuxt): Promise<Hashes> {
  if ((nuxt as any)._buildHash) {
    return (nuxt as any)._buildHash;
  }

  const hashSources: HashSource[] = [];

  // Layers
  let layerCtr = 0;
  for (const layer of nuxt.options._layers) {
    if (layer.cwd.includes("node_modules")) {
      continue;
    }
    const layerName = `layer#${layerCtr++}`;
    hashSources.push({
      name: `${layerName}:config`,
      data: objectHash(layer.config),
    });

    const normalizeFiles = (
      files: Awaited<ReturnType<typeof readFilesRecursive>>
    ) =>
      files.map((f) => ({
        name: f.name,
        size: (f.attrs as any)?.size,
        data: murmurHash(f.data as any /* ArrayBuffer */),
      }));

    const sourceFiles = await readFilesRecursive(layer.config?.srcDir, {
      shouldIgnore: isIgnored, // TODO: Validate if works with absolute paths
      patterns: [
        ...Object.values({
          ...nuxt.options.dir,
          ...layer.config.dir,
        }).map((dir) => `${dir}/**`),
        "app.{vue,js,ts,cjs,mjs}",
        "App.{vue,js,ts,cjs,mjs}",
      ],
    });

    hashSources.push({
      name: `${layerName}:src`,
      data: normalizeFiles(sourceFiles),
    });

    const rootFiles = await readFilesRecursive(
      layer.config?.rootDir || layer.cwd,
      {
        shouldIgnore: isIgnored, // TODO: Validate if works with absolute paths
        patterns: [
          ".nuxtrc",
          ".npmrc",
          "package.json",
          "package-lock.json",
          "yarn.lock",
          "pnpm-lock.yaml",
          "tsconfig.json",
          "bun.lockb",
        ],
      }
    );

    hashSources.push({
      name: `${layerName}:root`,
      data: normalizeFiles(rootFiles),
    });
  }

  const res = ((nuxt as any)._buildHash = {
    hash: hash(hashSources),
    sources: hashSources,
  });

  return res;
}

export async function getCacheStore(nuxt: Nuxt) {
  const hashes = await getHashes(nuxt);
  const cacheDir = join(
    nuxt.options.workspaceDir,
    cacheDirs[provider] || cacheDirs.default,
    hashes.hash
  );
  const cacheFile = join(cacheDir, "nuxt.tar");
  return {
    hashes,
    cacheDir,
    cacheFile,
  };
}

export async function collectBuildCache(nuxt: Nuxt) {
  const { cacheDir, cacheFile, hashes } = await getCacheStore(nuxt);
  await mkdir(cacheDir, { recursive: true });
  await writeFile(
    join(cacheDir, "hashes.json"),
    JSON.stringify(hashes, undefined, 2)
  );

  const start = Date.now();
  consola.start(
    `Collecting nuxt build cache \n  - from \`${nuxt.options.buildDir}\``
  );
  const fileEntries = await readFilesRecursive(nuxt.options.buildDir, {
    patterns: ["**/*", "!analyze/**"],
  });
  const tarData = await createTar(fileEntries);
  await _cfPagesHack(nuxt.options.workspaceDir);
  await writeFile(cacheFile, tarData);
  consola.success(
    `Nuxt build cache collected in \`${
      Date.now() - start
    }ms\` \n  - to \`${cacheDir}\`\n` +
      colorize("gray", fileEntries.map((e) => `  ▣ ${e.name}`).join("\n"))
  );
}

export async function restoreBuildCache(nuxt: Nuxt): Promise<boolean> {
  const { cacheFile, cacheDir } = await getCacheStore(nuxt);
  if (!existsSync(cacheFile)) {
    consola.info(`No build cache found \n  - in \`${cacheFile}\``);
    return false;
  }
  const start = Date.now();
  consola.start(`Restoring nuxt from build cache \n  - from: \`${cacheDir}\``);
  const files = parseTar(await readFile(cacheFile));
  for (const file of files) {
    const filePath = join(nuxt.options.buildDir, file.name);
    if (existsSync(filePath)) {
      const stats = await stat(filePath);
      if (stats.mtime.getTime() >= (file.attrs?.mtime || 0)) {
        consola.debug(
          `Skipping \`${file.name}\` (up to date or newer than cache)`
        );
        continue;
      }
    }
    await mkdir(join(filePath, ".."), { recursive: true });
    await writeFile(filePath, file.data!);
  }
  consola.success(
    `Nuxt build cache restored in \`${Date.now() - start}ms\` \n  - into: \`${
      nuxt.options.buildDir
    }\``
  );
  return true;
}

async function _cfPagesHack(dir: string) {
  // Hack clouflare pages while Nuxt is not supported
  if (provider === "cloudflare_pages") {
    const { readPackageJSON, writePackageJSON } = await import("pkg-types");
    const pkg = await readPackageJSON(dir).catch(() => undefined);
    await writePackageJSON(join(dir, "package.json"), {
      ...pkg,
      devDependencies: {
        ...pkg?.devDependencies,
        next: "npm:just-a-placeholder@0.0.0",
      },
    });
  }
}
