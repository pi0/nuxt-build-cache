import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { colorize } from "consola/utils";
import { defineNuxtModule, useLogger, isIgnored } from "@nuxt/kit";
import { createTar, parseTar } from "nanotar";
import { hash, objectHash } from "ohash";
import { readPackageJSON, writePackageJSON } from "pkg-types";
import { provider, type ProviderName } from "std-env";
import { readFilesRecursive } from "./utils";

const cacheDirs: Partial<Record<ProviderName, string>> & { default: string } = {
  default: "node_modules/.cache/nuxt/builds",
  cloudflare_pages: ".next/cache/nuxt",
};

export default defineNuxtModule({
  async setup(_, nuxt) {
    if (
      nuxt.options._prepare ||
      nuxt.options.dev ||
      process.env.NUXT_DISABLE_BUILD_CACHE
    ) {
      return;
    }
    const logger = useLogger("nuxt-build-cache");

    // Hack clouflare pages while Nuxt is not supported
    if (provider === "cloudflare_pages") {
      const pkg = await readPackageJSON(nuxt.options.workspaceDir).catch(
        () => undefined
      );
      await writePackageJSON(join(nuxt.options.workspaceDir, "package.json"), {
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
          if (process.env.SKIP_NUXT_BUILD_CACHE_COLLECT) {
            return;
          }
          await collectBuildCache();
        });
      }
    });

    // --- collect hashes from project ---
    type HashSource = { name: string; data: any };
    type Hashes = { hash: string; sources: HashSource[] };
    let _cachedHashes: ReturnType<typeof _getHashes> | undefined;
    function getHashes() {
      if (!_cachedHashes) {
        _cachedHashes = _getHashes();
      }
      return _cachedHashes;
    }
    async function _getHashes(): Promise<Hashes> {
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

        const sourceFiles = await readFilesRecursive(layer.config?.srcDir, {
          shouldIgnore: isIgnored, // TODO: Validate if works with absolute paths
          noData: true,
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
          data: sourceFiles,
        });

        const rootFiles = await readFilesRecursive(
          layer.config?.rootDir || layer.cwd,
          {
            shouldIgnore: isIgnored, // TODO: Validate if works with absolute paths
            noData: true,
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
          data: rootFiles,
        });
      }

      return {
        hash: hash(hashSources),
        sources: hashSources,
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
        `Collecting nuxt build cache \n  - from \`${nuxt.options.buildDir}\``
      );
      const fileEntries = await readFilesRecursive(nuxt.options.buildDir, {
        patterns: ["**/*", "!analyze/**"],
      });
      const tarData = await createTar(fileEntries);
      await writeFile(cacheFile, tarData);
      logger.success(
        `Nuxt build cache collected in \`${
          Date.now() - start
        }ms\` \n  - to \`${cacheDir}\`\n` +
          colorize("gray", fileEntries.map((e) => `  ▣ ${e.name}`).join("\n"))
      );
    }

    // -- restore build cache --
    async function restoreBuildCache(): Promise<boolean> {
      if (process.env.NUXT_IGNORE_BUILD_CACHE) {
        return false;
      }
      const { cacheFile, cacheDir } = await getCacheStore();
      if (!existsSync(cacheFile)) {
        logger.info(`No build cache found \n  - in \`${cacheFile}\``);
        return false;
      }
      const start = Date.now();
      logger.start(
        `Restoring nuxt from build cache \n  - from: \`${cacheDir}\``
      );
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
        await writeFile(filePath, file.data!);
      }
      logger.success(
        `Nuxt build cache restored in \`${
          Date.now() - start
        }ms\` \n  - into: \`${nuxt.options.buildDir}\``
      );
      return true;
    }
  },
});
