<template>
  <ChatLayout :title="currentRoom ? `${currentRoom.name}` : 'Carregando...'">
    <div v-if="loading" class="flex items-center justify-center h-full">
      <div class="text-center">
        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
        <p class="text-gray-600">Carregando sala...</p>
      </div>
    </div>

    <div v-else-if="currentRoom" class="flex flex-col h-full bg-gray-100">
      <div class="flex flex-1 overflow-hidden">
        <div class="w-64 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col shadow-sm">
          <div class="p-4 border-b">
            <h2 class="text-gray-800 text-lg font-semibold">Conversas</h2>
          </div>
          <div class="p-4 border-b flex space-x-2 bg-gray-50">
            <button @click="switchToPublic" :class="btnActivePublic">Público</button>
            <button @click="activeTab = 'private'" :class="btnActivePriv">Privado</button>
          </div>
          <div class="flex-1 overflow-y-auto">
            <div v-if="activeTab === 'private'">
              <div v-for="conv in conversations" :key="conv.id"
                   @click="selectPrivateConversation(conv)"
                   :class="['p-3 border-b border-gray-100 cursor-pointer hover:bg-gray-100 flex items-center space-x-3', currentConversation?.id === conv.id ? 'bg-blue-50 hover:bg-blue-100' : '']">
                <div class="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white flex-shrink-0 text-lg font-medium">
                  {{ conv.other_user.name.charAt(0).toUpperCase() }}
                </div>
                <div class="flex-1 overflow-hidden">
                  <h3 class="font-semibold text-sm text-gray-900 truncate">{{ conv.other_user.name }}</h3>
                  <p v-if="conv.latest_message" class="text-xs text-gray-500 truncate">
                    {{ conv.latest_message.content }}
                  </p>
                  <p v-else class="text-xs text-gray-400 italic">Nenhuma mensagem</p>
                </div>
              </div>
              <div v-if="conversations.length === 0" class="p-4 text-center text-gray-500 text-sm italic">
                Nenhuma conversa privada.<br>Use @ no chat público.
              </div>
            </div>
            <div v-if="activeTab === 'public'" class="p-4 text-center text-gray-500 text-sm italic flex flex-col items-center justify-center h-full">
              <div class="mb-4">
                <h3 class="font-semibold text-gray-800">{{ currentRoom.name }}</h3>
                <p class="text-xs text-gray-600">{{ currentRoom.description || 'Sem descrição' }}</p>
                <div class="mt-2 flex items-center justify-center space-x-2 text-xs">
                  <span class="text-gray-500">{{ currentRoom.users_count || 0 }} {{ (currentRoom.users_count || 0) === 1 ? 'membro' : 'membros' }}</span>
                  <span v-if="currentRoom.is_private" class="px-1.5 py-0.5 bg-red-100 text-red-800 rounded-full">Privada</span>
                  <span v-else class="px-1.5 py-0.5 bg-green-100 text-green-800 rounded-full">Pública</span>
                  <span :class="connectionStatus === 'connected' ? 'text-green-600' : 'text-red-600'">
                    {{ connectionStatus === 'connected' ? '● Online' : '○ Offline' }}
                  </span>
                </div>
              </div>
              <p>Use @ para mencionar e iniciar conversas privadas.</p>
            </div>
          </div>
          <div class="p-2 border-t border-gray-200 flex flex-col space-y-1">
            <button v-if="canManageUsers" @click="showUserManager = true" class="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 rounded">Gerenciar Usuários</button>
            <button v-if="canLeaveRoom" @click="leaveRoom" class="w-full text-left px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded">Sair da Sala</button>
          </div>
        </div>
        <div class="flex-1 flex flex-col bg-white">
          <div ref="messagesContainer" class="flex-1 overflow-y-auto p-4 md:p-6 space-y-3 bg-gray-50">
            <template v-if="activeTab === 'public'">
              <div v-for="message in messages" :key="message.id" class="flex flex-col group" :class="[message.user.id === user?.id ? 'items-end' : 'items-start']">
                <div :class="message.user.id === user?.id ? msgSent : msgRecv" class="max-w-[70%] md:max-w-[60%] rounded-lg shadow-md px-3 py-2 relative">
                  <div class="flex items-baseline space-x-1.5 mb-0.5">
                    <span v-if="message.user.id !== user?.id" class="text-xs font-semibold" :class="message.user.id === user?.id ? 'text-white text-opacity-90' : 'text-gray-700'">{{ message.user.name }}</span>
                    <span class="text-[9px] opacity-70" :class="message.user.id === user?.id ? 'text-blue-100' : 'text-gray-400'">
                      {{ formatTime(message.created_at) }}
                    </span>
                    <span v-if="message.edited_at" class="text-[9px] italic opacity-70" :class="message.user.id === user?.id ? 'text-blue-100' : 'text-gray-400'">(editada)</span>
                  </div>
                  <div class="text-sm break-words">
                    <span v-if="editingMessage?.id !== message.id">{{ message.content }}</span>
                    <textarea v-else :id="`edit-textarea-${message.id}`" v-model="editMessageContent" @keydown.esc="cancelEdit" @keydown.enter.prevent="saveEdit" class="block w-full border rounded p-1 text-sm bg-white bg-opacity-90 focus:ring-1 focus:ring-blue-500" rows="2"></textarea>
                  </div>
                  <div class="absolute -top-2 right-1 flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity bg-white border rounded-full shadow p-0.5" v-if="editingMessage?.id !== message.id">
                    <button v-if="(canEditOwnMessage && message.user.id === user?.id) || canEditAnyMessage" @click="startEditing(message)" title="Editar" class="p-1 rounded-full text-gray-500 hover:bg-gray-100 hover:text-blue-600 text-xs">✏️</button>
                    <button v-if="(canDeleteOwnMessage && message.user.id === user?.id) || canDeleteAnyMessage" @click="deleteMessage(message.id)" title="Deletar" class="p-1 rounded-full text-gray-500 hover:bg-gray-100 hover:text-red-600 text-xs">🗑️</button>
                  </div>
                  <div class="mt-1 space-x-2 text-xs text-right" v-if="editingMessage?.id === message.id">
                    <button @click="saveEdit" class="text-green-600 hover:text-green-800 font-medium">Salvar</button>
                    <button @click="cancelEdit" class="text-gray-500 hover:text-gray-700">Cancelar</button>
                  </div>
                </div>
              </div>
            </template>

            <template v-if="activeTab === 'private' && currentConversation">
              <div v-for="message in privateMessages" :key="message.id" class="flex flex-col group" :class="[message.sender.id === user?.id ? 'items-end' : 'items-start']">
                <div :class="message.sender.id === user?.id ? msgSent : msgRecv" class="max-w-[70%] md:max-w-[60%] rounded-lg shadow-md px-3 py-2 relative">
                  <div class="flex items-baseline space-x-1.5 mb-0.5">
                    <span class="text-[9px] opacity-70" :class="message.sender.id === user?.id ? 'text-blue-100' : 'text-gray-400'">
                      {{ formatTime(message.created_at) }}
                    </span>
                    <span v-if="message.is_edited" class="text-[9px] italic opacity-70" :class="message.sender.id === user?.id ? 'text-blue-100' : 'text-gray-400'">(editada)</span>
                  </div>
                  <div class="text-sm break-words">
                    <span>{{ message.content }}</span>
                  </div>
                </div>
              </div>
            </template>

            <div v-if="activeTab === 'private' && !currentConversation" class="flex items-center justify-center h-full text-gray-400 italic">
              <div class="text-center">
                <p class="text-lg mb-2">💬</p>
                <p>Selecione uma conversa ao lado.</p>
              </div>
            </div>
          </div>

          <div class="border-t p-3 md:p-4 bg-gray-50" v-if="canSendMessages">
            <form @submit.prevent="sendMessage" class="flex items-center space-x-2">
              <div class="flex-1 relative">
                <input ref="messageInput" v-model="newMessage" @input="handleInput" @keydown.enter.prevent="sendMessage" @keydown="handleKeydown"
                       :placeholder="getPlaceholderText"
                       class="w-full text-gray-800 px-4 py-2 border border-gray-300 rounded-full focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:bg-gray-200"
                       :disabled="isSending || (activeTab === 'private' && !currentConversation)" />
                <div v-if="showMentionDropdown && mentionUsers.length" class="absolute bottom-full left-0 right-0 bg-white border rounded-md shadow-lg max-h-48 overflow-y-auto z-10 mb-1">
                  <div v-for="(u, i) in mentionUsers" :key="u.id"
                       @click="selectMention(u)"
                       :class="['p-2 hover:bg-gray-100 cursor-pointer flex items-center space-x-2', selectedMentionIndex === i ? 'bg-blue-50' : '']">
                    <div class="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white flex-shrink-0">
                      {{ u.name.charAt(0).toUpperCase() }}
                    </div>
                    <div>
                      <p class="font-medium text-sm text-gray-800">{{ u.name }}</p>
                      <p class="text-xs text-gray-500">{{ u.email }}</p>
                    </div>
                  </div>
                </div>
              </div>
              <button type="submit"
                      :disabled="!newMessage.trim() || isSending || (activeTab === 'private' && !currentConversation)"
                      class="px-5 py-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 disabled:opacity-50 flex-shrink-0">
                {{ isSending ? '...' : 'Enviar' }}
              </button>
            </form>
          </div>

          <div v-else class="border-t p-4 bg-gray-100 text-center text-gray-500 text-sm italic">
            Você não tem permissão para enviar mensagens.
          </div>
        </div>
      </div>
    </div>

    <div v-else class="flex items-center justify-center h-full">
      <div class="text-center text-gray-500">
        <p class="mb-4">🚫 Sala não encontrada ou acesso negado.</p>
        <button @click="router.push('/chat')" class="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded">
          Voltar para Salas
        </button>
      </div>
    </div>
  </ChatLayout>
