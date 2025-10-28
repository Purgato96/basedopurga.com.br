<script setup lang="ts">
import { onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api from '@/lib/axios' // Certifique-se que o caminho está correto

const route = useRoute()
const router = useRouter()

onMounted(async () => {
  const email = route.query.email as string
  const account_id = route.query.account_id as string
  console.log('ChatLogin: Iniciando com', { email, account_id })

  // Validação inicial
  if (!email || !account_id || email === '{{Email}}' || email === '{{user_email}}' || account_id === '{{account_id}}') {
    console.error('ChatLogin: Parâmetros de query inválidos.', route.query)
    alert('Parâmetros inválidos de auto-login.')
    return router.replace('/login')
  }

  try {
    console.log('ChatLogin: Chamando API /auth/auto-login...')
    const response = await api.post('/auth/auto-login', { email, account_id })
    const data = response.data
    const status = response.status
    console.log('ChatLogin: Resposta da API recebida', {
      status,
      data: JSON.parse(JSON.stringify(data))
    })

    // Verifica token E slug da sala na resposta
    if (!data?.token || !data?.data?.room?.slug) {
      console.error('ChatLogin: ERRO - Token ou Slug da Sala ausente na resposta!', data)
      throw new Error('Token ou dados da sala ausentes na resposta da API')
    }
    console.log('ChatLogin: Token e Slug encontrados.')

    // Salva token e usuário
    localStorage.setItem('chat_token', data.token)
    if (data?.data?.user) {
      localStorage.setItem('user', JSON.stringify(data.data.user))
      console.log('ChatLogin: Usuário salvo:', data.data.user)
    } else {
      localStorage.removeItem('user')
      console.warn('ChatLogin: Aviso - Objeto \'user\' não encontrado em data.data.')
    }

    // --- CORREÇÃO DO REDIRECIONAMENTO ---
    const roomSlug = data.data.room.slug // Pega o slug da resposta
    const redirectTo = `/chat/room/${roomSlug}` // Monta a URL da sala
    console.log('ChatLogin: Redirecionando DIRETAMENTE para:', redirectTo)
    router.replace(redirectTo) // Redireciona para a sala específica
    // --- FIM DA CORREÇÃO ---
    console.log('ChatLogin: router.replace chamado.')

  } catch (e: any) {
    console.error('ChatLogin: ERRO DETALHADO no bloco catch:', { /* ... log detalhado ... */ })
    console.error('Auto-login falhou', e)
    alert('Não foi possível realizar o auto-login. Verifique o console.')
    router.replace('/login')
  }
})
</script>

<template>
  <div class="p-8 text-center text-gray-700">Conectando ao chat...</div>
</template>
