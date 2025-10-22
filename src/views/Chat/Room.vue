<script setup>
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from '@/composables/useAuth'
import { useRooms } from '@/composables/useRooms'
import { useMessages } from '@/composables/useMessages'
import { usePrivateConversations } from '@/composables/usePrivateConversations'
import { useWebSocket } from '@/composables/useWebSocket'
import { RoomService } from '@/services'
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

// --- Refs existentes ---
const messageInput = ref(null)
const messagesContainer = ref(null)
const newMessage = ref('')
const isSending = ref(false)
const showUserManager = ref(false)
const activeTab = ref('public')
const showMentionDropdown = ref(false)
const mentionUsers = ref([])
const selectedMentionIndex = ref(0)
const mentionStartIndex = ref(-1)
const roomUsers = ref([])
const loading = ref(true)

// --- Refs para Edição/Deleção ---
const editingMessage = ref(null)
const editMessageContent = ref('')

// --- Computeds existentes ---
const roomSlug = computed(() => route.params.slug)

const getPlaceholderText = computed(() => activeTab.value === 'public' ? 'Digite @ para mencionar usuários...' : currentConversation.value ? 'Digite sua mensagem...' : 'Selecione uma conversa'
)
const btnActivePublic = computed(() => activeTab.value === 'public'
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

// --- Computeds de Permissão ---
const canManageUsers = computed(() => can('add-member-room'))
const canSendMessages = computed(() => can('send-messages'))
const canLeaveRoom = computed(() => can('leave-room'))
const canDeleteAnyMessage = computed(() => can('delete-any-message'))
const canEditAnyMessage = computed(() => can('edit-any-message'))
// Permissões individuais (para checar se pode editar/deletar a *própria* mensagem)
const canDeleteOwnMessage = computed(() => can('delete-messages'))
const canEditOwnMessage = computed(() => can('edit-messages'))


// --- Funções existentes ---
async function loadRoomData() {
  loading.value = true
  try {
    await fetchRoomBySlug(roomSlug.value)      // valida acesso
    await fetchMessages(roomSlug.value)
    await fetchConversations()
    await loadRoomUsers()
    setupWebSocket()                           // conecta só após sucesso
  } catch (error) {
    console.error('Erro ao carregar sala:', error)
    router.push('/chat')
    return
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
  if (!token) return
  if (connectionStatus.value === 'connected') return

  const echo = connect(token)
  if (!echo) return

  joinRoom(roomSlug.value, {
    onMessageSent: (event) => {
      if (!messages.value.some(m => m.id === event.message.id)) {
        addMessage(event.message)
        if (activeTab.value === 'public') scrollToBottom()
      }
    },
    onMessageUpdated: (event) => {
      updateMessageInList(event.message)
    },
    onMessageDeleted: (event) => {
      removeMessage(event.message.id)
    }
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

async function selectPrivateConversation(conversation) {
  try {
    await openConversation(conversation.id)
    scrollToBottom()
  } catch (error) {
    console.error('Erro ao abrir conversa:', error)
  }
}

function switchToPublic() {
  activeTab.value = 'public'
  scrollToBottom()
}

function handleInput() {
  if (activeTab.value !== 'public') return
  const input = messageInput.value
  if (!input) return

  const val = input.value
  const pos = input.selectionStart
  let start = -1
  for (let i = pos - 1; i >= 0; i--) {
    if (val[i] === '@') {
      start = i
      break
    }
    if (val[i] === ' ') break
  }
  if (start !== -1) {
    mentionStartIndex.value = start
    const term = val.substring(start + 1, pos).toLowerCase()
    mentionUsers.value = roomUsers.value.filter(u =>
      u.name.toLowerCase().includes(term) || u.email.toLowerCase().includes(term))
    showMentionDropdown.value = mentionUsers.value.length > 0
    selectedMentionIndex.value = 0
  } else {
    showMentionDropdown.value = false
    mentionUsers.value = []
  }
}

function handleKeydown(e) {
  if (!showMentionDropdown.value) return
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    selectedMentionIndex.value = Math.min(selectedMentionIndex.value + 1, mentionUsers.value.length - 1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    selectedMentionIndex.value = Math.max(selectedMentionIndex.value - 1, 0)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    selectMention(mentionUsers.value[selectedMentionIndex.value])
  } else if (e.key === 'Escape') {
    showMentionDropdown.value = false
  }
}

async function selectMention(u) {
  const input = messageInput.value
  const beforeMention = newMessage.value.substring(0, mentionStartIndex.value)
  const afterCursor = newMessage.value.substring(input.selectionStart)
  newMessage.value = beforeMention + '@' + u.name + ' ' + afterCursor

  nextTick(() => {
    const newPosition = beforeMention.length + u.name.length + 2
    input.setSelectionRange(newPosition, newPosition)
  })

  try {
    const conversation = await startConversation(u.id)
    await fetchConversations()
    activeTab.value = 'private'
    await openConversation(conversation.id)
    scrollToBottom()
  } catch (error) {
    console.error('Erro ao iniciar conversa:', error)
  }

  showMentionDropdown.value = false
  mentionUsers.value = []
}

function scrollToBottom() {
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
    }
  })
}

// --- Funções Atualizadas com Proteção ---
async function sendMessage() {
  if (!canSendMessages.value) return // Proteção
  if (!newMessage.value.trim()) return
  isSending.value = true
  try {
    if (activeTab.value === 'public') {
      await sendRoomMessage(roomSlug.value, newMessage.value)
    } else if (currentConversation.value) {
      await sendPrivateMessage(currentConversation.value.id, newMessage.value)
    }
    newMessage.value = ''
    // Não adicionar localmente; o evento cuidará da inserção
    scrollToBottom()
  } catch (error) {
    console.error('Erro ao enviar mensagem:', error)
    alert('Erro ao enviar mensagem')
  } finally {
    isSending.value = false
  }
}
  async function leaveRoom() {
    if (!canLeaveRoom.value) return // Proteção
    if (!confirm('Tem certeza que deseja sair desta sala?')) return
    try {
      await RoomService.leave(roomSlug.value)
      router.push('/chat')
    } catch (error) {
      console.error('Erro ao sair da sala:', error)
    }
  }

// --- Funções Novas (Editar/Deletar) ---
  async function deleteMessage(messageId) {
    const messageToDelete = messages.value.find(m => m.id === messageId)
    if (!messageToDelete) return

    // Lógica complexa de permissão
    const isOwnMessage = messageToDelete.user.id === user.value?.id
    const allowedToDeleteOwn = canDeleteOwnMessage.value && isOwnMessage
    const allowedToDeleteAny = canDeleteAnyMessage.value

    if (!allowedToDeleteOwn && !allowedToDeleteAny) {
      alert('Você não tem permissão para deletar esta mensagem.')
      return
    }

    if (!confirm('Tem certeza que deseja deletar esta mensagem?')) return

    try {
      console.log('Chamaria API para deletar mensagem:', messageId) // Placeholder
      // Ex: await MessageService.delete(messageId);
      // O evento WebSocket deve cuidar da remoção da UI
    } catch (error) {
      console.error('Erro ao deletar mensagem:', error)
      alert('Erro ao deletar mensagem.')
    }
  }

  function startEditing(message) {
    const isOwnMessage = message.user.id === user.value?.id
    const allowedToEditOwn = canEditOwnMessage.value && isOwnMessage
    const allowedToEditAny = canEditAnyMessage.value

    if (!allowedToEditOwn && !allowedToEditAny) {
      alert('Você não tem permissão para editar esta mensagem.')
      return
    }
    editingMessage.value = message
    editMessageContent.value = message.content
  }

  async function saveEdit() {
    if (!editingMessage.value || !editMessageContent.value.trim()) return

    const messageId = editingMessage.value.id
    const newContent = editMessageContent.value

    try {
      console.log('Chamaria API para editar mensagem:', messageId, newContent) // Placeholder
      // Ex: await MessageService.update(messageId, { content: newContent });
      // O evento WebSocket deve cuidar da atualização na UI
      cancelEdit()
    } catch (error) {
      console.error('Erro ao editar mensagem:', error)
      alert('Erro ao editar mensagem.')
    }
  }

  function cancelEdit() {
    editingMessage.value = null
    editMessageContent.value = ''
  }

// --- Fim das Funções Novas ---

// --- Funções de Formatação ---
  function formatTime(timestamp) {
    return new Date(timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  }

  function formatDate(timestamp) {
    return new Date(timestamp).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    })
  }

// --- Watcher e Lifecycle Hooks ---
  watch(() => route.params.slug, async (newSlug) => {
    if (!newSlug) return
    activeTab.value = 'public'
    await loadRoomData()
  })

  onMounted(async () => {
    await loadRoomData()
    scrollToBottom()
  })

  onUnmounted(() => {
    disconnect()
  })
</script>

<template>
  <ChatLayout :title="currentRoom ? `Sala: ${currentRoom.name}` : 'Carregando...'">
    <!-- Loading state -->
    <div v-if="loading" class="flex items-center justify-center h-96">
      <div class="text-center">
        <div
          class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
        <p class="text-gray-600">Carregando sala...</p>
      </div>
    </div>

    <div v-else-if="currentRoom" class="bg-blue-50 py-12">
      <div class="max-w-7xl mx-auto sm:px-6 lg:px-8">
        <div class="bg-white overflow-hidden shadow-xl sm:rounded-lg">
          <div class="p-6 border-b border-gray-200">
            <div class="flex items-center mt-2 space-x-4">
              <button v-if="canManageUsers" @click="showUserManager = true"
                      class="ml-auto px-3 py-1 bg-indigo-500 text-white text-xs rounded hover:bg-indigo-600">
                Gerenciar
              </button>
              <button v-if="canLeaveRoom" @click="leaveRoom"
                      class="px-3 py-1 bg-red-500 text-white text-xs rounded hover:bg-red-600">Sair
              </button>
            </div>
          </div>

          <div class="flex">
            <div class="w-1/4 bg-gray-50 border-r border-gray-200">
            </div>

            <div class="flex-1 flex flex-col h-96">
              <div ref="messagesContainer" class="flex-1 overflow-y-auto p-6 space-y-4">
                <template v-if="activeTab === 'public'">
                  <div v-for="message in messages" :key="message.id" class="flex flex-col group">
                    {/* Adicionado 'group' para hover */}
                    <div :class="message.user.id === user?.id ? msgSent : msgRecv"
                         class="max-w-xs md:max-w-sm lg:max-w-md rounded-lg shadow px-4 py-2 relative">
                      {/* Adicionado 'relative' */}
                      <div class="flex items-center space-x-2 mb-1">
                        <span class="text-xs font-semibold">{{ message.user.name }}</span>
                        <span class="text-[10px] opacity-80"> {/* Era font-bold, ajustado opacidade */}
                          {{ formatDate(message.created_at) }} - {{ formatTime(message.created_at)
                          }}
                        </span>
                        <span v-if="message.edited_at" class="text-[10px] text-gray-400 italic">(editada)</span>
                      </div>

                      <div class="text-sm break-words">
                        <span v-if="editingMessage?.id !== message.id">{{ message.content }}</span>
                        <textarea v-else v-model="editMessageContent" @keydown.esc="cancelEdit"
                                  @keydown.enter.prevent="saveEdit"
                                  class="border rounded w-full p-1 text-sm bg-white bg-opacity-90"></textarea>
                        {/* Adicionado eventos de teclado */}
                      </div>

                      <div
                        class="absolute top-1 right-1 flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity"
                        v-if="editingMessage?.id !== message.id">
                        <button
                          v-if="(canEditOwnMessage && message.user.id === user?.id) || canEditAnyMessage"
                          @click="startEditing(message)" title="Editar"
                          class="p-1 rounded hover:bg-black hover:bg-opacity-20">
                          ✏️ {/* Emoji ou Ícone SVG */}
                        </button>
                        <button
                          v-if="(canDeleteOwnMessage && message.user.id === user?.id) || canDeleteAnyMessage"
                          @click="deleteMessage(message.id)" title="Deletar"
                          class="p-1 rounded hover:bg-black hover:bg-opacity-20">
                          🗑️ {/* Emoji ou Ícone SVG */}
                        </button>
                      </div>
                      <div class="mt-1 space-x-2 text-xs text-right"
                           v-if="editingMessage?.id === message.id">
                        <button @click="saveEdit"
                                class="text-green-600 hover:text-green-800 font-medium">Salvar
                        </button>
                        <button @click="cancelEdit" class="text-gray-500 hover:text-gray-700">
                          Cancelar
                        </button>
                      </div>
                    </div>
                  </div>
                </template>

                <div class="flex items-center mt-2 space-x-4">
              <span v-if="activeTab === 'public'" class="text-sm text-gray-500">
                {{ currentRoom.users_count || 0
                }} {{ (currentRoom.users_count || 0) === 1 ? 'usuário' : 'usuários' }}
              </span>
                  <span v-if="currentRoom.is_private && activeTab === 'public'"
                        class="px-2 py-1 bg-red-100 text-red-800 text-xs rounded-full">Privada</span>
                  <span v-else-if="activeTab === 'public'"
                        class="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">Pública</span>
                  <span
                    :class="connectionStatus === 'connected' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'"
                    class="px-2 py-1 text-xs rounded-full">
                {{ connectionStatus === 'connected' ? '🟢 Online' : '🔴 Offline' }}
              </span>
                </div>


                <!-- Mensagens públicas -->
                <template v-if="activeTab === 'public'">
                  <div v-for="message in messages" :key="message.id" class="flex flex-col">
                    <div :class="message.user.id === user.id ? msgSent : msgRecv"
                         class="max-w-xs md:max-w-sm lg:max-w-md rounded-lg shadow px-4 py-2">
                      <div class="flex items-center space-x-2 mb-1">
                        <span class="text-xs font-semibold">{{ message.user.name }}</span>
                        <span class="text-[10px] font-bold">
                          {{ formatDate(message.created_at) }} - {{ formatTime(message.created_at)
                          }}
                        </span>
                        <span v-if="message.edited_at"
                              class="text-[10px] text-gray-400">(editada)</span>
                      </div>
                      <p class="text-sm break-words">{{ message.content }}</p>
                    </div>
                  </div>
                </template>

                <!-- Mensagens privadas -->
                <template v-if="activeTab === 'private' && currentConversation">
                  <div v-for="message in privateMessages" :key="message.id" class="flex flex-col">
                    <div :class="message.sender.id === user.id ? msgSent : msgRecv"
                         class="max-w-xs md:max-w-sm lg:max-w-md rounded-lg shadow px-4 py-2">
                      <div class="flex items-center space-x-2 mb-1">
                        <span class="text-xs font-semibold">{{ message.sender.name }}</span>
                        <span class="text-[10px] font-bold">
                          {{ formatDate(message.created_at) }} - {{ formatTime(message.created_at)
                          }}
                        </span>
                        <span v-if="message.is_edited"
                              class="text-[10px] text-gray-400">(editada)</span>
                      </div>
                      <p class="text-sm break-words">{{ message.content }}</p>
                    </div>
                  </div>
                </template>
              </div>

              <div class="border-t p-4 bg-white" v-if="canSendMessages">
                <form @submit.prevent="sendMessage" class="flex space-x-2">
                  <div class="flex-1 relative">
                    <input ref="messageInput" v-model="newMessage" @input="handleInput"
                           @keydown.enter.prevent="sendMessage" @keydown="handleKeydown"
                           :placeholder="getPlaceholderText"
                           class="w-full text-black px-3 py-4 border rounded-md focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                           :disabled="isSending || (activeTab === 'private' && !currentConversation)" />
                  </div>
                  <button type="submit"
                          :disabled="!newMessage.trim() || isSending || (activeTab === 'private' && !currentConversation)"
                          class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50">
                    {{ isSending ? 'Enviando...' : 'Enviar' }}
                  </button>
                </form>
              </div>
              <div v-else class="border-t p-4 bg-gray-100 text-center text-gray-500 text-sm">
                Você não tem permissão para enviar mensagens nesta sala.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-else class="flex items-center justify-center h-96">
    </div>

  </ChatLayout>
</template>
