<script setup>
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuth } from '@/composables/useAuth'; // <-- Importado
import { useRooms } from '@/composables/useRooms';
import { useMessages } from '@/composables/useMessages';
import { usePrivateConversations } from '@/composables/usePrivateConversations';
import { useWebSocket } from '@/composables/useWebSocket';
import { RoomService } from '@/services'; // Assumindo MessageService estará aqui
import ChatLayout from '@/layouts/ChatLayout.vue';

const route = useRoute();
const router = useRouter();

// Pegamos user e can
const { user, can } = useAuth();
const { currentRoom, fetchRoomBySlug } = useRooms();
const {
  messages,
  fetchMessages,
  sendMessage: sendRoomMessage,
  addMessage,
  removeMessage,
  updateMessageInList
} = useMessages();
const {
  conversations,
  currentConversation,
  messages: privateMessages,
  fetchConversations,
  startConversation,
  openConversation,
  sendMessage: sendPrivateMessage,
  addMessage: addPrivateMessage
} = usePrivateConversations();
const { connectionStatus, connect, joinRoom, joinUserChannel, disconnect } = useWebSocket();

// --- Refs ---
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

// --- Computeds ---
const roomSlug = computed(() => route.params.slug);

const getPlaceholderText = computed(() =>
  activeTab.value === 'public' ? 'Digite @ para mencionar usuários...' : currentConversation.value ? 'Digite sua mensagem...' : 'Selecione uma conversa'
);
const btnActivePublic = computed(() =>
  activeTab.value === 'public'
    ? 'px-3 py-2 rounded text-sm font-medium bg-blue-500 text-white'
    : 'px-3 py-2 rounded text-sm font-medium bg-gray-200 text-gray-700 hover:bg-gray-300'
);
const btnActivePriv = computed(() =>
  activeTab.value === 'private'
    ? 'px-3 py-2 rounded text-sm font-medium bg-blue-500 text-white'
    : 'px-3 py-2 rounded text-sm font-medium bg-gray-200 text-gray-700 hover:bg-gray-300'
);
const msgSent = 'self-end bg-blue-500 text-white';
const msgRecv = 'self-start bg-gray-100 text-gray-900';

// --- Computeds de Permissão ---
const canManageUsers = computed(() => can('add-member-room'));
const canSendMessages = computed(() => can('send-messages'));
const canLeaveRoom = computed(() => can('leave-room'));
const canDeleteAnyMessage = computed(() => can('delete-any-message'));
const canEditAnyMessage = computed(() => can('edit-any-message'));
const canDeleteOwnMessage = computed(() => can('delete-messages'));
const canEditOwnMessage = computed(() => can('edit-messages'));

// --- Funções ---
async function loadRoomData() {
  loading.value = true;
  try {
    await fetchRoomBySlug(roomSlug.value);      // valida acesso (API agora retorna 403 se não puder)
    if (!currentRoom.value) throw new Error("Sala não carregada ou acesso negado."); // Segurança extra
    await fetchMessages(roomSlug.value);
    await fetchConversations();
    await loadRoomUsers();
    setupWebSocket();                           // conecta só após sucesso
  } catch (error) {
    console.error('Erro ao carregar dados da sala:', error);
    if (error.response?.status === 403) {
      alert('Você não tem permissão para acessar esta sala.');
    } else {
      alert('Erro ao carregar a sala.');
    }
    router.push('/chat'); // Redireciona em caso de erro
    return;
  } finally {
    loading.value = false;
  }
}

async function loadRoomUsers() {
  // Só carrega usuários se tiver permissão de gerenciar (para menções)
  // Ajuste essa lógica se precisar da lista por outro motivo
  // if (!canManageUsers.value) {
  //     roomUsers.value = [];
  //     return;
  // }
  try {
    const response = await RoomService.getMembers(roomSlug.value);
    roomUsers.value = response.data.filter(u => u.id !== user.value?.id);
  } catch (error) {
    console.error('Erro ao carregar usuários da sala:', error);
    roomUsers.value = []; // Limpa em caso de erro
  }
}

