# ▣ Nuxt Build Cache

> [!IMPORTANT]
> This is a highly experimental project. Use at your own risk in production!

## ✨ Quick Start

```sh
npx nuxi module add nuxt-build-cache
```

## 💡 What does it do?

By enabling this module, after a `nuxt build`, Nuxt collects build artifacts from `.nuxt/` dir into a tar file. On subsequent builds, if none of the relevant dependencies or your codes change, Nuxt will avoid the Vite/Webpack build step and simply restore the previous build results.

This is particularly useful to speed up the CI/CD process when only prerendered content (from a CMS for example) or server routes are changed and can significantly speed up build speeds ([up to 2x!](https://twitter.com/_pi0_/status/1755333805349507100)). This is a similar feature [we introduced in Nuxt 2](https://nuxt.com/blog/nuxt-static-improvements).

### How does the module determine if a new build is required?

We generate a hash of the current state during the build from various sources using [unjs/ohash](https://github.com/unjs/ohash) and then use this hash to store the build artifacts. (By default in `node_modules/.cache/nuxt/build/{hash}/`). This way each cache is unique to the project state it was built from.

The hash is generated from your code and all Nuxt layers (that are not in `node_modules`):

- Loaded config
- Files in known Nuxt directories (`pages/`, `layouts/`, `app.vue`, ...)
- Known project root files (`package.json`, `.nuxtrc`, `.npmrc`, package manager lock-file, ...)

> [!NOTE]
> File hashes are based on their size and content digest (murmurHash v3)

> [!IMPORTANT]
> Config layer hashes will be generated from the loaded value.
> If you have a config like `{ date: new Date() }`, the cache will not work! But if you update a runtime value in `nuxt.config` (like an environment variable), it will be used as a source for your build hashes 👍

## ⚙️ Environment variables

- `NUXT_DISABLE_BUILD_CACHE`: Disable the module entirely
- `NUXT_IGNORE_BUILD_CACHE`: Skip restoring cache even if it exists
