<script setup lang="ts">
import { useState } from "#imports";

const date = useState(() => new Date().toString());
</script>

<template>
  <div>
    <hr />
    Rendered at {{ date }}
  </div>
</template>