function setupWebSocket() {
  if (!user.value) { console.warn("WebSocket: Usuário não carregado."); return; }
  const token = localStorage.getItem('chat_token');
  if (!token) { console.warn("WebSocket: Token não encontrado."); return; }
  if (connectionStatus.value === 'connected' || connectionStatus.value === 'connecting') return;

  console.log("WebSocket: Iniciando conexão...");
  const echo = connect(token);
  if (!echo) { console.error("WebSocket: Falha ao obter instância do Echo."); return; }

  joinRoom(roomSlug.value, {
    onMessageSent: (event) => {
      console.log("WebSocket: Mensagem pública recebida", event);
      if (!messages.value.some(m => m.id === event.message.id)) {
        addMessage(event.message);
        if (activeTab.value === 'public') scrollToBottom();
      }
    },
    onMessageUpdated: (event) => {
      console.log("WebSocket: Mensagem pública atualizada", event);
      updateMessageInList(event.message);
      // Se a mensagem sendo editada foi atualizada por outro, cancela a edição local
      if (editingMessage.value?.id === event.message.id) {
        cancelEdit();
      }
    },
    onMessageDeleted: (event) => {
      console.log("WebSocket: Mensagem pública deletada", event);
      removeMessage(event.message.id);
    }
  });

  joinUserChannel(user.value.id, {
    onPrivateMessage: async (event) => {
      console.log("WebSocket: Mensagem privada recebida", event);
      if (activeTab.value === 'private' && currentConversation.value?.id === event.message.conversation_id) {
        addPrivateMessage(event.message);
        scrollToBottom();
      }
      await fetchConversations(); // Atualiza lista de conversas
    }
    // TODO: Ouvintes para mensagens privadas atualizadas/deletadas
  });
}

async function selectPrivateConversation(conversation) {
  try {
    activeTab.value = 'private';
    await openConversation(conversation.id);
    scrollToBottom(true); // Força scroll ao abrir conversa
  } catch (error) {
    console.error('Erro ao abrir conversa privada:', error);
  }
}

function switchToPublic() {
  activeTab.value = 'public';
  nextTick(() => scrollToBottom());
}

// --- Lógica de Menções ---
function handleInput() {
  if (activeTab.value !== 'public') { showMentionDropdown.value = false; return; }
  const input = messageInput.value;
  if (!input) return;
  const cursorPos = input.selectionStart;
  const textBeforeCursor = input.value.substring(0, cursorPos);
  const mentionMatch = textBeforeCursor.match(/@(\w*)$/);
  if (mentionMatch) {
    mentionStartIndex.value = mentionMatch.index;
    const searchTerm = mentionMatch[1].toLowerCase();
    mentionUsers.value = roomUsers.value.filter(u => u.name.toLowerCase().includes(searchTerm) || u.email.toLowerCase().includes(searchTerm));
    showMentionDropdown.value = mentionUsers.value.length > 0;
    selectedMentionIndex.value = 0;
  } else { showMentionDropdown.value = false; mentionUsers.value = []; mentionStartIndex.value = -1; }
}

function handleKeydown(e) {
  if (!showMentionDropdown.value) return;
  if (e.key === 'ArrowDown') { e.preventDefault(); selectedMentionIndex.value = (selectedMentionIndex.value + 1) % mentionUsers.value.length; }
  else if (e.key === 'ArrowUp') { e.preventDefault(); selectedMentionIndex.value = (selectedMentionIndex.value - 1 + mentionUsers.value.length) % mentionUsers.value.length; }
  else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); if(mentionUsers.value.length > 0) { selectMention(mentionUsers.value[selectedMentionIndex.value]); } else { showMentionDropdown.value = false; } }
  else if (e.key === 'Escape') { e.preventDefault(); showMentionDropdown.value = false; }
}

