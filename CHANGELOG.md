# AIDE — Changelog

Formato: ARCO.MAJOR.MINOR.PATCH

- PATCH — fix dentro de feature existente
- MINOR — feature completa, verificada pelo utilizador
- MAJOR — fim de sessão de desenvolvimento
- ARCO — mudança de paradigma

---

## [II.1.4.0] — 2026-08-14

### Painel de debug (🐛): log de API + changelog dentro do app

Padrão portado do Birdie Bear Entertainment (BBE), onde foi criado pra diagnosticar problemas no PWA instalado sem precisar abrir o DevTools do navegador (nem sempre há um computador por perto). O AIDE já tinha as duas peças de base prontas — `apiFetch` centralizado (`src/lib/api.js`) e `version.js` — faltava só o log e o painel.

- `src/lib/api.js`: `apiFetch` agora grava cada chamada (método, URL, status, duração, erro) num array em memória limitado a 50 entradas, com `getApiLog`/`subscribeApiLog`/`clearApiLog`. Comportamento de sucesso/erro de `apiFetch` para quem já chama a função não muda — é só instrumentação adicional.
- `src/changelog.js` (novo): versão compacta do `CHANGELOG.md`, mantida em paralelo manualmente — só os destaques, pensada pra leitura rápida dentro do app.
- `src/components/DebugPanel.jsx` (novo): botão 🐛 fixo (canto inferior esquerdo), bottom-sheet com abas "API log" (lista as chamadas, com botão "Copiar tudo" e "Limpar") e "Changelog" (lê `src/changelog.js`).
- `App.jsx`: `<DebugPanel />` montado em todos os estados de renderização (loading, pending, login, app autenticado) — fica disponível mesmo se o login falhar.

### Desvios do spec do BBE (com justificativa):

- Estilo: BBE usa estilos inline + CSS custom properties; AIDE usa Tailwind — a estrutura JSX é a mesma, só o styling foi adaptado (classes `bg-base`/`text-ink`/`text-muted` já usadas no resto do app).
- `changelog.js` do AIDE começa a partir de II.1.0.0 (início do Arco II) e inclui só os últimos ~6 marcos, não o histórico 2.26.x completo — o objetivo é leitura rápida, não substituir o `CHANGELOG.md`.

## [II.1.3.1] — 2026-08-13

### Pagamentos: coluna de horário virou intervalo início–fim

Feedback direto na tela: a tabela já agrupa as entradas por data (cabeçalho de grupo por dia), então repetir a data inteira em cada linha era redundante — e a coluna só mostrava o início, nunca o fim.

- `PaymentPage.jsx`: coluna "Início–Fim" (nome novo, era "Data/Hora") mostra só `HH:MM–HH:MM` por linha; entrada ainda aberta mostra "em andamento" em vez do horário de fim.
- A seção expansível "Detalhes da reunião" (toggle nas entradas de reunião) continua mostrando data completa — ali faz sentido, é um resumo isolado, não repetido por linha.

## [II.1.3.0] — 2026-08-13

### Notificações: redesign completo, Task↔Carreira via backend, presença em reunião enriquecida

**Nota:** a entrega anterior (II.1.2.0, Bloco Task↔Carreira/Reunião/Pagamentos) ainda não tinha sido implantada quando este pedido chegou — os dois conjuntos de mudanças estão nesta mesma versão.

**Notificações (Bloco A):**
- Clique numa notificação navega para o item exato: `/tasks?task=<id>`, `/notes?note=<id>`, ou uma rota própria por tipo (`/career`, `/bridge/staging`, `/gmail`, `/networking`, `/events`, `/meeting`) — antes só abria a lista genérica (`/tasks` ou `/notes`), sem abrir o item.
- `task_assigned` mostra o título da tarefa como texto principal (antes era sempre "Fulano atribuiu uma tarefa a você", idêntico em toda notificação — o título real ficava escondido no corpo).
- Ícone dedicado por tipo (11 tipos que caíam no sino genérico antes).
- Painel redesenhado: agrupado por data (Hoje/Ontem/Últimos 7 dias/Mais antigas), mais largo (w-96), `max-h-[80vh]` sem cortar conteúdo, "Marcar todas como lidas" numa faixa própria sempre visível.
- `markRead`/`markAllRead`/`remove` voltam a sincronizar com o servidor via `load()` em vez de só decrementar o contador local.
- Erro ao carregar mostra mensagem + botão "Tentar de novo", não mais uma lista vazia silenciosa.
- Push notification abre o item certo (`data.link`), não mais sempre `/`.
- Backend: `entity_type`/`entity_id`/`link` adicionados às notificações (migração `0060_notification_link.sql`); `GET /api/notifications` sobe para limite 100 e aceita `?since=`.

