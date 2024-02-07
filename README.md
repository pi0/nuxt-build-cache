# Nuxt Build Cache

<!-- automd:badges -->

[![npm version](https://flat.badgen.net/npm/v/nuxt-build-cache)](https://npmjs.com/package/nuxt-build-cache)
[![npm downloads](https://flat.badgen.net/npm/dm/nuxt-build-cache)](https://npmjs.com/package/nuxt-build-cache)

<!-- /automd -->

> [!IMPORTANT]
> This is an highly experimenrtal attempt to support build caching for Nuxt 3. Use at your own risk!

> [!WARNING]
> Currently source code is not included in build-cache! (PR welcome to add) Add a version string in `nuxt.config`!

## ❓ What does it to?

When enabling `nuxt-build-cache` module, after a `nuxt build`, Nuxt collects build artifacts (`.nuxt/`) into a tar file. On subsequent builds if nothing changes, Nuxt will avoid Vite/Webpack build stage and simply restore it.

This is particulary useful to speedup CI/CD process when only prerendered content or server routes are changed and can significantly speed up build speeds. (this is a similar feature [we introduced in Nuxt 2](https://nuxt.com/blog/nuxt-static-improvements)).

### How module determines if a new build is required?

We generate a hash of current state during build from various sources using [unjs/ohash](https://github.com/unjs/ohash) and then use this hash to store the build artifacts. (By default in `node_modules/.cache/nuxt/build/{hash}/`). This way each cache is unique to the project state it was built from.

**Hash is generated from these:**

- Loaded Nuxt config from all layers
- Hash of known package manager lock-file (npm, yarn, pnpm or bun) in the project
- ~~content sources~~ (TODO!)

> [!NOTE]
> Config layer hashes will be generated from loaded value.
> If you have a config like `{ date: new Date() }` cache will not work!

## ✨ Quick Setup

```sh
npx nuxi@latest modules add nuxt-build-cache
```

## Environment variables

- `SKIP_NUXT_BUILD_CACHE`
- `SKIP_NUXT_BUILD_CACHE_COLLECTION`
