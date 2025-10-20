<script setup>
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from '@/composables/useAuth'
import { useRooms } from '@/composables/useRooms'
import { useMessages } from '@/composables/useMessages'
import { usePrivateConversations } from '@/composables/usePrivateConversations'
import { useWebSocket } from '@/composables/useWebSocket'
import { RoomService /*, MessageService*/ } from '@/services'
import ChatLayout from '@/layouts/ChatLayout.vue'

const route = useRoute()
const router = useRouter()

const { user, can } = useAuth()
const { currentRoom, fetchRoomBySlug } = useRooms()
const {
  messages,
  fetchMessages,
  sendMessage: sendRoomMessage,
  addMessage,
  removeMessage,
  updateMessageInList
} = useMessages()
const {
  conversations,
  currentConversation,
  messages: privateMessages,
  fetchConversations,
  startConversation,
  openConversation,
  sendMessage: sendPrivateMessage,
  addMessage: addPrivateMessage
} = usePrivateConversations()
const { connectionStatus, connect, joinRoom, joinUserChannel, disconnect } = useWebSocket()

// --- REFS ---
const messageInput = ref(null)
const messagesContainer = ref(null)
const newMessage = ref('')
const isSending = ref(false)
const editingMessage = ref(null)
const editMessageContent = ref('')
const showUserManager = ref(false)
const activeTab = ref('public')
const showMentionDropdown = ref(false)
const mentionUsers = ref([])
const selectedMentionIndex = ref(0)
const mentionStartIndex = ref(-1)
const roomUsers = ref([])
const loading = ref(true)

// --- COMPUTEDS ---
const roomSlug = computed(() => route.params.slug)
const canManageUsers = computed(() => can('add-member-room'))
const canSendMessages = computed(() => can('send-messages'))
const canLeaveRoom = computed(() => can('leave-room'))
const canDeleteAnyMessage = computed(() => can('delete-any-message'))
const canEditAnyMessage = computed(() => can('edit-any-message'))

const getPlaceholderText = computed(() =>
  activeTab.value === 'public'
    ? 'Digite @ para mencionar usuários...'
    : currentConversation.value
      ? 'Digite sua mensagem...'
      : 'Selecione uma conversa'
)

const btnActivePublic = computed(() =>
  activeTab.value === 'public'
    ? 'px-3 py-2 rounded text-sm font-medium bg-blue-500 text-white'
    : 'px-3 py-2 rounded text-sm font-medium bg-gray-200 text-gray-700 hover:bg-gray-300'
)
const btnActivePriv = computed(() =>
  activeTab.value === 'private'
    ? 'px-3 py-2 rounded text-sm font-medium bg-blue-500 text-white'
    : 'px-3 py-2 rounded text-sm font-medium bg-gray-200 text-gray-700 hover:bg-gray-300'
)

const msgSent = 'self-end bg-blue-500 text-white'
const msgRecv = 'self-start bg-gray-100 text-gray-900'

// --- FUNÇÕES PRINCIPAIS ---
async function loadRoomData() {
  loading.value = true
  try {
    await fetchRoomBySlug(roomSlug.value)
    await fetchMessages(roomSlug.value)
    await fetchConversations()
    await loadRoomUsers()
    setupWebSocket()
  } catch (error) {
    console.error('Erro ao carregar sala:', error)
    router.push('/chat')
  } finally {
    loading.value = false
  }
}

async function loadRoomUsers() {
  try {
    const response = await RoomService.getMembers(roomSlug.value)
    roomUsers.value = response.data.filter(u => u.id !== user.value?.id)
  } catch (error) {
    console.error('Erro ao carregar usuários:', error)
    roomUsers.value = currentRoom.value?.users?.filter(u => u.id !== user.value?.id) || []
  }
}

