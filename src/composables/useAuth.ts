import {ref, computed} from 'vue';
import {authService as AuthService} from '@/services/AuthService';

const user = ref(null);
const token = ref(null);
const isLoading = ref(false);

export function useAuth() {
  const isAuthenticated = computed(() => AuthService.isAuthenticated());

  const loadUser = async () => {
    if (!AuthService.isAuthenticated()) {
      user.value = null;
      return;
    }
    isLoading.value = true;
    try {
      const userData = await AuthService.me();
      user.value = userData;
    } catch (error) {
      console.error('Erro ao carregar usuário:', error);
      user.value = null;
    } finally {
      isLoading.value = false;
    }
  };

  const login = async (credentials) => {
    isLoading.value = true;
    try {
      const data = await AuthService.login(credentials);
      token.value = data.access_token ?? null;
      // busca perfil para popular user
      try {
        const me = await AuthService.me();
        user.value = me;
      } catch {
        user.value = null;
      }
      return data;
    } finally {
      isLoading.value = false;
    }
  };


  const register = async (payload) => {
    isLoading.value = true;
    try {
      const data = await AuthService.register(payload);
      if (data?.user) user.value = data.user;
      if (data?.access_token) token.value = data.access_token;
      return data;
    } finally {
      isLoading.value = false;
    }
  };

  const logout = () => {
    AuthService.logout();
    user.value = null;
    token.value = null;
  };

  /*function can(permissionName: string) {
    if (!user.value || !(user.value as any).permissions) {
      return false;
    }
    return (user.value as any).permissions.includes(permissionName);
  }*/
  // Em src/composables/useAuth.ts

  function can(permissionName: string) {
    console.log(`can(): Verificando permissão '${permissionName}'...`); // LOG A
    if (!user.value) {
      console.log(`can(): Retornando false (user.value é null/undefined)`); // LOG B
      return false;
    }
    // Adicione um log para ver o objeto user completo AQUI
    console.log(`can(): Objeto user.value atual:`, JSON.parse(JSON.stringify(user.value))); // LOG C (stringify/parse para evitar problemas com proxy do Vue)

    const permissions = (user.value as any).permissions;
    if (!permissions || !Array.isArray(permissions)) {
      console.log(`can(): Retornando false (user.value.permissions não existe ou não é um array)`, permissions); // LOG D
      return false;
    }

    const hasPermission = permissions.includes(permissionName);
    console.log(`can(): Permissão '${permissionName}' ${hasPermission ? 'ENCONTRADA' : 'NÃO ENCONTRADA'} na lista.`); // LOG E
    return hasPermission;
  }

  return {
    user: computed(() => user.value),
    token: computed(() => token.value),
    isAuthenticated,
    isLoading: computed(() => isLoading.value),
    loadUser,
    login,
    register,
    logout,
    can,
  };
}
