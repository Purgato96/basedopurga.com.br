<script setup>
import { onMounted } from 'vue';
import { useAuth } from '@/composables/useAuth'; // 👈 Importe useAuth

const { isAuthenticated, loadUser } = useAuth(); // 👈 Pegue as funções

// ✅ LÓGICA DE INICIALIZAÇÃO
onMounted(async () => {
  // Se o token existe (usuário *pode* estar logado)...
  if (isAuthenticated.value) {
    // ...tenta carregar os dados do usuário da API.
    await loadUser();
  }
});
</script>

<template>
  <router-view />
</template>
