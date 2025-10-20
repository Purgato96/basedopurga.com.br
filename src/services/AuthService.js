import api from '../lib/axios.js';

export class AuthService {
  async login(credentials) {
    try {
      const {data} = await api.post('/auth/login', credentials);
      localStorage.setItem('chat_token', data.access_token);
      localStorage.setItem('user', JSON.stringify(data.user));
      return data;
    } catch (error) {
      throw error;
    }
  }

  async register(payload) {
    const {data} = await api.post('/auth/register', payload);
    // Se a API já retorna token e user:
    if (data?.access_token) {
      localStorage.setItem('chat_token', data.access_token);
    }
    if (data?.user) {
      localStorage.setItem('user', JSON.stringify(data.user));
    }
    return data;
  }

  async me() {
    try {
      const response = await api.get('/auth/me');
      return response.data;
    } catch (error) {
      // Se falha, remove dados e redireciona
      if (error.response?.status === 401) {
        this.logout();
      }
      throw error;
    }
  }

  async refresh() {
    try {
      const response = await api.post('/auth/refresh');
      const newToken = response.data.access_token;
      localStorage.setItem('chat_token', newToken);
      return response.data;
    } catch (error) {
      this.logout();
      throw error;
    }
  }

  logout() {
    localStorage.removeItem('chat_token');
    localStorage.removeItem('user');
    // Redirecionar para login se necessário
    window.location.href = '/login';
  }

  getToken() {
    return localStorage.getItem('chat_token');
  }

  isAuthenticated() {
    console.log("--- Verificando autenticação (isAuthenticated) ---"); // LOG 1

    const token = this.getToken();
    if (!token) {
      console.log("Resultado: Falso (sem token)"); // LOG 2
      return false;
    }
    console.log("Token encontrado:", token); // LOG 3

    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      console.log("Payload do token decodificado:", payload); // LOG 4

      // Verifica se a propriedade 'exp' existe
      if (typeof payload.exp === 'undefined') {
        console.log("Verificação 'exp': Não existe. Considerado válido (infinito)."); // LOG 5
        console.log("Resultado: Verdadeiro"); // LOG 6
        return true;
      }

      // Se 'exp' existe, compara as datas
      const expiraEm = payload.exp * 1000;
      const agora = Date.now();
      const aindaValido = expiraEm > agora;

      console.log("Verificação 'exp': Existe."); // LOG 7
      console.log("Expira em (ms):", expiraEm, `(${new Date(expiraEm).toLocaleString()})`); // LOG 8
      console.log("Agora (ms):    ", agora, `(${new Date(agora).toLocaleString()})`); // LOG 9
      console.log("Ainda é válido?", aindaValido); // LOG 10
      console.log("Resultado:", aindaValido ? "Verdadeiro" : "Falso"); // LOG 11

      return aindaValido;

    } catch (e) {
      console.error("Erro CRÍTICO ao decodificar token JWT:", e); // LOG 12
      console.log("Resultado: Falso (erro na decodificação)"); // LOG 13
      return false;
    }
  }
}

export const authService = new AuthService();