**Task↔Carreira (Bloco B) — agora via JOIN no backend:**
- `TASK_SELECT` ganhou `LEFT JOIN career_opportunities`; `TaskCard`/`TaskModal` usam `task.opportunityTitle`/`opportunityStatus` direto da API, com fallback no store só para tarefas otimistas locais.

**Reunião (Bloco C) — presença enriquecida:**
- `GET /api/meeting/status` agora devolve participantes ativos E recém-saídos (`is_active`, `duration_seconds`), permitindo a MeetingPage mostrar "Em reunião agora" e "Já saíram" separadamente, com duração de cada um.
- Rota de histórico renomeada para `GET /api/meeting/attendance`; coluna `meeting_attendance_log.at` renomeada para `timestamp`.
- `handleMeetingStart`/`handleMeetingStop` ganharam campos extras na resposta (`is_owner`, `message`, `duration_seconds`) para clientes futuros.

### Desvios do spec (com justificativa):

- Migração de notificações nomeada `0060_notification_link.sql`, não `0058` — 0057, 0058 e 0059 já usados nesta sessão.
- `logMeetingAttendance` grava o log de presença mesmo SEM `session_id` (o spec propunha `if (!sessionId) return;`) — do contrário, todo mundo que entra antes do Lauro (o caso central da Regra 1/2) simplesmente não apareceria no histórico, violando a própria Regra 4 ("every join/leave recorded").
- `GET /api/meeting/attendance` mantém escopo amplo (últimas N entradas via `?limit=`) em vez de restringir à sessão mais recente — o escopo do spec omitiria linhas sem sessão e sessões anteriores à mais recente.
- `co.hub_type` (pedido no Fix B1) não existe em `career_opportunities` — a coluna real é `extract_knowledge` (migração 0041); usada no lugar.
- Notificação `meeting_ended` deixou de levar `task_id` (antes apontava para a tarefa interna "Reunião AIDE") — agora usa só `entity_type`/`link` para abrir `/meeting`, já que o clique não deve abrir a tarefa interna.
- Regra 2 ("Owner is NOT paid") já era satisfeita estruturalmente antes desta entrega — `PaymentPage.jsx` filtra o owner da lista de abas/assistentes (`u.role !== 'owner'`) e `computePaymentSummary` sempre roda escopado a um `user_id` específico, nunca "todos". Nenhuma mudança de código foi necessária para essa regra.

## [II.1.2.0] — 2026-08-13

### Task↔Carreira (link bidirecional), regras de presença em reunião, log de presença, formatação de pagamentos

**Task↔Carreira:**
- `TasksPage`/`TaskCard`: badge "→ Ver vaga em Carreira" agora é clicável,
  navega para `/career?opportunity=<id>` (antes era só texto, sem ação).
- `OpportunityPipeline`: deep-link `?opportunity=<id>` abre o modal da vaga
  direto (mesmo padrão já usado por `?task=<id>` em Tarefas); o botão "Criar
  Tarefa" vira "Ver tarefa →" quando já existe uma tarefa vinculada.
