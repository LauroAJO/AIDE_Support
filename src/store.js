import { create } from 'zustand';

export const useStore = create((set) => ({
  user: null,
  isLoading: true,
  currentView: 'tasks',

  // v1.10 — multi-user permission + admin + chat state
  userPermissions: {},   // resolved permission map (mirrors user.permissions)
  // v2.1 — granular: null for owner, or `{ "feature.action": boolean }` map.
  userGranular: null,
  allUsers: [],          // owner-only: hydrated list from /api/users/all
  pendingUsers: [],      // owner-only: users with status='pending'
  chatMessages: [],      // most recent chat_messages from /api/chat/messages
  chatUnread: 0,         // count of messages newer than last_read_at

  // Phase 1 — tasks
  tasks: [],
  projects: [],
  users: [],
  selectedTask: null,
  taskFilter: { status: 'all', search: '', assignedTo: 'all' },
  kanbanView: false,

  // Phase 2 — timer & planning
  activeEntry: null,
  elapsedSeconds: 0,
  timeEntries: [],
  weekPlan: null,
  availability: null,
  // "Ainda está nessa tarefa?" check popup. Toggled by TimerCheckMonitor when
  // the active entry crosses a 30-min boundary.
  timerCheckPopup: false,

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

  // Phase 2 — alerts, payment, reports, personal data
  alertRules: [],
  paymentSummary: null,
  monthlyReport: null,
  personalData: null,

  // v1.6 — Hierarchy (Áreas > Projetos > Frentes) + Networking
  areas: [],
  fronts: [],
  networkPeople: [],
  networkInstitutions: [],
  networkConnections: [],
  bridgeSyncStatus: null,

  // v1.8 — Tasks tree view (Lista | Kanban | Árvore)
  taskView: 'list', // 'list' | 'kanban' | 'tree'
  treeCollapse: {},
  taskTreeFilter: { areaId: null, projectId: null, frontId: null },

  // v1.9.8 — Disponibilidade recorrente + horário planejado por semana
  weeklyAvailability: [],   // [{ id, day_of_week, start_time, end_time, active }]
  dailySchedule: [],        // [{ id, work_date, start_time, end_time, notes }]
  allUsersSchedule: {},     // { [userId]: { name, role, scheduled, recurring } }

  // Setting user also mirrors its embedded permissions + granular into the
  // top-level slices so components can read either field. Callers that already
  // pass these objects inside `user` get them propagated for free.
  setUser: (user) => set({
    user,
    userPermissions: (user && user.permissions) || {},
    userGranular: user ? (user.granular === undefined ? null : user.granular) : null,
  }),
  setLoading: (isLoading) => set({ isLoading }),
  setView: (currentView) => set({ currentView }),

  setUserPermissions: (userPermissions) => set({ userPermissions: userPermissions || {} }),
  setUserGranular: (userGranular) => set({ userGranular: userGranular === undefined ? null : userGranular }),
  setAllUsers: (allUsers) => set({ allUsers: allUsers || [] }),
  setPendingUsers: (pendingUsers) => set({ pendingUsers: pendingUsers || [] }),
  setChatMessages: (chatMessages) => set({ chatMessages: chatMessages || [] }),
  setChatUnread: (chatUnread) => set({ chatUnread: Number(chatUnread) || 0 }),

  setTasks: (tasks) => set({ tasks }),
  setProjects: (projects) => set({ projects }),
  setUsers: (users) => set({ users }),
  setSelectedTask: (selectedTask) => set({ selectedTask }),
  setTaskFilter: (patch) =>
    set((state) => ({ taskFilter: { ...state.taskFilter, ...patch } })),
  setKanbanView: (kanbanView) => set({ kanbanView }),

  setActiveEntry: (activeEntry) => set({ activeEntry }),
  setElapsedSeconds: (elapsedSeconds) => set({ elapsedSeconds }),
  setTimerCheckPopup: (timerCheckPopup) => set({ timerCheckPopup }),
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

  setAlertRules: (alertRules) => set({ alertRules }),
  setPaymentSummary: (paymentSummary) => set({ paymentSummary }),
  setMonthlyReport: (monthlyReport) => set({ monthlyReport }),
  setPersonalData: (personalData) => set({ personalData }),

  setAreas: (areas) => set({ areas }),
  setFronts: (fronts) => set({ fronts }),
  setNetworkPeople: (networkPeople) => set({ networkPeople }),
  setNetworkInstitutions: (networkInstitutions) => set({ networkInstitutions }),
  setNetworkConnections: (networkConnections) => set({ networkConnections }),
  setBridgeSyncStatus: (bridgeSyncStatus) => set({ bridgeSyncStatus }),

  setTaskView: (taskView) => set({ taskView }),
  setTreeCollapse: (treeCollapse) => set({ treeCollapse }),
  setTaskTreeFilter: (patch) =>
    set((state) => ({ taskTreeFilter: { ...state.taskTreeFilter, ...patch } })),
  clearTaskTreeFilter: () =>
    set({ taskTreeFilter: { areaId: null, projectId: null, frontId: null } }),

  setWeeklyAvailability: (weeklyAvailability) => set({ weeklyAvailability }),
  setDailySchedule: (dailySchedule) => set({ dailySchedule }),
  setAllUsersSchedule: (allUsersSchedule) => set({ allUsersSchedule }),
}));

// Derived: tasks filtered by the current taskFilter.
// assignedTo: 'all' | 'me' (current user) | 'other' (the other user).
export const selectFilteredTasks = (state) => {
  const { tasks, taskFilter, user } = state;
  const q = taskFilter.search.trim().toLowerCase();
  return tasks.filter((t) => {
    if (taskFilter.status === 'favorites') {
      if (!t.favorited) return false;
      // Mesmo entre favoritas, concluídas ficam arquivadas (não poluem).
      if (t.status === 'done') return false;
    } else if (taskFilter.status === 'all') {
      // "Todas" arquiva (esconde) tarefas concluídas. Para vê-las,
      // o usuário clica explicitamente em "Concluídas".
      if (t.status === 'done') return false;
    } else if (t.status !== taskFilter.status) {
      return false;
    }
    if (q && !t.title.toLowerCase().includes(q)) return false;
    if (taskFilter.assignedTo === 'me' && t.assigned_to !== user?.id) return false;
    if (taskFilter.assignedTo === 'other' && (!t.assigned_to || t.assigned_to === user?.id)) {
      return false;
    }
    return true;
  });
};