</template>


<script setup>
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuth } from '@/composables/useAuth';
import { useRooms } from '@/composables/useRooms';
import { useMessages } from '@/composables/useMessages';
import { usePrivateConversations } from '@/composables/usePrivateConversations';
import { useWebSocket } from '@/composables/useWebSocket';
import { RoomService, MessageService } from '@/services';
import ChatLayout from '@/layouts/ChatLayout.vue';

const route = useRoute();
const router = useRouter();
const { user, can } = useAuth();
const { currentRoom, fetchRoomBySlug } = useRooms();
const { messages, fetchMessages, sendMessage: sendRoomMessage, addMessage, removeMessage, updateMessageInList } = useMessages();
const { conversations, currentConversation, messages: privateMessages, fetchConversations, startConversation, openConversation, sendMessage: sendPrivateMessage, addMessage: addPrivateMessage } = usePrivateConversations();
const { connectionStatus, connect, joinRoom, joinUserChannel, disconnect } = useWebSocket();

const messageInput = ref(null);
const messagesContainer = ref(null);
const newMessage = ref('');
const isSending = ref(false);
const showUserManager = ref(false);
const activeTab = ref('public');
const showMentionDropdown = ref(false);
const mentionUsers = ref([]);
const selectedMentionIndex = ref(0);
const mentionStartIndex = ref(-1);
const roomUsers = ref([]);
const loading = ref(true);
const editingMessage = ref(null);
const editMessageContent = ref('');

