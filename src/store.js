import { create } from 'zustand';

export const useStore = create((set) => ({
  user: null,
  isLoading: true,
  currentView: 'tasks',

  // Phase 1 — tasks
  tasks: [],
  projects: [],
  users: [],
  selectedTask: null,
  taskFilter: { status: 'all', search: '', assignedTo: 'all' },

  // Phase 2 — timer & planning
  activeEntry: null,
  elapsedSeconds: 0,
  timeEntries: [],
  weekPlan: null,
  availability: null,

  setUser: (user) => set({ user }),
  setLoading: (isLoading) => set({ isLoading }),
  setView: (currentView) => set({ currentView }),

  setTasks: (tasks) => set({ tasks }),
  setProjects: (projects) => set({ projects }),
  setUsers: (users) => set({ users }),
  setSelectedTask: (selectedTask) => set({ selectedTask }),
  setTaskFilter: (patch) =>
    set((state) => ({ taskFilter: { ...state.taskFilter, ...patch } })),

  setActiveEntry: (activeEntry) => set({ activeEntry }),
  setElapsedSeconds: (elapsedSeconds) => set({ elapsedSeconds }),
  setTimeEntries: (timeEntries) => set({ timeEntries }),
  setWeekPlan: (weekPlan) => set({ weekPlan }),
  setAvailability: (availability) => set({ availability }),
}));

// Derived: tasks filtered by the current taskFilter.
// assignedTo: 'all' | 'me' (current user) | 'other' (the other user).
export const selectFilteredTasks = (state) => {
  const { tasks, taskFilter, user } = state;
  const q = taskFilter.search.trim().toLowerCase();
  return tasks.filter((t) => {
    if (taskFilter.status !== 'all' && t.status !== taskFilter.status) return false;
    if (q && !t.title.toLowerCase().includes(q)) return false;
    if (taskFilter.assignedTo === 'me' && t.assigned_to !== user?.id) return false;
    if (taskFilter.assignedTo === 'other' && (!t.assigned_to || t.assigned_to === user?.id)) {
      return false;
    }
    return true;
  });
};
