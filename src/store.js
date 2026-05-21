import { create } from 'zustand';

export const useStore = create((set) => ({
  user: null,
  isLoading: true,
  currentView: 'tasks',
  setUser: (user) => set({ user }),
  setLoading: (isLoading) => set({ isLoading }),
  setView: (currentView) => set({ currentView }),
}));