async function selectMention(selectedUser) {
  const input = messageInput.value;
  if (!input || mentionStartIndex.value === -1) return;
  const beforeMention = newMessage.value.substring(0, mentionStartIndex.value);
  const afterCursor = newMessage.value.substring(input.selectionStart);
  newMessage.value = beforeMention + '@' + selectedUser.name + ' ' + afterCursor;
  nextTick(() => { const newCursorPosition = mentionStartIndex.value + selectedUser.name.length + 2; input.focus(); input.setSelectionRange(newCursorPosition, newCursorPosition); });
  showMentionDropdown.value = false; mentionUsers.value = []; mentionStartIndex.value = -1;
  // Comentado: Iniciar conversa privada ao mencionar (pode ser confuso)
  // try { await startConversation(selectedUser.id); await fetchConversations(); } catch (error) { console.error('Erro ao iniciar conversa via menção:', error); }
}
// --- Fim da Lógica de Menções ---

function scrollToBottom(force = false) {
  nextTick(() => {
    const container = messagesContainer.value;
    if (container) {
      const shouldScroll = force || container.scrollTop + container.clientHeight >= container.scrollHeight - 50;
      if (shouldScroll) { container.scrollTop = container.scrollHeight; }
    }
  });
}

// --- Funções com Proteção ---
async function sendMessage() {
  if (!canSendMessages.value) { alert('Você não tem permissão para enviar mensagens.'); return; }
  const contentToSend = newMessage.value.trim();
  if (!contentToSend) return;
  isSending.value = true;
  try {
    if (activeTab.value === 'public') { await sendRoomMessage(roomSlug.value, contentToSend); }
    else if (currentConversation.value) { await sendPrivateMessage(currentConversation.value.id, contentToSend); }
    newMessage.value = '';
    scrollToBottom(true);
    messageInput.value?.focus();
  } catch (error) { console.error('Erro ao enviar mensagem:', error); alert('Erro ao enviar mensagem: ' + (error.response?.data?.message || error.message)); }
  finally { isSending.value = false; }
}

async function leaveRoom() {
  if (!canLeaveRoom.value) { alert('Você não tem permissão para sair desta sala.'); return; }
  if (!confirm('Tem certeza que deseja sair desta sala?')) return;
  try { await RoomService.leave(roomSlug.value); router.push('/chat'); }
  catch (error) { console.error('Erro ao sair da sala:', error); const errorMsg = error.response?.status === 403 ? 'Você não tem permissão para sair desta sala (ex: criador).' : (error.response?.data?.message || error.message); alert('Erro ao sair da sala: ' + errorMsg); }
}

// --- Funções Novas (Editar/Deletar) ---
async function deleteMessage(messageId) {
  const messageToDelete = messages.value.find(m => m.id === messageId); // Procura na lista local
  if (!messageToDelete) return;
  const isOwnMessage = messageToDelete.user.id === user.value?.id;
  if (!((canDeleteOwnMessage.value && isOwnMessage) || canDeleteAnyMessage.value)) { alert('Você não tem permissão para deletar esta mensagem.'); return; }
  if (!confirm('Tem certeza que deseja deletar esta mensagem?')) return;
  try {
    console.log("Chamando API para deletar mensagem:", messageId); // Placeholder
    // await MessageService.delete(messageId); // Chamar o serviço real
    // O evento WebSocket ('message.deleted') DEVE remover da UI. Não remova localmente aqui.
  } catch (error) { console.error('Erro ao deletar mensagem:', error); alert('Erro ao deletar mensagem.'); }
}

function startEditing(message) {
  if (editingMessage.value) { cancelEdit(); } // Cancela edição anterior
  const isOwnMessage = message.user.id === user.value?.id;
  if (!((canEditOwnMessage.value && isOwnMessage) || canEditAnyMessage.value)) { alert('Você não tem permissão para editar esta mensagem.'); return; }
  editingMessage.value = message;
  editMessageContent.value = message.content;
  nextTick(() => document.getElementById(`edit-textarea-${message.id}`)?.focus()); // Foca na textarea
}