const roomSlug = computed(() => route.params.slug);

const getPlaceholderText = computed(() =>
  activeTab.value === 'public'
    ? 'Digite @ para mencionar usuários...'
    : currentConversation.value
      ? `Mensagem para ${currentConversation.value.other_user.name}...`
      : 'Selecione uma conversa'
);

const btnActivePublic = computed(() =>
  activeTab.value === 'public'
    ? 'px-3 py-2 rounded text-sm font-medium bg-blue-500 text-white shadow-sm'
    : 'px-3 py-2 rounded text-sm font-medium bg-gray-200 text-gray-700 hover:bg-gray-300'
);

const btnActivePriv = computed(() =>
  activeTab.value === 'private'
    ? 'px-3 py-2 rounded text-sm font-medium bg-blue-500 text-white shadow-sm'
    : 'px-3 py-2 rounded text-sm font-medium bg-gray-200 text-gray-700 hover:bg-gray-300'
);

const msgSent = 'self-end bg-blue-500 text-white';
const msgRecv = 'self-start bg-gray-200 text-gray-800';

const canManageUsers = computed(() => can('add-member-room'));
const canSendMessages = computed(() => can('send-messages'));
const canLeaveRoom = computed(() => can('leave-room') && !user.value?.account_id);
const canDeleteAnyMessage = computed(() => can('delete-any-message'));
const canEditAnyMessage = computed(() => can('edit-any-message'));
const canDeleteOwnMessage = computed(() => can('delete-messages'));
const canEditOwnMessage = computed(() => can('edit-messages'));

async function loadRoomData() {
  loading.value = true;
  try {
    await fetchRoomBySlug(roomSlug.value);
    if (!currentRoom.value) throw new Error('Sala não carregada ou acesso negado.');
    await Promise.all([fetchMessages(roomSlug.value), fetchConversations(), loadRoomUsers()]);
    setupWebSocket();
  } catch (error) {
    if (error.response?.status === 403) {
      alert('Você não tem permissão para acessar esta sala.');
    } else if (error.message !== 'Sala não carregada ou acesso negado.') {
      alert('Erro ao carregar a sala. Verifique o console.');
    }
    router.push('/chat');
    return;
  } finally {
    loading.value = false;
  }
}

