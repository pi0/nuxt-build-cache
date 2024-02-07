# ▣ Nuxt Build Cache

<!-- automd:badges -->

[![npm version](https://flat.badgen.net/npm/v/nuxt-build-cache)](https://npmjs.com/package/nuxt-build-cache)
[![npm downloads](https://flat.badgen.net/npm/dm/nuxt-build-cache)](https://npmjs.com/package/nuxt-build-cache)

<!-- /automd -->

> [!IMPORTANT]
> This is a highly experimental attempt to support build caching for Nuxt 3. Use at your own risk!

## ❓ What does it do?

When enabling `nuxt-build-cache` module, after a `nuxt build`, Nuxt collects build artifacts (`.nuxt/`) into a tar file. On subsequent builds, if non of the relevant dependencies or code changes, Nuxt will avoid the Vite/Webpack build step and simply restore the previous build results.

This is particularly useful to speed up the CI/CD process when only prerendered content or server routes are changed and can significantly speed up build speeds. (this is a similar feature [we introduced in Nuxt 2](https://nuxt.com/blog/nuxt-static-improvements)).

### How module determine if a new build is required?

We generate a hash of the current state during the build from various sources using [unjs/ohash](https://github.com/unjs/ohash) and then use this hash to store the build artifacts. (By default in `node_modules/.cache/nuxt/build/{hash}/`). This way each cache is unique to the project state it was built from.

The hash is generated from all Nuxt layers (that are not in `node_modules`):

- Loaded config
- Files in known nuxt directories (`pages/`, `layouts/`, `app.vue`, ...)
- Known project root files (`package.json`, `.nuxtrc`, `.npmrc`, package manager lock-file, ...)

> [!NOTE]
> File hashes is based on their size and content digest (murmurHash v3)

> [!NOTE]
> Config layer hashes will be generated from the loaded value.
> If you have a config like `{ date: new Date() }` cache will not work!

## ✨ Quick Setup

```sh
npx nuxi module add nuxt-build-cache
```

## Environment variables

- `NUXT_DISABLE_BUILD_CACHE`: Disable module entirely
- `NUXT_IGNORE_BUILD_CACHE`: Skip restoring cache even if exists