async function saveEdit() {
  if (!editingMessage.value) return;
  const newContent = editMessageContent.value.trim();
  // Cancela se não houver mudança ou conteúdo vazio
  if (!newContent || newContent === editingMessage.value.content) { cancelEdit(); return; }
  const messageId = editingMessage.value.id;
  const originalMessageRef = editingMessage.value; // Guarda referência
  editingMessage.value = null; // Sai do modo de edição visualmente *antes* da chamada API (otimista)
  try {
    console.log("Chamando API para editar mensagem:", messageId, newContent); // Placeholder
    // await MessageService.update(messageId, { content: newContent }); // Chamar o serviço real
    // O evento WebSocket ('message.updated') DEVE atualizar na UI.
    // Se a API falhar, podemos reverter a UI ou mostrar erro.
  } catch (error) {
    console.error('Erro ao editar mensagem:', error);
    alert('Erro ao salvar edição da mensagem.');
    // Reverte a UI se a API falhar (volta ao modo de edição com conteúdo antigo)
    editingMessage.value = originalMessageRef;
    // editMessageContent permanece com o valor digitado para o usuário tentar de novo
  } finally {
    // cancelEdit() foi movido para dentro do try/sucesso para UI otimista
  }
}

function cancelEdit() {
  editingMessage.value = null;
  editMessageContent.value = '';
}
// --- Fim das Funções Novas ---