async function loadRoomUsers() {
  try {
    const response = await RoomService.getMembers(roomSlug.value);
    roomUsers.value = response.data.filter(u => u.id !== user.value?.id);
  } catch (error) {
    roomUsers.value = [];
  }
}

function setupWebSocket() {
  if (!user.value) return;
  const token = localStorage.getItem('chat_token');
  if (!token) return;
  if (connectionStatus.value === 'connected' || connectionStatus.value === 'connecting') return;

  const echo = connect(token);
  if (!echo) return;

  joinRoom(roomSlug.value, {
    onMessageSent: event => {
      if (!messages.value.some(m => m.id === event.message.id)) {
        addMessage(event.message);
        if (activeTab.value === 'public') scrollToBottom();
      }
    },
    onMessageUpdated: event => {
      updateMessageInList(event.message);
      if (editingMessage.value?.id === event.message.id) cancelEdit();
    },
    onMessageDeleted: event => {
      removeMessage(event.message.id);
    }
  });

  joinUserChannel(user.value.id, {
    onPrivateMessage: async event => {
      if (activeTab.value === 'private' && currentConversation.value?.id === event.message.conversation_id) {
        addPrivateMessage(event.message);
        scrollToBottom();
      }
      await fetchConversations();
    }
  });
}

async function selectPrivateConversation(conversation) {
  if (currentConversation.value?.id === conversation.id && activeTab.value === 'private') return;
  activeTab.value = 'private';
  try {
    await openConversation(conversation.id);
    scrollToBottom(true);
  } catch {
    alert('Não foi possível carregar as mensagens desta conversa.');
  }
}

function switchToPublic() {
  if (activeTab.value === 'public') return;
  activeTab.value = 'public';
  currentConversation.value = null;
  nextTick(() => scrollToBottom());
}

function handleInput() {
  if (activeTab.value !== 'public') {
    showMentionDropdown.value = false;
    return;
  }
  const input = messageInput.value;
  if (!input) return;
  const cursorPos = input.selectionStart;
  const textBeforeCursor = input.value.substring(0, cursorPos);
  const mentionMatch = textBeforeCursor.match(/@(\w*)$/);
  if (mentionMatch) {
    mentionStartIndex.value = mentionMatch.index;
    const searchTerm = mentionMatch[1].toLowerCase();
    mentionUsers.value = roomUsers.value.filter(u =>
      u.name.toLowerCase().includes(searchTerm) || u.email.toLowerCase().includes(searchTerm)
    );
    showMentionDropdown.value = mentionUsers.value.length > 0;
    selectedMentionIndex.value = 0;
  } else {
    showMentionDropdown.value = false;
    mentionUsers.value = [];
    mentionStartIndex.value = -1;
  }
}

function handleKeydown(e) {
  if (!showMentionDropdown.value) return;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    selectedMentionIndex.value = (selectedMentionIndex.value + 1) % mentionUsers.value.length;
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    selectedMentionIndex.value = (selectedMentionIndex.value - 1 + mentionUsers.value.length) % mentionUsers.value.length;
  } else if (e.key === 'Enter' || e.key === 'Tab') {
    e.preventDefault();
    if (mentionUsers.value.length > 0) {
      selectMention(mentionUsers.value[selectedMentionIndex.value]);
    } else {
      showMentionDropdown.value = false;
    }
  } else if (e.key === 'Escape') {
    e.preventDefault();
    showMentionDropdown.value = false;
  }
}

async function selectMention(selectedUser) {
  // 1. Fecha o dropdown
  showMentionDropdown.value = false;
  mentionUsers.value = [];
  mentionStartIndex.value = -1;
  newMessage.value = ''; // Limpa o input (ex: "Diego")

  try {
    console.log(`Iniciando conversa com ${selectedUser.name} (ID: ${selectedUser.id})...`);

    // 2. Chama a API via composable
    // (Isso chama o 'PrivateConversationController@start' com o { user_id: ... })
    const newConversation = await startConversation(selectedUser.id);

    if (!newConversation) {
      throw new Error('Não foi possível obter a conversa da API');
    }

    console.log('Conversa recebida/criada:', newConversation.id);

    // 3. Atualiza a lista da sidebar
    await fetchConversations();

    // 4. Muda para a aba "Privado"
    activeTab.value = 'private';

    // 5. Carrega as mensagens e define a conversa como ativa
    // (Isso chama 'PrivateConversationController@show')
    await openConversation(newConversation.id);

    console.log('Conversa privada aberta.');
    messageInput.value?.focus();

  } catch (error) {
    console.error('Erro ao iniciar conversa privada via @mention:', error);
    alert('Não foi possível iniciar o chat privado. Verifique o console.');
  }
}

