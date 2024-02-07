import { join } from "node:path";
import { defineNuxtModule } from "@nuxt/kit";
import { readPackageJSON, writePackageJSON } from "pkg-types";
import { provider } from "std-env";
import { consola } from "./utils";
import { collectBuildCache, restoreBuildCache } from "./cache";

export default defineNuxtModule({
  async setup(_, nuxt) {
    if (
      nuxt.options._prepare ||
      nuxt.options.dev ||
      process.env.NUXT_DISABLE_BUILD_CACHE
    ) {
      return;
    }

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
      const restored = process.env.NUXT_IGNORE_BUILD_CACHE
        ? undefined
        : await restoreBuildCache(nuxt);
      if (restored) {
        // Skip build since it's restored
        nuxt.options.builder = {
          bundle() {
            consola.info("skipping build");
            return Promise.resolve();
          },
        };
      } else {
        // Collect build cache this time
        if (!process.env.SKIP_NUXT_BUILD_CACHE_COLLECT) {
          nuxt.hook("close", async () => {
            await collectBuildCache(nuxt);
          });
        }
      }
    });
  },
});