// --- Funções de Formatação ---
function formatTime(timestamp) {
  if (!timestamp) return '';
  return new Date(timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
function formatDate(timestamp) {
  if (!timestamp) return '';
  return new Date(timestamp).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// --- Watcher e Lifecycle Hooks ---
watch(() => route.params.slug, async (newSlug, oldSlug) => {
  if (newSlug && newSlug !== oldSlug) {
    console.log(`Room.vue: Mudando da sala ${oldSlug} para ${newSlug}`);
    // Reseta estado local ao mudar de sala
    messages.value = []; conversations.value = []; currentConversation.value = null;
    privateMessages.value = []; newMessage.value = ''; activeTab.value = 'public';
    editingMessage.value = null; editMessageContent.value = ''; // Reseta edição
    loading.value = true;
    await loadRoomData(); // Carrega dados da nova sala
    scrollToBottom(true); // Scroll inicial para nova sala
  }
}, { immediate: false });

onMounted(async () => {
  console.log("Room.vue: Montado. Carregando dados da sala...");
  await loadRoomData();
  scrollToBottom(true);
});

onUnmounted(() => {
  console.log("Room.vue: Desmontado. Desconectando WebSocket...");
  disconnect();
});
</script>

<template>
  <ChatLayout :title="currentRoom ? `Sala: ${currentRoom.name}` : 'Carregando...'">
    <div v-if="loading" class="flex items-center justify-center h-full">
      <div class="text-center">
        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
        <p class="text-gray-600">Carregando sala...</p>
      </div>
    </div>

    <div v-else-if="currentRoom" class="flex flex-col h-full bg-gray-100"> {/* Fundo geral cinza */}

      {/* Flex container principal */}
      <div class="flex flex-1 overflow-hidden">

        {/* Sidebar */}
        <div class="w-64 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col shadow-sm"> {/* Fundo branco */}
          <div class="p-4 border-b">
            <h2 class="text-gray-800 text-lg font-semibold">Conversas</h2>
          </div>
          <div class="p-4 border-b flex space-x-2 bg-gray-50"> {/* Fundo leve nos botões */}
            <button @click="switchToPublic" :class="btnActivePublic">Público</button>
            <button @click="activeTab = 'private'" :class="btnActivePriv">Privado</button>
          </div>

          {/* Container da Lista (Scroll) */}
          <div class="flex-1 overflow-y-auto">
            {/* Lista Privada */}
            <div v-if="activeTab === 'private'">
              <div v-for="conv in conversations" :key="conv.id"
                   @click="selectPrivateConversation(conv)"
                   :class="['p-3 border-b border-gray-100 cursor-pointer hover:bg-gray-100 flex items-center space-x-3', currentConversation?.id === conv.id ? 'bg-blue-50 hover:bg-blue-100' : '']">
                <div class="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white flex-shrink-0 text-lg font-medium"> {/* Tamanho/fonte avatar */}
                  {{ conv.other_user.name.charAt(0).toUpperCase() }}
                </div>
                <div class="flex-1 overflow-hidden">
                  <h3 class="font-semibold text-sm text-gray-900 truncate">{{ conv.other_user.name }}</h3> {/* Fonte mais forte */}
                  <p v-if="conv.latest_message" class="text-xs text-gray-500 truncate">
                    {{ conv.latest_message.content }}
                  </p>
                  <p v-else class="text-xs text-gray-400 italic">Nenhuma mensagem</p>
                </div>
                {/* TODO: Indicador msg não lida */}
              </div>
              <div v-if="conversations.length === 0" class="p-4 text-center text-gray-500 text-sm italic">
                Nenhuma conversa privada.<br>Use @ no chat público.
              </div>
            </div>
            {/* Placeholder Sidebar Pública */}
            <div v-if="activeTab === 'public'" class="p-4 text-center text-gray-500 text-sm italic flex flex-col items-center justify-center h-full">
              {/* Info da Sala Pública */}
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
              {/* Placeholder instrução */}
              <p>Use @ para mencionar e iniciar conversas privadas.</p>
            </div>
          </div>
          {/* Rodapé da Sidebar */}
          <div class="p-2 border-t border-gray-200 flex flex-col space-y-1"> {/* Menos espaçamento */}
            <button v-if="canManageUsers" @click="showUserManager = true" class="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 rounded">Gerenciar Usuários</button>
            <button v-if="canLeaveRoom" @click="leaveRoom" class="w-full text-left px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded">Sair da Sala</button>
          </div>
        </div>

        {/* Área Principal do Chat */}
        <div class="flex-1 flex flex-col bg-white">
          {/* Container das Mensagens */}
          <div ref="messagesContainer" class="flex-1 overflow-y-auto p-4 md:p-6 space-y-3"> {/* Menos space-y */}
            {/* Mensagens Públicas */}
            <template v-if="activeTab === 'public'">
              <div v-for="message in messages" :key="message.id" class="flex flex-col group" :class="[message.user.id === user?.id ? 'items-end' : 'items-start']"> {/* Alinha o container todo */}
                <div :class="message.user.id === user?.id ? msgSent : msgRecv" class="max-w-[70%] md:max-w-[60%] rounded-lg shadow-md px-3 py-2 relative"> {/* Max-width percentual, padding menor */}
                  {/* Info (Nome visível apenas para outros) */}
                  <div class="flex items-baseline space-x-1.5 mb-0.5">
                    <span v-if="message.user.id !== user?.id" class="text-xs font-semibold" :class="message.user.id === user?.id ? 'text-white text-opacity-90' : 'text-gray-700'">{{ message.user.name }}</span>
                    <span class="text-[9px] opacity-70" :class="message.user.id === user?.id ? 'text-blue-100' : 'text-gray-400'"> {/* Cor do tempo */}
                                        {{ formatTime(message.created_at) }}
                                    </span>
                    <span v-if="message.edited_at" class="text-[9px] italic opacity-70" :class="message.user.id === user?.id ? 'text-blue-100' : 'text-gray-400'">(editada)</span>
                  </div>
                  {/* Conteúdo e Edição */}
                  <div class="text-sm break-words">
                    <span v-if="editingMessage?.id !== message.id">{{ message.content }}</span>
                    <textarea v-else :id="`edit-textarea-${message.id}`" v-model="editMessageContent" @keydown.esc="cancelEdit" @keydown.enter.prevent="saveEdit" class="block w-full border rounded p-1 text-sm bg-white bg-opacity-90 focus:ring-1 focus:ring-blue-500" rows="2"></textarea>
                  </div>
                  {/* Botões Ação (Hover) */}
                  <div class="absolute -top-2 right-1 flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity bg-white border rounded-full shadow p-0.5" v-if="editingMessage?.id !== message.id">
                    <button v-if="(canEditOwnMessage && message.user.id === user?.id) || canEditAnyMessage" @click="startEditing(message)" title="Editar" class="p-1 rounded-full text-gray-500 hover:bg-gray-100 hover:text-blue-600 text-xs">✏️</button>
                    <button v-if="(canDeleteOwnMessage && message.user.id === user?.id) || canDeleteAnyMessage" @click="deleteMessage(message.id)" title="Deletar" class="p-1 rounded-full text-gray-500 hover:bg-gray-100 hover:text-red-600 text-xs">🗑️</button>
                  </div>
                  {/* Botões Salvar/Cancelar Edição */}
                  <div class="mt-1 space-x-2 text-xs text-right" v-if="editingMessage?.id === message.id">
                    <button @click="saveEdit" class="text-green-600 hover:text-green-800 font-medium">Salvar</button>
                    <button @click="cancelEdit" class="text-gray-500 hover:text-gray-700">Cancelar</button>
                  </div>
                </div>
              </div>
            </template>

            {/* Mensagens Privadas (Estrutura Similar) */}
            <template v-if="activeTab === 'private' && currentConversation">
              <div v-for="message in privateMessages" :key="message.id" class="flex flex-col group" :class="[message.sender.id === user?.id ? 'items-end' : 'items-start']">
                <div :class="message.sender.id === user?.id ? msgSent : msgRecv" class="max-w-[70%] md:max-w-[60%] rounded-lg shadow-md px-3 py-2 relative">
                  <div class="flex items-baseline space-x-1.5 mb-0.5">
                    {/* Não mostra o nome em chat privado (geralmente) */}
                    <span class="text-[9px] opacity-70" :class="message.sender.id === user?.id ? 'text-blue-100' : 'text-gray-400'">
                                        {{ formatTime(message.created_at) }}
                                    </span>
                    <span v-if="message.is_edited" class="text-[9px] italic opacity-70" :class="message.sender.id === user?.id ? 'text-blue-100' : 'text-gray-400'">(editada)</span>
                  </div>
                  <div class="text-sm break-words">
                    <span>{{ message.content }}</span>
                    {/* Adicionar botões editar/deletar se aplicável a msgs privadas */}
                  </div>
                </div>
              </div>
            </template>

            {/* Placeholder Sem Conversa */}
            <div v-if="activeTab === 'private' && !currentConversation" class="flex items-center justify-center h-full text-gray-400 italic">
              {/* ... seu placeholder ... */}
            </div>
          </div>

          {/* Formulário de Envio */}
          <div class="border-t p-3 md:p-4 bg-gray-50" v-if="canSendMessages">
            <form @submit.prevent="sendMessage" class="flex items-center space-x-2">
              <div class="flex-1 relative">
                <input ref="messageInput" v-model="newMessage" @input="handleInput" @keydown.enter.prevent="sendMessage" @keydown="handleKeydown"
                       :placeholder="getPlaceholderText"
                       class="w-full text-gray-800 px-4 py-2 border border-gray-300 rounded-full focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:bg-gray-200"
                       :disabled="isSending || (activeTab === 'private' && !currentConversation)" />

                {/* Dropdown Menções */}
                <div v-if="showMentionDropdown && mentionUsers.length" class="absolute bottom-full left-0 right-0 bg-white border rounded-md shadow-lg max-h-48 overflow-y-auto z-10 mb-1">
                  {/* ... loop v-for (u, i) in mentionUsers ... */}
                </div>
              </div>
              <button type="submit"
                      :disabled="!newMessage.trim() || isSending || (activeTab === 'private' && !currentConversation)"
                      class="px-5 py-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 disabled:opacity-50 flex-shrink-0">
                {{ isSending ? '...' : 'Enviar' }}
              </button>
            </form>
          </div>
          {/* Mensagem Sem Permissão */}
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

    {/* TODO: Modal Gerenciar Usuários */}

  </ChatLayout>
</template>
