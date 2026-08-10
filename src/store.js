import { create } from 'zustand';
import { taskAssigneeIds } from './lib/tasks';

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
  // v2.26.1 — filtro de tarefas redesenhado (dropdowns compactos). assignedTo
  // passou de 'all'|'me'|'other' (binário, só suportava 2 pessoas) para
  // 'all'|'unassigned'|<userId> — com 3+ utilizadores (Lauro/Alice/Milene),
  // 'other' colapsava todo mundo que não era "eu" num único balde, então
  // filtrar por Alice também mostrava tarefas da Milene (e vice-versa), e não
  // havia opção nenhuma para escolher a Milene especificamente.
  taskFilter: {
    status: 'all', search: '', assignedTo: 'all',
    tags: [], onlyFavorited: false, onlyRecurring: false, onlyCareer: false,
    dateFilter: 'all', // 'all' | 'withDate' | 'withoutDate'
    minUrgency: 0, minImportance: 0,
  },
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
  // Meeting notes — data ativa (YYYY-MM-DD) da navegação por dia na Reunião.
  meetingDate: (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })(),

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
  dexLastSync: null,     // ISO string da última sincronização DEX bem-sucedida
  dexSyncResult: null,   // { total, inserted, updated, skipped } do último /api/dex/sync

  // Mercado (Etapa 4) — organizações, projetos, contatos profissionais
  marketOrgs: [],
  marketProjects: [],
  marketContacts: [],

  // Carreira (Etapa 5) — oportunidades, documentos, metas
  careerOpportunities: [],
  careerDocuments: [],
  careerGoals: [],

  // Eventos & Venues (v2.5.0) — conferências, networking e venues de publicação
  careerEvents: [],
  publicationVenues: [],
  eventsFilter: {
    type: 'all', area: 'all', phase: 'all',
    peerReview: false, upcoming: false, search: '',
  },

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
  setMeetingDate: (meetingDate) => set({ meetingDate }),

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
  setDexLastSync: (dexLastSync) => set({ dexLastSync }),
  setDexSyncResult: (dexSyncResult) => set({ dexSyncResult }),

  setMarketOrgs: (marketOrgs) => set({ marketOrgs: marketOrgs || [] }),
  setMarketProjects: (marketProjects) => set({ marketProjects: marketProjects || [] }),
  setMarketContacts: (marketContacts) => set({ marketContacts: marketContacts || [] }),

  setCareerOpportunities: (careerOpportunities) => set({ careerOpportunities: careerOpportunities || [] }),
  setCareerDocuments: (careerDocuments) => set({ careerDocuments: careerDocuments || [] }),
  setCareerGoals: (careerGoals) => set({ careerGoals: careerGoals || [] }),

  setCareerEvents: (careerEvents) => set({ careerEvents: careerEvents || [] }),
  setPublicationVenues: (publicationVenues) => set({ publicationVenues: publicationVenues || [] }),
  setEventsFilter: (patch) =>
    set((state) => ({ eventsFilter: { ...state.eventsFilter, ...patch } })),

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
// assignedTo: 'all' | 'unassigned' | <userId> (v2.26.1 — era 'all'|'me'|'other';
// ver comentário no default de taskFilter acima para o porquê da mudança).
export const selectFilteredTasks = (state) => {
  const { tasks, taskFilter } = state;
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
    // v2.25.19 — considera TODOS os responsáveis (principal + co-responsáveis
    // da junction task_assignees), não só assigned_to. Sem isso, uma tarefa em
    // que sou co-responsável some do filtro "Eu" mesmo sendo minha.
    const ids = taskAssigneeIds(t);
    if (taskFilter.assignedTo === 'unassigned') {
      if (ids.length) return false;
    } else if (taskFilter.assignedTo && taskFilter.assignedTo !== 'all') {
      // Um id de utilizador específico — filtro direto por pertencer à lista
      // de responsáveis dessa tarefa (não mais um balde binário "eu"/"outro").
      if (!ids.includes(taskFilter.assignedTo)) return false;
    }
    if (taskFilter.tags && taskFilter.tags.length) {
      const taskTags = t.tags || [];
      if (!taskFilter.tags.some((tag) => taskTags.includes(tag))) return false;
    }
    if (taskFilter.onlyFavorited && !t.favorited) return false;
    if (taskFilter.onlyRecurring && !t.is_recurring) return false;
    if (taskFilter.onlyCareer && !t.opportunity_id) return false;
    if (taskFilter.dateFilter === 'withDate' && !(t.due_date || t.delivery_date)) return false;
    if (taskFilter.dateFilter === 'withoutDate' && (t.due_date || t.delivery_date)) return false;
    if (taskFilter.minUrgency && Number(t.urgency || 0) < taskFilter.minUrgency) return false;
    if (taskFilter.minImportance && Number(t.importance || 0) < taskFilter.minImportance) return false;
    return true;
  });
};

// v2.26.1 — lista única de tags em uso nas tarefas carregadas, para popular o
// dropdown "Tags" do filtro sem precisar de um endpoint dedicado.
export const selectAllTaskTags = (state) => {
  const set = new Set();
  for (const t of state.tasks) {
    for (const tag of t.tags || []) set.add(tag);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
};
