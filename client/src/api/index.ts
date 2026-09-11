import axios from 'axios';

export const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('adas_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && window.location.hash !== '#/login') {
      localStorage.removeItem('adas_token');
      localStorage.removeItem('adas_user');
      window.location.hash = '#/login';
    }
    return Promise.reject(err);
  }
);

export function errMsg(e: any): string {
  return e?.response?.data?.error || e?.message || '请求失败';
}
