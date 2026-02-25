// API Client for work management system
import { Employee } from '@/types';

export class TokenManager {
  private static readonly TOKEN_KEY = 'auth_token';
  private static readonly REFRESH_TOKEN_KEY = 'refresh_token';

  static getToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(this.TOKEN_KEY);
  }

  static setToken(token: string): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(this.TOKEN_KEY, token);
  }

  static getRefreshToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(this.REFRESH_TOKEN_KEY);
  }

  static setRefreshToken(token: string): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(this.REFRESH_TOKEN_KEY, token);
  }

  static removeTokens(): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.REFRESH_TOKEN_KEY);
  }

  // 하위 호환성을 위한 별칭
  static removeToken(): void {
    this.removeTokens();
  }

  static isTokenValid(token: string): boolean {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.exp * 1000 > Date.now();
    } catch {
      return false;
    }
  }

  /**
   * API 응답에서 새 토큰을 확인하고 자동 업데이트
   */
  static checkAndUpdateToken(response: Response): void {
    const newToken = response.headers.get('X-New-Token');
    const isRefreshed = response.headers.get('X-Token-Refreshed');

    if (newToken && isRefreshed === 'true') {
      console.log('🔄 [TOKEN] 서버에서 새 토큰 받음, 자동 업데이트');
      this.setToken(newToken);
    }
  }

  /**
   * fetch 요청 시 토큰 자동 갱신 체크
   */
  static async fetchWithTokenRefresh(url: string, options: RequestInit = {}): Promise<Response> {
    const token = this.getToken();
    if (!token) {
      throw new Error('인증 토큰이 없습니다');
    }

    // Authorization 헤더 추가
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers,
    };

    const response = await fetch(url, {
      ...options,
      headers,
    });

    // 응답에서 새 토큰 체크 및 업데이트
    this.checkAndUpdateToken(response);

    return response;
  }
}

class ApiClient {
  private baseURL: string;

  constructor() {
    this.baseURL = typeof window !== 'undefined'
      ? window.location.origin
      : process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const token = TokenManager.getToken();

    const config: RequestInit = {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
        ...options.headers,
      },
    };

    const response = await fetch(`${this.baseURL}/api${endpoint}`, config);

    if (response.status === 401) {
      // /api/auth/verify의 401은 정상적인 응답 (토큰 없거나 만료) - 토큰 삭제 안 함
      // 다른 보호된 API의 401만 토큰 삭제 및 리다이렉트 처리
      const isVerifyEndpoint = endpoint === '/auth/verify';
      if (!isVerifyEndpoint) {
        TokenManager.removeTokens();
        if (typeof window !== 'undefined') {
          const isLoginPage = window.location.pathname === '/login';
          if (!isLoginPage) {
            window.location.href = '/login';
          }
        }
      }
      throw new Error('Unauthorized');
    }

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response.json();
  }

  // GET request
  async get<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'GET' });
  }

  // POST request
  async post<T>(endpoint: string, data?: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // PUT request
  async put<T>(endpoint: string, data?: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  // DELETE request
  async delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }
}

const apiClient = new ApiClient();

// Authentication API
export const authAPI = {
  login: async (email: string, password: string) => {
    return apiClient.post('/auth/login', { email, password });
  },

  logout: async () => {
    return apiClient.post('/auth/logout');
  },

  verify: async () => {
    return apiClient.post('/auth/verify');
  },

  socialLogin: async (token: string, userData: any, isNewUser: boolean) => {
    return apiClient.post('/auth/social/login', { token, userData, isNewUser });
  },
};

// Work Task API
export const workTaskAPI = {
  getTasks: async (params?: any) => {
    const queryString = params ? `?${new URLSearchParams(params).toString()}` : '';
    return apiClient.get(`/tasks${queryString}`);
  },

  getTask: async (id: string) => {
    return apiClient.get(`/tasks/${id}`);
  },

  createTask: async (data: any) => {
    return apiClient.post('/tasks', data);
  },

  updateTask: async (id: string, data: any) => {
    return apiClient.put(`/tasks/${id}`, data);
  },

  deleteTask: async (id: string) => {
    return apiClient.delete(`/tasks/${id}`);
  },

  getMetadata: async () => {
    return apiClient.get('/tasks/metadata');
  },
};

// Employee API
export const employeeAPI = {
  getEmployees: async () => {
    return apiClient.get('/employees');
  },

  getEmployee: async (id: string) => {
    return apiClient.get(`/employees/${id}`);
  },

  createEmployee: async (data: any) => {
    return apiClient.post('/employees', data);
  },

  updateEmployee: async (id: string, data: any) => {
    return apiClient.put(`/employees/${id}`, data);
  },

  deleteEmployee: async (id: string) => {
    return apiClient.delete(`/employees/${id}`);
  },
};

export default apiClient;