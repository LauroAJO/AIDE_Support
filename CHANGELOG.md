# AIDE — Changelog

Formato: ARCO.MAJOR.MINOR.PATCH

- PATCH — fix dentro de feature existente
- MINOR — feature completa, verificada pelo utilizador
- MAJOR — fim de sessão de desenvolvimento
- ARCO — mudança de paradigma

---

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
