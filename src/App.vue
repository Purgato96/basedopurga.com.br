<script setup>
import { onMounted, ref } from 'vue'; // 👈 Importe ref
import { useAuth } from '@/composables/useAuth';

const { isAuthenticated, loadUser } = useAuth();
const isAppReady = ref(false); // 👈 Novo estado: A aplicação está pronta?

onMounted(async () => {
  try {
    if (isAuthenticated.value) {
      await loadUser(); // Espera a função terminar
    }
  } catch (error)
  } finally {
    isAppReady.value = true; // 👈 Marca a aplicação como pronta
  }
});
</script>

<template>
  <div v-if="!isAppReady">
    Carregando...
  </div>
  <router-view v-else />
</template>
