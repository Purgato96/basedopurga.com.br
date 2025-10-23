<script setup lang="ts">
import { onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '@/lib/axios'; // Certifique-se que o caminho está correto

const route = useRoute();
const router = useRouter();

onMounted(async () => {
  const email = route.query.email as string;
  const account_id = route.query.account_id as string;
  console.log("ChatLogin: Iniciando com", { email, account_id }); // LOG 1

  // Validação inicial
  // Adicionada verificação para {{user_email}} também, por via das dúvidas
  if (!email || !account_id || email === '{{Email}}' || email === '{{user_email}}' || account_id === '{{account_id}}') {
    console.error('ChatLogin: Parâmetros de query inválidos ou não substituídos.', route.query); // LOG Erro Params
    alert('Parâmetros inválidos de auto-login. Verifique a configuração no Interacti.');
    return router.replace('/login'); // Ou uma página de erro
  }

  try {
    console.log("ChatLogin: Chamando API /auth/auto-login..."); // LOG 2
    const response = await api.post('/auth/auto-login', { email, account_id });
    const data = response.data;
    const status = response.status;
    // LOG 3: Mostra a resposta completa da API
    console.log("ChatLogin: Resposta da API recebida", { status, data: JSON.parse(JSON.stringify(data)) }); // Stringify/Parse para ver objeto real

    // Verifica token
    console.log("ChatLogin: Verificando se data.token existe..."); // LOG 4
    if (!data?.token) {
      console.error("ChatLogin: ERRO - Token ausente na resposta!", data); // LOG Erro Token
      throw new Error('Token ausente na resposta da API');
    }
    console.log("ChatLogin: Token encontrado."); // LOG 5

    // Salva token
    console.log("ChatLogin: Salvando token no localStorage..."); // LOG 6
    localStorage.setItem('chat_token', data.token);
    console.log("ChatLogin: Token salvo."); // LOG 7

    // Verifica e salva usuário
    console.log("ChatLogin: Verificando se data.data.user existe..."); // LOG 8
    if (data?.data?.user) {
      console.log("ChatLogin: Salvando usuário no localStorage...", data.data.user); // LOG 9
      localStorage.setItem('user', JSON.stringify(data.data.user));
      console.log("ChatLogin: Usuário salvo."); // LOG 10
    } else {
      console.warn("ChatLogin: Aviso - Objeto 'user' não encontrado em data.data.", data?.data); // LOG Aviso User
      localStorage.removeItem('user'); // Limpa user antigo
    }

    // Verifica redirect_to
    console.log("ChatLogin: Verificando se data.data.redirect_to existe..."); // LOG 11
    const go = data?.data?.redirect_to || '/chat';
    console.log("ChatLogin: Redirecionando para:", go); // LOG 12

    // Redireciona
    router.replace(go);
    console.log("ChatLogin: router.replace chamado."); // LOG 13

  } catch (e: any) { // Tipagem 'any' para acessar propriedades
    // Log detalhado do erro que caiu no catch
    console.error('ChatLogin: ERRO DETALHADO no bloco catch:', {
      message: e.message,
      name: e.name,
      code: e.code,
      config: e.config, // Detalhes da requisição Axios
      responseStatus: e.response?.status, // Status HTTP se for erro Axios
      responseData: e.response?.data, // Corpo da resposta se for erro Axios
      stack: e.stack // Stack trace do erro
    }); // LOG Erro Catch Detalhado

    console.error('Auto-login falhou', e); // Log original
    alert('Não foi possível realizar o auto-login. Verifique o console.');
    router.replace('/login');
  }
});
</script>

<template>
  <div class="p-8 text-center text-gray-700">Conectando ao chat...</div>
</template>
