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

  // Phase 3 — calendar & drive
  calendarEvents: [],
  calendarView: 'month',
  calendarDate: new Date().toISOString(),
  driveFiles: [],
  driveFavorites: [],
  driveParent: null,
  driveSearch: '',

  // Phase A+B — notes, notifications, month planning
  notes: [],
  selectedNote: null,
  notifications: [],
  unreadCount: 0,
  monthPlan: null,

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

  setCalendarEvents: (calendarEvents) => set({ calendarEvents }),
  setCalendarView: (calendarView) => set({ calendarView }),
  setCalendarDate: (calendarDate) => set({ calendarDate }),
  setDriveFiles: (driveFiles) => set({ driveFiles }),
  setDriveFavorites: (driveFavorites) => set({ driveFavorites }),
  setDriveParent: (driveParent) => set({ driveParent }),
  setDriveSearch: (driveSearch) => set({ driveSearch }),

  setNotes: (notes) => set({ notes }),
  setSelectedNote: (selectedNote) => set({ selectedNote }),
  setNotifications: (notifications) => set({ notifications }),
  setUnreadCount: (unreadCount) => set({ unreadCount }),
  setMonthPlan: (monthPlan) => set({ monthPlan }),
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
