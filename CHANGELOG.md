# AIDE — Changelog

Formato: ARCO.MAJOR.MINOR.PATCH

- PATCH — fix dentro de feature existente
- MINOR — feature completa, verificada pelo utilizador
- MAJOR — fim de sessão de desenvolvimento
- ARCO — mudança de paradigma

---

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
