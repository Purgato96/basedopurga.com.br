<script setup>
import { ref, onMounted, watchEffect } from 'vue';
import { useRouter } from 'vue-router';
import { useRooms } from '@/composables/useRooms';
import { useAuth } from '@/composables/useAuth';
import AppLayout from '@/layouts/AppLayout.vue';

const router = useRouter();
const { rooms, loading, fetchRooms, createRoom } = useRooms();
const { user, can, isAuthenticated } = useAuth();

const showCreateModal = ref(false);
const processing = ref(false);
// Novo estado para controlar o que mostrar no template
const isInteractiUser = ref(false);

const form = ref({
  name: '',
  description: '',
  is_private: false
});

const handleCreateRoom = async () => {
  if (!can('create-rooms')) {
    alert('Você não tem permissão para criar salas.');
    return;
  }
  processing.value = true;
  try {
    await createRoom(form.value);
    form.value = { name: '', description: '', is_private: false };
    showCreateModal.value = false;
  } catch (error) {
    console.error('Erro ao criar sala:', error);
    const errorMsg = error.response?.status === 403
      ? 'Você não tem permissão para criar esta sala.'
      : (error.response?.data?.message || error.message);
    alert('Erro ao criar sala: ' + errorMsg);
  } finally {
    processing.value = false;
  }
};

const formatDate = (date) => {
  if (!date) return '';
  return new Date(date).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const goToRoom = (slug) => {
  router.push({ name: 'chat-room', params: { slug } });
};

// --- CORREÇÃO DA VISÃO RESTRITA ---
watchEffect(() => {
  // Roda sempre que 'user.value' mudar
  if (user.value && user.value.account_id) {
    isInteractiUser.value = true; // Ativa feedback visual
    const accountId = user.value.account_id;
    // Calcula o slug esperado
    const expectedSlug = `sala-${accountId.toString().toLowerCase().replace(/[^a-z0-9\-]+/g, '-')}`;
    console.log(`Index.vue: Usuário Interacti (account_id: ${accountId}). Redirecionando para ${expectedSlug}...`);

    // Tenta redirecionar
    try {
      router.replace({ name: 'chat-room', params: { slug: expectedSlug } });
    } catch(e) {
      console.error("Falha no redirecionamento do Index.vue:", e);
      // Fallback extremo
      window.location.href = `/chat/room/${expectedSlug}`;
    }

  } else {
    isInteractiUser.value = false; // Não é usuário Interacti
  }
});

onMounted(() => {
  // Lógica ajustada: Só busca salas se *não* for um usuário Interacti
  // Verificamos 'user.value' diretamente, pois 'isInteractiUser' pode demorar 1 tick
  if (user.value && user.value.account_id) {
    console.log("Index.vue: Usuário Interacti. Redirecionamento em andamento, não busca lista.");
    isInteractiUser.value = true; // Garante que o template saiba
  }
  else if (isAuthenticated.value) {
    console.log("Index.vue: Usuário normal logado. Buscando lista de salas...");
    fetchRooms();
  }
  else {
    console.log("Index.vue: Guest. Buscando lista de salas públicas...");
    fetchRooms(); // API retorna só públicas
  }
});
// --- FIM DA CORREÇÃO ---
</script>

<template>
  <AppLayout title="Chat">
    <template #header>
      <h2 class="font-semibold text-xl text-gray-800 leading-tight">
        Chat
      </h2>
    </template>

    <!-- Mostra "Redirecionando" para usuários Interacti -->
    <div v-if="isInteractiUser" class="text-center py-12 text-gray-600">
      <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      <p class="mt-2">Redirecionando para sua sala...</p>
    </div>

    <!-- Mostra o conteúdo normal APENAS se NÃO for usuário Interacti -->
    <div v-else class="py-12">
      <div class="max-w-7xl mx-auto sm:px-6 lg:px-8">
        <div class="bg-white overflow-hidden shadow-xl sm:rounded-lg">
          <div class="p-6">
            <!-- Header com botão para criar sala -->
            <div class="flex justify-between items-center mb-6">
              <h3 class="text-lg font-medium text-gray-900">Suas Salas de Chat</h3>
              <button vfor="isAuthenticated && can('create-rooms')"
                      @click="showCreateModal = true"
                      class="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
              >
                Nova Sala
              </button>
            </div>

            <!-- Loading -->
            <div v-if="loading" class="text-center py-8">
              <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
              <p class="mt-2 text-gray-600">Carregando salas...</p>
            </div>

            <!-- Lista de salas -->
            <div v-else-if="rooms.length > 0" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div
                v-for="room in rooms"
                :key="room.id"
                class="border rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer"
                @click="goToRoom(room.slug)"
              >
                <h4 class="font-semibold text-gray-900 mb-2">{{ room.name }}</h4>
                <p class="text-gray-600 text-sm mb-3">{{ room.description || 'Sem descrição' }}</p>

                <div class="flex items-center justify-between text-xs text-gray-500">
                  <span>{{ room.users_count !== undefined ? `${room.users_count} membro(s)` : '' }}</span>
                  <span v-if="room.latest_messages?.length && room.latest_messages[0]?.created_at">
                    Última: {{ formatDate(room.latest_messages[0].created_at) }}
                  </span>
                </div>
              </div>
            </div>

            <!-- Estado vazio -->
            <div v-else class="text-center py-12">
              <div class="text-gray-500 mb-4">
                <svg class="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-3.582 8-8 8a8.001 8.001 0 01-7.003-4.165L2 20l4.165-4.003A8.001 8.001 0 0112 4c4.418 0 8 3.582 8 8z" />
                </svg>
              </div>
              <h3 class="text-lg font-medium text-gray-900 mb-2">Nenhuma sala encontrada</h3>
              <p class="text-gray-500 mb-4">Crie sua primeira sala de chat para começar.</p>
              <button v-if="isAuthenticated && can('create-rooms')"
                      @click="showCreateModal = true"
                      class="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
              >
                Criar Primeira Sala
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Modal para criar sala (protegido) -->
    <div v-if="showCreateModal && can('create-rooms')" class="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div class="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
        <div class="mt-3">
          <h3 class="text-lg font-medium text-gray-900 mb-4">Criar Nova Sala</h3>

          <form @submit.prevent="handleCreateRoom">
            <!-- ... (conteúdo do formulário modal) ... -->
            <div class="mb-4">
              <label class="block text-gray-700 text-sm font-bold mb-2">
                Nome da Sala
              </label>
              <input
                v-model="form.name"
                type="text"
                class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                required
                :disabled="processing"
              >
            </div>
            <div class="mb-4">
              <label class="block text-gray-700 text-sm font-bold mb-2">
                Descrição (opcional)
              </label>
              <textarea
                v-model="form.description"
                class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                rows="3"
                :disabled="processing"
              ></textarea>
            </div>
            <div class="mb-6">
              <label class="flex items-center">
                <input
                  v-model="form.is_private"
                  type="checkbox"
                  class="form-checkbox h-4 w-4 text-blue-600"
                  :disabled="processing"
                >
                <span class="ml-2 text-gray-700">Sala privada</span>
              </label>
            </div>
            <div class="flex justify-end space-x-3">
              <button
                type="button"
                @click="showCreateModal = false"
                class="bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded"
                :disabled="processing"
              >
                Cancelar
              </button>
              <button
                type="submit"
                :disabled="processing"
                class="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50"
              >
                {{ processing ? 'Criando...' : 'Criar Sala' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  </AppLayout>
</template>