function scrollToBottom(force = false) {
  nextTick(() => {
    const container = messagesContainer.value;
    if (container) {
      const isScrolledToBottom =
        container.scrollHeight - container.clientHeight <= container.scrollTop + 50;
      if (force || isScrolledToBottom) {
        container.scrollTop = container.scrollHeight;
      }
    }
  });
}

async function sendMessage() {
  if (!canSendMessages.value) {
    alert('Você não tem permissão para enviar mensagens.');
    return;
  }
  const contentToSend = newMessage.value.trim();
  if (!contentToSend) return;
  isSending.value = true;
  try {
    let sentMessageData;
    if (activeTab.value === 'public') {
      sentMessageData = await sendRoomMessage(roomSlug.value, contentToSend);
    } else if (currentConversation.value) {
      sentMessageData = await sendPrivateMessage(currentConversation.value.id, contentToSend);
      if (sentMessageData) addPrivateMessage(sentMessageData);
    }
    newMessage.value = '';
    scrollToBottom(true);
    messageInput.value?.focus();
  } catch (error) {
    alert('Erro ao enviar mensagem: ' + (error.response?.data?.message || error.message));
  } finally {
    isSending.value = false;
  }
}

async function leaveRoom() {
  if (!canLeaveRoom.value) {
    alert('Você não tem permissão para sair desta sala.');
    return;
  }
  if (!confirm('Tem certeza que deseja sair desta sala?')) return;
  try {
    await RoomService.leave(roomSlug.value);
    router.push('/chat');
  } catch (error) {
    const errorMsg =
      error.response?.status === 403
        ? 'Você não tem permissão para sair desta sala.'
        : error.response?.data?.message || error.message;
    alert('Erro ao sair da sala: ' + errorMsg);
  }
}

async function deleteMessage(messageId) {
  const messageToDelete = messages.value.find(m => m.id === messageId);
  if (!messageToDelete) return;
  const isOwnMessage = messageToDelete.user.id === user.value?.id;
  if (!((canDeleteOwnMessage.value && isOwnMessage) || canDeleteAnyMessage.value)) {
    alert('Você não tem permissão para deletar esta mensagem.');
    return;
  }
  if (!confirm('Tem certeza que deseja deletar esta mensagem?\n\n"' + messageToDelete.content + '"')) return;
  try {
    await MessageService.delete(messageId);
  } catch {
    alert('Erro ao deletar mensagem.');
  }
}

function startEditing(message) {
  if (editingMessage.value) cancelEdit();
  const isOwnMessage = message.user.id === user.value?.id;
  if (!((canEditOwnMessage.value && isOwnMessage) || canEditAnyMessage.value)) {
    alert('Você não tem permissão para editar esta mensagem.');
    return;
  }
  editingMessage.value = message;
  editMessageContent.value = message.content;
  nextTick(() => document.getElementById(`edit-textarea-${message.id}`)?.focus());
}

async function saveEdit() {
  if (!editingMessage.value) return;
  const newContent = editMessageContent.value.trim();
  if (!newContent || newContent === editingMessage.value.content) {
    cancelEdit();
    return;
  }
  const messageId = editingMessage.value.id;
  const originalMessageRef = editingMessage.value;
  editingMessage.value = null;
  try {
    await MessageService.update(messageId, { content: newContent });
  } catch {
    alert('Erro ao salvar edição da mensagem.');
    editingMessage.value = originalMessageRef;
  }
}

function cancelEdit() {
  editingMessage.value = null;
  editMessageContent.value = '';
}

function formatTime(timestamp) {
  if (!timestamp) return '';
  return new Date(timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function formatDate(timestamp) {
  if (!timestamp) return '';
  return new Date(timestamp).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

watch(
  () => route.params.slug,
  async (newSlug, oldSlug) => {
    if (newSlug && oldSlug && newSlug !== oldSlug) {
      messages.value = [];
      conversations.value = [];
      currentConversation.value = null;
      privateMessages.value = [];
      newMessage.value = '';
      activeTab.value = 'public';
      editingMessage.value = null;
      editMessageContent.value = '';
      roomUsers.value = [];
      loading.value = true;
      await loadRoomData();
      scrollToBottom(true);
    }
  },
  { immediate: false }
);

onMounted(async () => {
  await loadRoomData();
  scrollToBottom(true);
});

onUnmounted(() => {
  disconnect();
});
</script>
