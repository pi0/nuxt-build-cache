import { readdir, readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { colorize } from "consola/utils";
import { defineNuxtModule, useLogger } from "@nuxt/kit";
import { createTar, parseTar, type TarFileInput } from "nanotar";
import { hash, objectHash, murmurHash } from "ohash";
import { detectPackageManager } from "nypm";
import { readPackageJSON, findNearestFile, writePackageJSON } from "pkg-types";
import { provider, type ProviderName } from "std-env";

const cacheDirs: Partial<Record<ProviderName, string>> & { default: string } = {
  default: "node_modules/.cache/nuxt/builds",
  cloudflare_pages: ".next/cache/nuxt",
};

export default defineNuxtModule({
  async setup(_, nuxt) {
    if (
      nuxt.options._prepare ||
      nuxt.options.dev ||
      process.env.SKIP_NUXT_BUILD_CACHE
    ) {
      return;
    }
    const logger = useLogger("nuxt-build-cache");

    // Hack clouflare pages while Nuxt is not supported
    if (provider === "cloudflare_pages") {
      logger.log("!!!! patching pkg !!!");
      const pkg = await readPackageJSON(nuxt.options.rootDir).catch(
        () => undefined
      );
      await writePackageJSON(nuxt.options.rootDir, {
        ...pkg,
        devDependencies: {
          ...pkg?.devDependencies,
          next: "npm:just-a-placeholder@0.0.0",
        },
      });
    }

    // Setup hooks
    nuxt.hook("build:before", async () => {
      // Try to restore
      const restored = await restoreBuildCache();
      if (restored) {
        // Skip build since it's restored
        nuxt.options.builder = {
          bundle() {
            logger.log("(skipping build)");
            return Promise.resolve();
          },
        };
      } else {
        // Collect build cache this time
        nuxt.hook("close", async () => {
          if (process.env.SKIP_NUXT_BUILD_CACHE_COLLECTION) {
            return;
          }
          await collectBuildCache();
        });
      }
    });

    // --- collect hashes from project ---
    type HashSource = { name: string; data: string | number };
    type Hashes = { hash: string; sources: HashSource[] };
    let _cachedHashes: ReturnType<typeof _getHashes> | undefined;
    function getHashes() {
      if (!_cachedHashes) {
        _cachedHashes = _getHashes();
      }
      return _cachedHashes;
    }
    async function _getHashes(): Promise<Hashes> {
      const sources: HashSource[] = [];

      // Layers
      let layerCtr = 0;
      for (const layer of nuxt.options._layers) {
        if (layer.cwd.includes("node_modules")) {
          continue;
        }
        const layerName = `layer#${layerCtr++}`;
        sources.push({
          name: `${layerName}:config`,
          data: objectHash(layer.config),
        });
        // TODO: Include source files (not essential for docs because .docs/ layer has none usually)
      }

      // package.json and lock file
      const pm = await detectPackageManager(nuxt.options.rootDir).catch(
        () => undefined
      );
      if (pm?.lockFile) {
        const lockfilePath = await findNearestFile(pm.lockFile, {
          startingFrom: nuxt.options.rootDir,
        }).catch(() => undefined);
        if (lockfilePath) {
          sources.push({
            name: pm.lockFile,
            data: "murmurHash:" + murmurHash(await readFile(lockfilePath)),
          });
        }
      }
      const pkgJSON = await readPackageJSON(nuxt.options.rootDir).catch(
        () => undefined
      );
      if (pkgJSON) {
        sources.push({
          name: "package.json",
          data: JSON.stringify(pkgJSON),
        });
      }

      return {
        hash: hash(sources),
        sources,
      };
    }

    // -- utility to get current cache dir
    async function getCacheStore() {
      const hashes = await getHashes();
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

    // -- collect build cache --
    async function collectBuildCache() {
      const { cacheDir, cacheFile, hashes } = await getCacheStore();
      await mkdir(cacheDir, { recursive: true });
      await writeFile(
        join(cacheDir, "hashes.json"),
        JSON.stringify(hashes, undefined, 2)
      );

      const start = Date.now();
      logger.start(
        `Collecting nuxt build cache from \`${nuxt.options.buildDir}\`...`
      );
      const fileEntries = await readFilesRecursive(
        nuxt.options.buildDir,
        (fileName) => fileName.startsWith("analyze/")
      );
      const tarData = await createTar(fileEntries);
      await writeFile(cacheFile, tarData);
      logger.success(
        `Nuxt build cache collected in \`${
          Date.now() - start
        }ms\` to \`${cacheDir}\`\n` +
          colorize("gray", fileEntries.map((e) => `├─ ${e.name}`).join("\n"))
      );
    }

    // -- restore build cache --
    async function restoreBuildCache(): Promise<boolean> {
      const { cacheFile, cacheDir } = await getCacheStore();
      if (!existsSync(cacheFile)) {
        logger.info(`No build cache found in \`${cacheFile}\``);
        return false;
      }
      const start = Date.now();
      logger.start(`Restoring nuxt from build cache from \`${cacheDir}\`...`);
      const files = parseTar(await readFile(cacheFile));
      for (const file of files) {
        const filePath = join(nuxt.options.buildDir, file.name);
        if (existsSync(filePath)) {
          const stats = await stat(filePath);
          if (stats.mtime.getTime() >= (file.attrs?.mtime || 0)) {
            logger.debug(
              `Skipping \`${file.name}\` (up to date or newer than cache)`
            );
            continue;
          }
        }
        await mkdir(join(filePath, ".."), { recursive: true });
        await writeFile(filePath, file.data!, { mode: file.attrs?.mode });
      }
      logger.success(
        `Nuxt build cache restored in \`${Date.now() - start}ms\` into \`${
          nuxt.options.buildDir
        }\``
      );
      return true;
    }
  },
});

async function readFilesRecursive(
  dir: string,
  shouldIgnore?: (name: string) => boolean
) {
  const files = await readdir(dir, { recursive: true });
  const fileEntries = await Promise.all(
    files.map(async (fileName) => {
      try {
        if (shouldIgnore?.(fileName)) {
          return;
        }
        const filePath = join(dir, fileName);
        const stats = await stat(filePath);
        if (!stats?.isFile()) {
          return;
        }
        const data = await readFile(filePath);
        return <TarFileInput>{
          name: fileName,
          data,
          attrs: {
            mtime: stats.mtime.getTime(),
          },
        };
      } catch (err) {
        console.warn(
          `[nuxt-build-cache] Failed to read file \`${fileName}\`:`,
          err
        );
      }
    })
  );

  return fileEntries.filter(Boolean) as TarFileInput[];
}
