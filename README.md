# Nuxt Build Cache

<!-- automd:badges -->

[![npm version](https://flat.badgen.net/npm/v/nuxt-build-cache)](https://npmjs.com/package/nuxt-build-cache)
[![npm downloads](https://flat.badgen.net/npm/dm/nuxt-build-cache)](https://npmjs.com/package/nuxt-build-cache)

<!-- /automd -->

Experimental build caching for Nuxt.

> [!IMPORTANT]
> This is an highly experimenrtal attempt to support build caching for Nuxt 3. Use at your own risk!

> [!WARNING]
> Currently source code is not included in build-cache! (PR welcome to add) Add a version string in `nuxt.config`!

## ✨ Quick Setup

```sh
npx nuxi@latest modules add nuxt-build-cache
```

<!-- ## Enabling for cloudflare pages

Meanwhile pages does not have official Nuxt support, you can add this to your `package.json`:

```json
  "devDependencies": {
    "next": "npm:just-a-placeholder@0.0.0"
  },
``` -->

## Environment variables

- `SKIP_NUXT_BUILD_CACHE`
- `SKIP_NUXT_BUILD_CACHE_COLLECTION`