- `TaskModal`: nova seção "Vaga vinculada" (título + status + botão "Ver no
  Pipeline →") quando a tarefa tem `opportunity_id`.

**Reunião — regras de presença corrigidas (Regra 1/2):**
- `handleMeetingStart` (`_worker.js`): assistentes agora podem iniciar a
  PRÓPRIA contagem de tempo a qualquer momento, mesmo antes do Lauro entrar —
  antes, sem sessão compartilhada aberta, a chamada era recusada com 409 e
  NENHUM `time_entries` era criado. Só a sessão compartilhada (o relógio que
  todos veem) continua exigindo que o Lauro entre primeiro.
- `getMeetingParticipants`: deixou de filtrar por `sinceTs` (início da sessão)
  — uma assistente que entrasse antes do Lauro desaparecia da lista de
  participantes mesmo com o timer dela rodando. Agora lista qualquer entrada
  aberta na tarefa da reunião, independente da ordem de chegada.
- `MeetingPage.jsx`: lista "Em reunião agora (N)" com nome + hora de entrada
  de cada participante; aviso quando alguém já está contando tempo mas o
  relógio compartilhado ainda espera o Lauro; botão "Iniciar Reunião" deixou
  de ficar bloqueado para não-owners sem sessão.

**Log de presença (novo):**
- Migração `0059_meeting_attendance.sql` — tabela `meeting_attendance_log`
  (entrada/saída, independente da sessão compartilhada).
- `GET /api/meeting/attendance-log` (owner-only) e modal "Ver histórico
  completo" em `MeetingPage.jsx`.

**Pagamentos:**
- `PaymentPage.jsx`: coluna "Data" virou "Data/Hora" (mostrava só a data,
  escondendo a hora de início de cada entrada). Entradas de reunião ganharam
  um toggle "detalhes da reunião" com início, fim e duração completos.

### Desvios do spec original (com justificativa):

- Migração nomeada `0059_meeting_attendance.sql`, não `0057` — os números
  0057 e 0058 já foram usados nesta mesma sessão (drive_hidden, market_org_geo).
- Não foi adicionado `LEFT JOIN career_opportunities` em `shapeTask()`/
  `TASK_SELECT` — mantido o padrão já existente no código (lookup client-side
  no store via `careerOpportunities`), para não alterar o formato de resposta
  de `/api/tasks` consumido em vários outros lugares.
- As consultas `wrangler d1 execute --remote` pedidas na investigação não
  puderam ser rodadas neste ambiente (sem credenciais Cloudflare); a análise
  foi feita por leitura de código/schema, suficiente para desenhar os fixes.

## [II.1.0.0] — 2026-08-10

### Início do Arco II — Metodologia e versionamento formal

Marca o início do desenvolvimento disciplinado do AIDE
com versionamento formal, changelog e roadmap.

### Estado do sistema neste marco:

- Multi-user: Lauro (owner), Alice, Milene (assistant_fixed)
- Tarefas: recurring, multi-assignee, subtarefas reais,
  filtros por utilizador (fix Milene), UI de filtros compacta
- Networking: Mapa Orbital, Mapa de Rede (ego network),
  staleness tracking, filtro Brasil, sector weight
- Mercado: OrgDetailPage, market_notes, sync bidirecional
- Carreira: Pipeline Kanban ("Triagem"), fluxo "Mapear",
  arquivo de vagas, sync vaga↔tarefa, auditoria de mudanças
- Hub: compacto, lista/cards, Artigos Científicos
- Eventos & Venues: timeline, import JSON (56 eventos)
- Gmail: lcestech.consulting@gmail.com integration
- Bridge: Lifegame↔AIDE bidireccional com staging e cron
- DEX CRM: staging e curadoria
- Export/Import: JSON/CSV/Markdown compatível com LifeGame
- Reunião: timer partilhado, notas ao vivo (polling 5s)
- Rich text: Markdown editor/viewer em toda a aplicação
- Pagamentos: multi-assistente (Alice + Milene)
- Brasil: filtro e diferenciação visual no mapa

### Verificação:

App em produção: https://aide-support.pages.dev
Utilizadores activos: Lauro, Alice Tagima, Milene Da Silva

---

## Histórico anterior ao Arco II (esquema 2.26.x)

Registro retroativo — sessão Cowork "Plano de Melhorias v2.26.x" e sessão de
fix crítico + Hub redesign, ambas antes da adoção do versionamento formal.

- **2.26.1** — Bloco 1: redesenho do filtro de tarefas (dropdowns compactos)
  e correção do bug em que a Milene nunca aparecia no filtro de responsável
  (filtro binário 'me'/'other' substituído por seleção direta de utilizador).
- **2.26.2** — Bloco 2: renomeação "Extrair Conhecimento" → "Mapear", botão
  "Coleta concluída", aba Arquivo no Kanban de Carreira, indicadores visuais
  em tarefas de mapeamento.
- **2.26.3** — Bloco 3: sincronização bidirecional vaga↔tarefa (status e
  responsável) e log de auditoria de oportunidades (migração 0056).
- **2.26.4** — Bloco 4: cabeçalho do Hub compactado, modo Lista em Vagas
  PhD/Empregos, primeira coluna do Kanban renomeada para "Triagem".
- **2.26.5** — Fix crítico: loop infinito de re-render (React #185) na aba
  Tarefas, causado por um selector do Zustand (`selectAllTaskTags`) que
  devolvia um array novo a cada render.
- **2.26.6** — Bloco 5: redesign do Hub para máxima área útil — remoção
  completa do dashboard de overview e dos stat cards por sub-aba, título de
  página repetido removido, modo Lista como padrão em Vagas PhD/Empregos/
  Notícias, cards mais compactos, filtros inline.