function setupWebSocket() {
  if (!user.value) return
  const token = localStorage.getItem('chat_token')
  if (!token || connectionStatus.value === 'connected') return

  const echo = connect(token)
  if (!echo) return

  joinRoom(roomSlug.value, {
    onMessageSent: (event) => {
      if (!messages.value.some(m => m.id === event.message.id)) {
        addMessage(event.message)
        if (activeTab.value === 'public') scrollToBottom()
      }
    },
    onMessageUpdated: (event) => updateMessageInList(event.message),
    onMessageDeleted: (event) => removeMessage(event.message.id)
  })

  joinUserChannel(user.value.id, {
    onPrivateMessage: async (event) => {
      if (activeTab.value === 'private' && currentConversation.value?.id === event.message.conversation_id) {
        addPrivateMessage(event.message)
        scrollToBottom()
      }
      await fetchConversations()
    }
  })
}

// --- ENVIO DE MENSAGEM ---
async function sendMessage() {
  if (!canSendMessages.value) return
  if (!newMessage.value.trim()) return

  isSending.value = true
  try {
    if (activeTab.value === 'public') {
      await sendRoomMessage(roomSlug.value, newMessage.value)
    } else if (currentConversation.value) {
      await sendPrivateMessage(currentConversation.value.id, newMessage.value)
    }
    newMessage.value = ''
    scrollToBottom()
  } catch (error) {
    console.error('Erro ao enviar mensagem:', error)
    alert('Erro ao enviar mensagem')
  } finally {
    isSending.value = false
  }
}

// --- SAIR DA SALA ---
async function leaveRoom() {
  if (!canLeaveRoom.value) return alert('Você não tem permissão para sair desta sala.')
  if (!confirm('Tem certeza que deseja sair desta sala?')) return
  try {
    await RoomService.leave(roomSlug.value)
    router.push('/chat')
  } catch (error) {
    console.error('Erro ao sair da sala:', error)
    alert('Erro: ' + (error.response?.data?.message || error.message))
  }
}

// --- EDITAR / DELETAR MENSAGEM ---
async function deleteMessage(messageId) {
  const message = messages.value.find(m => m.id === messageId)
  if (!message) return

  const canDeleteOwn = can('delete-messages') && message.user.id === user.value?.id
  const canDeleteAny = canDeleteAnyMessage.value

  if (!canDeleteOwn && !canDeleteAny) return alert('Sem permissão para deletar.')
  if (!confirm('Deseja deletar esta mensagem?')) return

  try {
    // await MessageService.delete(messageId)
    console.log('Chamaria API para deletar mensagem:', messageId)
  } catch (err) {
    console.error(err)
    alert('Erro ao deletar mensagem.')
  }
}

function startEditing(message) {
  const canEditOwn = can('edit-messages') && message.user.id === user.value?.id
  const canEditAny = canEditAnyMessage.value
  if (!canEditOwn && !canEditAny) return alert('Sem permissão para editar.')
  editingMessage.value = message
  editMessageContent.value = message.content
}

async function saveEdit() {
  if (!editingMessage.value || !editMessageContent.value.trim()) return
  try {
    // await MessageService.update(editingMessage.value.id, { content: editMessageContent.value })
    console.log('Chamaria API para editar mensagem:', editingMessage.value.id)
    cancelEdit()
  } catch (err) {
    console.error(err)
    alert('Erro ao editar mensagem.')
  }
}

function cancelEdit() {
  editingMessage.value = null
  editMessageContent.value = ''
}

// --- MENCIONAR USUÁRIOS ---
function handleInput() { /* ... igual ao teu atual ... */ }
function handleKeydown(e) { /* ... igual ao teu atual ... */ }
async function selectMention(u) { /* ... igual ao teu atual ... */ }

// --- UTILS ---
function scrollToBottom() {
  nextTick(() => {
    if (messagesContainer.value)
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
  })
}

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}
function formatDate(ts) {
  return new Date(ts).toLocaleDateString('pt-BR')
}

