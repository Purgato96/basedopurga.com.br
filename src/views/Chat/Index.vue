<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useRooms } from '@/composables/useRooms'
import { useAuth } from '@/composables/useAuth'; // <-- Importado
import AppLayout from '@/layouts/AppLayout.vue';

const router = useRouter();
const { rooms, loading, fetchRooms, createRoom } = useRooms();
const { user, can, isAuthenticated } = useAuth(); // <-- Pegamos can e isAuthenticated

const showCreateModal = ref(false);
const processing = ref(false);

const form = ref({
  name: '',
  description: '',
  is_private: false
});

const handleCreateRoom = async () => {
  // ✅ Proteção extra: Embora o botão esteja escondido,
  // é bom garantir que a função não seja chamada indevidamente.
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
    // ✅ Melhorar mensagem de erro para 403
    const errorMsg = error.response?.status === 403
      ? 'Você não tem permissão para criar esta sala.'
      : (error.response?.data?.message || error.message);
    alert('Erro ao criar sala: ' + errorMsg);
  } finally {
    processing.value = false;
  }
};

const formatDate = (date) => { /* ... sua função ... */ };

const goToRoom = (slug) => { /* ... sua função ... */ };

onMounted(() => {
  // ✅ Só busca as salas se autenticado (senão, o RoomApiController@index lida com guests)
  if (isAuthenticated.value) {
    fetchRooms();
  }
  // Se não autenticado, a API pública retorna apenas salas públicas
});
</script>

<template>
  <AppLayout title="Chat">
    <template #header>
      <h2 class="font-semibold text-xl text-gray-800 leading-tight">Chat</h2>
    </template>

    <div class="py-12">
      <div class="max-w-7xl mx-auto sm:px-6 lg:px-8">
        <div class="bg-white overflow-hidden shadow-xl sm:rounded-lg">
          <div class="p-6">
            <div class="flex justify-between items-center mb-6">
              <h3 class="text-lg font-medium text-gray-900">Suas Salas de Chat</h3>
              <button v-if="isAuthenticated && can('create-rooms')"
                      @click="showCreateModal = true"
                      class="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
              >
                Nova Sala
              </button>
            </div>

            <div v-if="loading" class="text-center py-8"> /* ... loading ... */ </div>

            <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div v-for="room in rooms" :key="room.id" @click="goToRoom(room.slug)" class="...">
              </div>
            </div>

            <div v-if="!loading && rooms.length === 0" class="text-center py-12">
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

    <div v-if="showCreateModal && can('create-rooms')" class="...">
      <div class="...">
        <div class="mt-3">
          <h3 class="...">Criar Nova Sala</h3>
          <form @submit.prevent="handleCreateRoom">
            <div class="flex justify-end space-x-3">
              <button type="button" @click="showCreateModal = false" class="...">Cancelar</button>
              <button type="submit" :disabled="processing" class="...">{{ processing ? 'Criando...' : 'Criar Sala' }}</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  </AppLayout>
</template>
