export const getToken = () => localStorage.getItem('aide_token');
export const setToken = (t) => localStorage.setItem('aide_token', t);
export const clearToken = () => localStorage.removeItem('aide_token');
export const authHeaders = () => ({
  Authorization: `Bearer ${getToken()}`
});