// --- WATCHERS / LIFECYCLE ---
watch(() => route.params.slug, async (newSlug) => {
  if (!newSlug) return
  activeTab.value = 'public'
  await loadRoomData()
})
onMounted(loadRoomData)
onUnmounted(disconnect)
</script>

<template>
  <ChatLayout :title="currentRoom ? `Sala: ${currentRoom.name}` : 'Carregando...'">
    <div v-if="loading" class="flex items-center justify-center h-96">
      <div class="text-center">
        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
        <p class="text-gray-600">Carregando sala...</p>
      </div>
    </div>

    <div v-else-if="currentRoom" class="bg-blue-50 py-12">
      <div class="max-w-7xl mx-auto sm:px-6 lg:px-8 bg-white shadow-xl sm:rounded-lg overflow-hidden">
        <div class="p-6 border-b border-gray-200 flex justify-between items-center">
          <div>
            <h2 class="text-2xl font-bold">{{ currentRoom.name }}</h2>
            <p v-if="currentRoom.description" class="text-gray-600 mt-1">{{ currentRoom.description }}</p>
          </div>
          <div class="space-x-3">
            <button v-if="canManageUsers" class="text-sm text-blue-600" @click="showUserManager = true">
              Gerenciar Usuários
            </button>
            <button v-if="canLeaveRoom" class="text-sm text-red-600" @click="leaveRoom">
              Sair da Sala
            </button>
          </div>
        </div>

        <div class="flex">
          <!-- SIDEBAR -->
          <div class="w-1/4 bg-gray-50 border-r p-4">
            <button @click="switchToPublic" :class="btnActivePublic">Chat Público</button>
            <button @click="activeTab = 'private'" :class="btnActivePriv" class="ml-2">Chats Privados</button>
          </div>

          <!-- CHAT -->
          <div class="flex-1 flex flex-col h-96">
            <div ref="messagesContainer" class="flex-1 overflow-y-auto p-6 space-y-4">
              <div v-for="message in messages" :key="message.id"
                   :class="message.user.id === user.id ? msgSent : msgRecv"
                   class="max-w-md rounded-lg px-4 py-2 shadow relative">
                <div v-if="editingMessage?.id !== message.id">
                  <p class="text-sm">{{ message.content }}</p>
                  <div class="text-xs mt-1 space-x-2">
                    <button v-if="(can('edit-messages') && message.user.id === user.id) || canEditAnyMessage"
                            @click="startEditing(message)" class="text-blue-500">Editar</button>
                    <button v-if="(can('delete-messages') && message.user.id === user.id) || canDeleteAnyMessage"
                            @click="deleteMessage(message.id)" class="text-red-500">Deletar</button>
                  </div>
                </div>
                <div v-else>
                  <textarea v-model="editMessageContent" class="border rounded w-full p-1"></textarea>
                  <div class="text-xs mt-1 space-x-2">
                    <button @click="saveEdit" class="text-green-500">Salvar</button>
                    <button @click="cancelEdit" class="text-gray-500">Cancelar</button>
                  </div>
                </div>
              </div>
            </div>

            <!-- INPUT -->
            <div class="border-t p-4 bg-white" v-if="canSendMessages">
              <form @submit.prevent="sendMessage" class="flex space-x-2">
                <input ref="messageInput" v-model="newMessage" @input="handleInput" @keydown="handleKeydown"
                       :placeholder="getPlaceholderText" class="flex-1 border rounded p-2" />
                <button type="submit" :disabled="!newMessage.trim() || isSending"
                        class="px-4 py-2 bg-blue-500 text-white rounded">
                  {{ isSending ? 'Enviando...' : 'Enviar' }}
                </button>
              </form>
            </div>
            <div v-else class="border-t p-4 text-center text-gray-500 text-sm bg-gray-100">
              Você não tem permissão para enviar mensagens nesta sala.
            </div>
          </div>
        </div>
      </div>
    </div>
  </ChatLayout>
</template>
