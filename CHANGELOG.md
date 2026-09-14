# AIDE — Changelog

Formato: ARCO.MAJOR.MINOR.PATCH

- PATCH — fix dentro de feature existente
- MINOR — feature completa, verificada pelo utilizador
- MAJOR — fim de sessão de desenvolvimento
- ARCO — mudança de paradigma

---

## [II.1.10.0] — 2026-09-14

### Integração de Dados Externos — Fase 1 (ORCID + OpenAlex)

Segunda entrega do plano de integração externa, sobre a fundação da Fase 0. Enriquecimento de PESSOAS via ORCID e OpenAlex — vínculo manual (nome sozinho nunca é confiável o bastante pra auto-linkar), enriquecimento imediato ao vincular.

- **Fluxo de vínculo**: nova seção "Dados externos" no painel de detalhe de uma pessoa em Networking (logo abaixo de Peso Setorial) — buscar por nome em `GET /api/search/external/orcid` ou `GET /api/search/external/openalex`, escolher o candidato certo na lista de resultados, `POST /api/network/people/:id/link-external` grava o ID na coluna (`orcid_id`/`openalex_author_id`, migration 0062) e já dispara o enriquecimento síncrono na hora — sem esperar o cron do dia seguinte.
- **`enrichPersonFromORCID`**: busca `GET https://pub.orcid.org/v3.0/{id}/record` (API pública, sem necessidade de client_id/secret pra leitura) — nome, até 50 trabalhos (título/ano/DOI/journal) e vínculos institucionais (emprego atual/passado). Salvo em `external_profiles` (source='orcid').
- **`enrichPersonFromOpenAlex`**: busca `GET https://api.openalex.org/authors/{id}` (h-index, i10-index, citações, trabalhos) + até 25 trabalhos recentes via `GET /works?filter=author.id:{id}`, salvos em `external_publications`/`publication_entity_links` — mesma tabela que a Fase 0 já preparou pro cálculo de peso setorial (componente `journal`) e que a Fase 3 vai reaproveitar pro Hub. Todo request OpenAlex leva `mailto=lauro.ajo@gmail.com` (polite pool, evita rate-limit agressivo).
- **Cache de 24h**: `getFreshExternalProfile` — um vínculo já enriquecido nas últimas 24h não dispara novo fetch a não ser que o usuário clique "Atualizar" (`force=true`). Falha de rede nunca quebra a UI — vínculo (coluna orcid_id/openalex_author_id) é salvo mesmo se o fetch falhar na hora; resposta `207` avisa o frontend, que mostra "Perfil ainda não sincronizado".
- `shapeNetworkPerson` (backend) e o payload de pessoa passaram a expor `orcid_id`/`openalex_author_id` — antes ficavam de fora do whitelist de campos retornados pela API.

### Desvios/decisões técnicas (com justificativa)
- Sem migração nova nesta fase — as colunas (`orcid_id`, `openalex_author_id`) e tabelas (`external_profiles`, `external_publications`, `publication_entity_links`) já foram criadas na Fase 0 (migration 0062), exatamente para isto.
- Busca ORCID via endpoint público `/v3.0/search/` (sem autenticação) — suficiente para o caso de uso "usuário confirma manualmente", sem precisar registrar credenciais OAuth de API da ORCID (que exigiriam client_id/secret geridos à parte).
- `runEnrichmentJob` (dispatcher da fila, Fase 0) não precisou de nenhuma mudança — o guard `typeof enrichPersonFromORCID === 'function'` já liga sozinho agora que as funções existem (declarações são hoisted em JS).
- Vínculo/enriquecimento desta fase é sempre **síncrono**, disparado pelo clique do usuário (`link-external`) — a fila `enrichment_queue`/`processEnrichmentQueue` da Fase 0 continua existindo para o cron diário reprocessar em lote (fica pronta para Fase 2, que deve popular a fila com mais volume — organizações via ROR/CORDIS).

## [II.1.9.0] — 2026-09-14

### Integração de Dados Externos — Fase 0 (Fundações)

Primeira entrega do plano de integração ORCID/OpenAlex/ROR/CORDIS/EURAXESS ("AIDE — External Data Integration: Complete Implementation Plan — Phases 0-5"). Fase 0 é só fundação — schema, fila de processamento, rotas de consulta, grafo genérico — nenhum fetcher externo real ainda (ORCID/OpenAlex chegam na Fase 1, ROR/CORDIS na Fase 2). Nada de externo é chamado nesta entrega; a fila fica pronta para ser populada e processada, mas todo job de uma fonte ainda não implementada termina como `status: 'error'` com mensagem clara, sem quebrar o cron.

- **Migração `0062_external_integrations.sql`**: novas colunas em `network_people` (`orcid_id`, `openalex_author_id`) e `market_organizations` (`ror_id`, `cordis_org_id`, `wikidata_id`); tabelas novas `external_profiles`, `enrichment_queue`, `external_publications`, `publication_entity_links`, `external_projects`, `project_org_links`, `sector_weight_log`.
- **Fila de enriquecimento**: `queueEnrichment()` insere jobs; `processEnrichmentQueue(env, limit)` processa em lote, ordenado por prioridade; dispatcher defensivo (`runEnrichmentJob`) checa `typeof fn === 'function'` para cada fonte, então a fila já funciona ponta-a-ponta (inserir → processar → marcar done/error) mesmo sem nenhum fetcher real implementado ainda. Rodagem diária integrada em `runDailyNotifications` (após o bridge push AIDE→Lifegame), lote de até 20 jobs, não-bloqueante.
- **`calculateSectorWeight(personId, env)`**: combina peso manual (40%, já existente desde migration 0048), h-index do OpenAlex (30%, lido de `external_profiles` quando presente), financiamento CORDIS acumulado via organizações vinculadas (20%, via `contact_org_links` → `project_org_links` → `external_projects`), quartil SJR da publicação mais recente ligada à pessoa (10%, via `publication_entity_links` → `external_publications` → `hub_items.doi`). Só os componentes disponíveis entram na média ponderada — sem penalizar quem só tem avaliação manual. Cada cálculo é logado em `sector_weight_log`.
- **Rotas novas**: `POST /api/enrich/process-queue` (owner, gatilho manual), `GET/POST /api/enrich/queue` + `DELETE /api/enrich/queue/:id` (owner), `GET /api/external/profiles/:entityId`, `GET /api/external/publications/:personId`, `GET /api/graph/data?type=networking`, `GET/POST /api/sector-weight/:personId`.
- **Grafo genérico `{nodes, edges}`**: `buildNetworkingGraph()` (novo, em `networkShared.js`, com espelho server-side `buildNetworkingGraphServer` em `_worker.js` já que o worker é um bundle único sem import de ES modules do frontend) converte pessoas/conexões/organizações no formato genérico do spec. `buildEgoNetworkGeneric()` é a versão BFS reaproveitável do algoritmo de rede egocêntrica, com um parâmetro `firstHopOnlyTypes` que preserva exatamente a regra da função original `buildEgoNetwork` — "gente da mesma organização é sempre 1º grau, nunca encadeia pra 2º grau" — generalizada pra qualquer tipo de aresta marcado assim (aqui, `'affiliation'`).

### Desvios/decisões técnicas (com justificativa)
- **Versão**: o spec assumia partir de II.1.0.0; a versão real na hora de começar era II.1.8.0. Combinado com o Lauro continuar a sequência existente (Fase 0 = II.1.9.0, Fase 1 = II.1.10.0, Fase 2 = II.1.11.0, Fase 3 = II.1.12.0, Fase 4 = II.1.13.x, Fase 5 = II.1.14.0) em vez de abrir um novo MAJOR.
- **Migração renumerada**: o spec propunha `0059_external_integrations.sql`; 0059 (meeting_attendance), 0060 (notification_link) e 0061 (fix_attendance_timestamp_column) já estavam commitados nesta sessão por outras entregas. Renumerado para `0062_external_integrations.sql`, próximo número livre.
- **`NetworkMapRede.jsx` NÃO foi refatorado nesta entrega**, apesar do Lauro ter confirmado "fazer tudo (schema + rotas + refactor) numa entrega só" na pergunta de escopo da Fase 0. Ao investigar o componente (563 linhas) de perto, o acoplamento com dados de pessoa é mais profundo do que uma troca de props sugere — cor do nó lida de `colorMode` + `sector_weight`/`temperature` ao vivo, tooltip inteiro monta texto específico de pessoa (cargo/organização/peso setorial), losango-vs-círculo por nacionalidade — e esse é o componente de visualização mais usado do Networking, em produção. Reescrevê-lo para um formato genérico sem quebrar nenhum desses detalhes visuais, sem poder testar no navegador antes de entregar, é um risco desproporcional para uma fase que é só "fundação" — a Fase 4 (que introduz as visualizações novas de fato) é onde essa generalização vai ser *exercida* pela primeira vez, e faz mais sentido refatorar `NetworkMapRede.jsx` naquele momento, com um caso de uso real puxando o design, e testável lado a lado com o gráfico novo. Em vez disso, esta entrega prepara o terreno sem tocar no componente em produção: `buildEgoNetworkGeneric` e `buildNetworkingGraph` já existem e são exercidos ponta-a-ponta pelo endpoint `GET /api/graph/data`, então o design está validado — só falta o componente React consumi-los, o que fica para quando houver um segundo consumidor real (Fase 4) para guiar as decisões de props. `NetworkMapRede.jsx` continua exatamente como estava, usando `buildEgoNetwork` (não a genérica) — zero risco de regressão visual no Mapa de Rede atual.
- Sem nenhum fetcher externo real (ORCID/OpenAlex/ROR/CORDIS) — são as Fases 1 e 2. O dispatcher da fila já está pronto para recebê-los via `typeof enrichPersonFromORCID === 'function'` etc., sem precisar tocar na fila/rotas/cron quando esses forem implementados.
- `external_publications.doi` → `hub_items.doi` é um JOIN direto (mesma coluna, sem FK formal) — schema já compatível desde a migration 0045 (Hub artigos), sem mudança necessária.

## [II.1.8.0] — 2026-09-11

### Pagamentos: lançamento manual — "Registrar para" + tarefa rápida

Relato do usuário: tentou registrar uma reunião de 30min que teve com a Milene, pelo botão "Adicionar tempo manualmente" em Pagamentos — clicou, preencheu tudo, mas a entrada não aparecia. Pediu também poder só digitar um nome ali sem precisar passar pelo fluxo de criar tarefa manualmente, ou (alternativa que ele mesmo sugeriu) que digitar um nome criasse a tarefa automaticamente, já concluída, com ele e a pessoa envolvida.

**Causa do bug:** `POST /api/timer/start` (usado tanto pelo timer normal quanto pelo lançamento manual) sempre gravava `time_entries.user_id = user.id` — ou seja, **quem está logado**, nunca a pessoa selecionada na aba. Como o Lauro estava logado como ele mesmo, toda entrada manual que ele criava — mesmo com a aba da Milene aberta em Pagamentos — ia para a própria conta dele. A entrada existia no banco, só que na aba errada; por isso "sumia" para Milene.

- `_worker.js` (`handleTimerStart`): entradas manuais (`body.manual`) agora aceitam `body.user_id`, mas só o **owner** pode usá-lo — para qualquer outro caller (assistente logando o próprio tempo, ou o timer ao vivo), `targetUserId` continua sempre `user.id`, sem mudança de comportamento. A busca de taxa (`availability`) também passou a usar `targetUserId`, não quem está lançando — a taxa aplicada é a da pessoa que está sendo paga.
- `ManualEntryModal` (`PaymentPage.jsx`): novo seletor **"Registrar para"**, visível só pro owner, com Lauro + cada assistente ativa. Valor padrão = a aba de Pagamentos que estava aberta quando o modal foi acionado (abrir com a aba da Milene já pré-seleciona ela).
- **Criação rápida de tarefa:** digitar um nome no campo de busca e clicar em "Criar tarefa "X"" (ou simplesmente clicar Salvar sem nunca ter selecionado uma tarefa existente) cria a tarefa na hora — `status: 'done'` (lançamento manual é sempre tempo que já aconteceu) e `assigned_to` = a pessoa escolhida em "Registrar para", com o Lauro entrando como co-responsável (`assignee_ids`, tabela `task_assignees`, migration 0052) quando o destinatário é outra pessoa. Sem precisar abrir o formulário de área/projeto/frente. Esse formulário completo (que também ganhou `assigned_to`/`assignee_ids` — antes a tarefa nascia sem responsável nenhum) continua disponível via "Nova tarefa", pra quem quiser organizar por área/projeto/frente.

### Desvios/decisões técnicas (com justificativa)
- Não foi implementado lançamento 100% sem tarefa (opção A do pedido — "só um nome, sem criar tarefa nenhuma") — o modelo de dados inteiro (relatórios, `time_entries.task_id` como FK NOT NULL na prática, a própria tabela de Pagamentos agrupada por tarefa) pressupõe toda entrada ligada a uma tarefa. A alternativa que o próprio usuário sugeriu (criar a tarefa automaticamente) foi implementada porque preserva essa consistência sem exigir uma reforma maior — e o resultado, na prática, é quase tão rápido quanto "só um nome": digitar e clicar uma vez.
- Assistentes (não-owner) continuam sem o seletor "Registrar para" — a entrada delas sempre foi (e continua sendo) a própria, sem necessidade de escolher. Tarefas que elas criam via este modal continuam sem `assigned_to` automático, mesmo comportamento de antes — fora do escopo do pedido, que era especificamente sobre o fluxo do owner registrando para outra pessoa.

## [II.1.7.2] — 2026-09-11

### Fix: login travado — D1 free tier estourou de novo, desta vez mais cedo

Relato: Alice e Milene completaram o OAuth do Google normalmente, mas não conseguiam entrar no AIDE depois disso — o login travava/falhava. Confirmado no painel Cloudflare (D1 → aide-db → Overview, últimas 24h): **6M linhas lidas**, acima do teto de 5M/dia do free tier (alta de 655% sobre o período anterior). O fix de ontem (II.1.7.1, trava de visibilidade no polling do Chat) reduziu um consumidor, mas não foi suficiente — a causa maior era estrutural: **toda** requisição autenticada (não só o Chat) rodava 3 queries no D1 (`getUserFromRequest`: lookup de sessão + `resolvePermissions` + `resolveGranularPermissions`, esta última com 2 queries via JOIN/Promise.all) só para responder "quem é esse usuário e o que ele pode fazer" — multiplicado por cada clique, cada carregamento de página, de 3 pessoas, o dia inteiro. Como o próprio `/api/auth/callback` (login) também lê/escreve no D1, quando a cota do dia já está zerada o login falha com o mesmo `D1_ERROR` de ontem — só que agora bloqueando o acesso em si, não só o recebimento de mensagens.

- `_worker.js` (`getUserFromRequest`): novo cache em memória, no escopo do módulo (`AUTH_CACHE`, um `Map` token → resultado resolvido), com TTL de 45s. Uma isolate do Cloudflare Workers é reaproveitada entre várias requisições antes de ser reciclada, então esse cache — sem KV, sem D1, sem infraestrutura nova — absorve o caso comum de um mesmo usuário disparando várias requisições em poucos segundos (carregar uma página, os pollings, cliques em sequência), cortando a maior parte das 3 queries repetidas pra 1 (ou zero, em cache hit).
- Invalidação proativa do cache nos pontos que mudam permissão/sessão — `handleLogout`, `handleUserApprove`, `handleUserRole`, `handleUserPermissions` (PUT), `handleUserArchive`, `handleUserGranularPermissions` (PUT lote/único e DELETE reset/único) — para que uma mudança de permissão feita pelo Lauro no painel de admin valha na hora, sem esperar os 45s do TTL expirarem.
- TTL de 45s foi escolhido como equilíbrio: longo o bastante pra cortar a maior parte do tráfego repetido de um mesmo usuário num burst curto, curto o bastante pra uma revogação de acesso (arquivamento, mudança de role) nunca ficar "pendurada" por muito tempo mesmo nos poucos endpoints que não chamam a invalidação explícita.

### Desvios/decisões técnicas (com justificativa)
- Cache não é indexado por `user_id` (só por token) — invalidação por usuário percorre o Map inteiro removendo entradas cujo `value.id` bate. Aceitável porque o Map nunca passa de um punhado de entradas (poucos usuários ativos por vez).
- Não foi adicionado nenhum mecanismo de cache entre isolates (KV, Durable Object) — o objetivo era reduzir leituras do D1 sem introduzir uma nova dependência paga/gerenciada; o cache por isolate já cobre a maior parte do padrão de tráfego observado (rajadas do mesmo usuário), mesmo sem garantia de persistir entre isolates diferentes.
- Decisão de também fazer upgrade pro Workers Paid continua em aberto — fica com o usuário; este fix é só de código, sem custo.

## [II.1.7.1] — 2026-09-10

### Fix: Chat parava de respeitar a aba em segundo plano no polling (D1 free tier)

Contexto: a partir de 01/09/2026 a Cloudflare passou a **aplicar** (não só ter) o limite diário do D1 free tier — 5M linhas lidas/dia — e o login (OAuth callback) chegou a falhar em produção com `D1_ERROR: Your account has exceeded D1's free tier daily row read limit`. Investigação (sem uma query única "culpada" — `chat_messages` já tem índices em `created_at`/`user_id`, então a query em si é indexada, não full-scan) apontou para o padrão de polling do frontend como a causa mais provável de volume: `ChatPage.jsx` fazia `GET /api/chat/messages?limit=50` a cada 10s **mesmo com a aba em segundo plano**, diferente do poll de participantes em `MeetingPage.jsx` (5s/10s), que já tinha uma trava de visibilidade. Outros pollers (`NotificationBell.jsx` 60s, `DashboardPage.jsx` 30s de um valor só, `TimerIndicator.jsx` 1s sem rede) foram descartados como contribuintes relevantes.

- `ChatPage.jsx`: o `setInterval` do polling de mensagens ganhou `if (document.visibilityState !== 'visible') return;` no início do callback — mesma trava já usada no poll de participantes da Reunião. Não muda `POLL_MS` (continua 10s) — só deixa de disparar o fetch enquanto a aba não está em primeiro plano.

### Desvios/decisões técnicas (com justificativa)
- Fix é só do lado do código (custo zero) — decisão de também fazer upgrade pro Workers Paid ($5/mês, 25B linhas/mês) fica em aberto, é decisão do usuário, não foi tomada nem recomendada aqui.
- Não foram tocados os pollers de Reunião (agenda/notas, 5s) nem Notificações/Dashboard — fora do escopo pedido; podem ser revisitados se o limite continuar sendo estourado mesmo depois deste fix.

## [II.1.7.0] — 2026-09-10

### Carreira: Kanban simplificado (Mapear → Analisar) + rodízio de responsáveis + Arquivo discreto

Pedido do usuário: o Kanban de Carreira (5 colunas + toggle "Mapear" por cima) virou complexo demais depois que a trilha PhD mudou de "candidatar-se" pra "networking" (II.1.5.0). Pedido: 1ª coluna literal "Mapear" (onde tudo que chega em Carreira cai e onde as assistentes trabalham), 2ª coluna "Analisar" (onde ele decide o destino final); vaga vinda do Hub já entra com um responsável definido, alternando Alice/Milene; e o Arquivo deixa de ser uma aba visível, virando um botão discreto — reaproveitando o slot do antigo botão "Mapear" no card.

**Kanban — de 5 colunas + toggle para 2 colunas literais:**
- `careerShared.jsx`: `PIPELINE_COLUMNS` caiu de 5 entradas (Triagem/Preparando/Aplicada/Em Processo/Vagas Mortas) para 2 (`to_organize` → "Mapear", novo status `analisar` → "Analisar"). O toggle `extract_knowledge` (que colapsava um card em qualquer coluna numa sub-seção "🔍 N em Mapear") foi removido — "Mapear" agora é a própria primeira coluna, não um flag por cima de qualquer coluna. Campo `extract_knowledge` continua existindo no banco (não removido/migrado — apenas parou de ser lido/escrito pelo Kanban), sem custo de manter.
- `OpportunityPipeline.jsx`: botão de ação do card muda com a coluna — em Mapear, "Mapeado ✓ → Analisar" (`status='analisar'`); em Analisar, dois botões novos — "Arquivo" (`status='mapped'`, reaproveita a lógica/estilo do antigo "Coleta concluída") e "Descartar" (`status='dead'`, ação que antes só existia arrastando o card pra coluna "Vagas Mortas", que sumia na hora por já estar em `ARCHIVE_STATUSES`).
- Aplicado às **3 trilhas** (PhD, Emprego, Spin-off) — confirmado explicitamente com o usuário, não só PhD.
- `OPP_STATUS_LABELS_PHD_NETWORKING` reduzido a só `dead: 'Sem retorno'` — com Mapear/Analisar virando genéricos pra todas as trilhas, a única nuance de linguagem de networking que ainda faz sentido é o destino "Descartada" soar como "Sem retorno" (contato sem resposta) em vez de recusa ativa, só pra trilha PhD.

**Cards já em Preparando/Aplicada/Em Processo — migrados, não congelados:**
- `migrations/0011_career_kanban_simplify.sql`: `UPDATE career_opportunities SET status='analisar' WHERE status IN ('preparing','applied','in_process')`. Decisão explícita do usuário (perguntado via clarificação): mover tudo pra Analisar, em vez de manter as 3 colunas antigas congeladas só pra esses cards. Nada é apagado — histórico de status continua em `opportunity_audit_log` e no log embutido em `notes`.
- `_worker.js`: `OPP_STATUS_RANK`, `taskStatusForOpportunityStatus` e `syncOpportunityFromTaskStatus` (sincronização tarefa↔oportunidade) atualizados pro novo status `analisar` — preparing/applied/in_process mantidos como sinônimos de rank/comportamento (rede de segurança pra card que escape da migration), não removidos das funções.
- `TaskCard.jsx`/`TaskModal.jsx`: badge "🔍 Mapeamento" (mostrado quando a tarefa vinculada é de uma oportunidade em coleta de informação) trocou o critério de `extract_knowledge` para `status === 'to_organize'` — mesma semântica, refletindo onde "Mapear" mora agora.

**Rodízio automático Alice/Milene (só vagas do Hub):**
- `_worker.js`: `nextRoundRobinAssistant(env)` — conta quantas oportunidades vindas do Hub (`hub_short_id IS NOT NULL`) já têm responsável e alterna pelo resto da divisão por N assistentes (ordenados por nome, "Alice" antes de "Milene"). Aplicado em `POST /api/career/opportunities` só quando `hub_short_id` está presente e `assigned_to` não veio explícito no body — vagas criadas manualmente em Carreira **não** entram no rodízio (confirmado com o usuário).
- `createHubCareerTask`: a tarefa de preenchimento (criada junto com toda vaga vinda do Hub) agora nasce atribuída à mesma pessoa sorteada pro card, em vez de `assigned_to=NULL` ("solta", qualquer assistente pega) como era desde v2.25.18 — evita dois "donos" divergentes pro mesmo card.

**Arquivo — de aba visível para ícone discreto:**
- `OpportunityPipeline.jsx`: o toggle `[Pipeline] [Arquivo]` (abas lado a lado, sempre visíveis, com contador) virou um ícone (`Archive`) sozinho, junto ao botão "Nova Oportunidade" — sem rótulo de texto, só contador quando há itens e título ao passar o mouse. `ArchiveView` ganhou um link "← Voltar ao Pipeline" no topo (antes só existia clicando de volta na aba "Pipeline", que não existe mais).

### Desvios/decisões técnicas (com justificativa)
- Status novo `analisar` em vez de reaproveitar `preparing`: um status próprio deixa "chegou aqui vindo de Mapear" e "chegou aqui vindo de uma reversão manual" com o mesmo significado, sem herdar a semântica antiga (de candidatura) de `preparing`.
- `dead` não ganhou rótulo/coluna própria no Kanban ativo — já era assim antes de II.1.7.0 (`ARCHIVE_STATUSES` já incluía `dead`; a coluna "Vagas Mortas" só existia visualmente, mas qualquer card solto lá sumia na hora). O botão "Descartar" só torna esse caminho alcançável sem depender de drag-and-drop.
- `OPP_STATUS_ORDER` (select manual de status no modal/editor) ficou só com `['to_organize', 'analisar']` — `dead`/`mapped` continuam alcançáveis só pelos botões dedicados do card, mesma filosofia que já valia pra `mapped` antes desta entrega (nunca esteve no select manual).

### Intelligence Hub: Postdoc volta a ser coletado (emprego geral continua parado)

Complemento do pedido — desligar emprego geral (II.1.5.0) não deveria ter parado Postdoc também, que o usuário ainda quer receber em Empregos.

- `collectors/base.py` (`_resolve_projects`): novo suporte a `enabled` **por fonte** (default `True` — não muda o comportamento de nenhuma fonte que nunca declarou a chave). Antes só existia liga/desliga por projeto inteiro.
- `config.yaml`: projeto `emprego_vagas` voltou a `enabled: true`, mas as 3 fontes de vaga geral (Techniekwerkt · Energy Engineer/Waterstof/Process Engineer) ganharam `enabled: false` individualmente — as 8 fontes de Postdoc/Pesquisador (jobs.ac.uk, EuroScienceJobs, Nature Careers, TNO, DIFFER, Juelich, EnergyVille, ResearchGate) seguem coletando normalmente.
- `_worker.js`: `HUB_INGEST_BLOCKED_PROJECTS` esvaziado (era `{'emprego_vagas'}`) — o filtro passou a ser feito inteiramente do lado do Hub, por fonte, então bloquear o projeto inteiro na ingestão do AIDE bloquearia o Postdoc que devia passar.

**Desvio/decisão:** perguntado explicitamente — Postdoc continua aparecendo na aba **Empregos** (não migrado para Vagas PhD), mesmo o AIDE já tratar `postdoc` como trilha `phd` internamente (`TYPE_TO_TRACK`) — o usuário confirmou que quer ver essas vagas em Empregos, não misturadas com PhD.

## [II.1.6.0] — 2026-09-10

### Export multi-domínio: Carreira, Mercado, Networking, Eventos, Venues (CSV/TXT/PDF)

Pedido explícito do usuário: poder exportar as áreas Carreira, Mercado, Contatos-Networking, Eventos e Venues, escolhendo quais (até "todos") e em qual formato — CSV, TXT ou PDF, complementando o export de Tarefas/Notas que já existia.

- `_worker.js`: `GET /api/export/data?domain=<career|market|networking|events|venues>&format=csv|txt` — reaproveita as mesmas queries/joins das páginas de origem (`career_opportunities` com JOIN em organização/contato, `market_organizations`, `network_people` via `hydratePeople` para trazer cargo/instituição atual, `career_events`, `publication_venues`). Controle de acesso espelha cada página (Mercado/Eventos/Venues: owner + assistente fixo; Networking: permissão granular; Carreira: qualquer sessão válida). Um domínio por chamada — o frontend dispara N downloads quando vários são marcados.
- `GET /api/export/data/json?domains=a,b,c` — variante sem download, usada só pelo PDF: devolve `{ [domain]: { label, columns, rows } }` já formatado (mesmas colunas/rótulos do CSV) para o cliente montar o arquivo.
- `src/lib/exportData.js` (novo): PDF é gerado no **navegador**, via `jspdf` + `jspdf-autotable` (import dinâmico — só baixa a lib quando o usuário realmente pede PDF; confirmado no build que ficaram em chunks separados, não infladando o bundle inicial). Um PDF por exportação, com uma seção/tabela por domínio selecionado — CSV/TXT continuam um arquivo por domínio (colunas incompatíveis entre domínios impedem juntar num CSV só).
- `SettingsPage.jsx`: novo painel "Exportar dados" na seção Dados — chips de seleção por domínio + "Selecionar todos", formato (CSV/TXT/PDF), botão único.

### Desvios/decisões técnicas (com justificativa)
- PDF gerado no cliente, não no Worker: gerar PDF de verdade em Cloudflare Workers exigiria uma lib pesada sem suporte claro nesse runtime; o navegador já faz isso bem, sem dependência nova no backend.
- Rótulos de status/trilha da Carreira (`EXPORT_STATUS_LABELS`/`EXPORT_TRACK_LABELS`) duplicados no worker a partir de `careerShared.jsx` — o Worker não importa código do bundle React (build separado). Mesmo padrão já usado entre `CHANGELOG.md` e `src/changelog.js`: mantidos em paralelo manualmente, com comentário apontando a duplicação.
- Local de entrada: painel único em Configurações (não um botão por página) — o pedido foi poder escolher qualquer combinação dos 5 domínios de um só lugar, o que um botão por página não atende bem.

## [II.1.5.0] — 2026-09-10

### Carreira/Hub ajustados para o novo papel: Lauro aceito no PhD (Prof. Edwin Zondervan, UT)

Não é mais busca de emprego/PhD — é um PhD confirmado, programa separado do EngD em hidrogênio (financiado pela empresa) que continua em paralelo. A área Carreira e o fluxo de ingestão do Hub foram ajustados para essa realidade, mantendo os dados já existentes intactos.

**Empregos (Hub) — parar de acumular, sem remover nada:**
- `_worker.js`: `POST /api/hub/items` agora bloqueia (`HUB_INGEST_BLOCKED_PROJECTS`) qualquer item novo do projeto `emprego_vagas` — nem insere nem atualiza, mesmo que o Intelligence Hub continue enviando. Resposta ganhou o campo `blocked` (`{ accepted, duplicates, blocked, total }`).
- A aba "Empregos" em `/hub` e as vagas já coletadas continuam 100% visíveis e utilizáveis (inclusive "Adicionar à Carreira") — nada foi comentado ou escondido na UI. Only a barreira de ingestão é nova.
- Decisão revista em conversa: o pedido original era comentar a aba inteira, mas Lauro esclareceu que quer manter o que já existe navegável — só não quer mais vagas novas se acumulando.

**Carreira — trilha PhD virou networking, não candidatura:**
- `careerShared.jsx`: novo `OPP_STATUS_LABELS_PHD_NETWORKING` (Descobertas / A contatar / Contato feito / Em conversa / Sem retorno) + `statusLabelFor(status, track)` e `columnLabelFor(col, trackFilter)` — os status internos do banco (`to_organize`/`preparing`/`applied`/`in_process`/`dead`) não mudam, só o rótulo exibido quando a trilha é `phd`. job/spinoff continuam com os rótulos de candidatura originais (Triagem/Preparando/Aplicada/Em Processo/Vagas Mortas).
- `OpportunityPipeline.jsx`: cabeçalho de coluna do Kanban (track-aware só quando uma trilha específica está filtrada — com "Todas" selecionado, mistura trilhas e o rótulo genérico é o único que faz sentido), linha da tabela/arquivo, seletor de status no modal e no editor, histórico de status (log de notas) e auditoria — todos os 6 pontos que mostravam `OPP_STATUS_LABELS` direto passaram a usar `statusLabelFor`.
- `GoalsView.jsx`: removido o lembrete crítico hardcoded "Visto expira dezembro 2025" (`CRITICAL_NOTE`) das trilhas phd/job — já estava com a data no passado e o motivo de fundo (garantir visto via emprego/PhD) deixou de existir. Mecanismo mantido no código para um lembrete futuro, se precisar.

### Fora desta entrega (decisão do usuário, não código)
- Oportunidades tipo `job`/`contract` já cadastradas em Carreira: o usuário revisa manualmente ("vou considerar o que está atualmente no site") — nenhum arquivamento automático foi feito.
- Parar a coleta de vagas de emprego na origem (projeto `emprego_vagas` do Intelligence Hub) é mudança num repositório separado, fora do escopo desta sessão — o bloqueio aqui é só do lado de recebimento do AIDE.

## [II.1.4.2] — 2026-08-14

### Fix: botão de deletar faltando no painel de detalhe de Vagas PhD

Origem: diagnóstico de um bug crítico no Intelligence Hub (projeto separado) — cascade-delete que apagava `item_projects` a cada execução da pipeline até 11/08, causando reenvio duplicado de itens já aceitos via `POST /api/hub/items` (a trava local `aide_exported_at` era resetada). A única proteção do lado do Hub contra isso — `GET /api/hub/excluded-ids` + tabela local `deleted_items` — só existe para itens que foram deletados no AIDE. Sem o botão de deletar no painel de detalhe, o projeto `phd_vagas` nunca teve como popular esse hard-delete, então vagas de PhD reenviadas em duplicidade não tinham nem essa proteção parcial.

- `VagasPhDPage.jsx`: `DetailModal` ganhou o botão de deletar (🗑) no cabeçalho, ao lado do editar — mesmo padrão já usado em `EmpregoPage.jsx` (`onDelete`/`deleting` como props, `DELETE /api/hub/items/:id`, confirmação via `ConfirmModal`). A lista e os cards de Vagas PhD já tinham o botão; só faltava no painel de detalhe.
- Nenhuma mudança de backend — `handleHubItemById` (`DELETE /api/hub/items/:id`) já existia e já fazia soft-delete (`deleted_at`), usado por todos os outros projetos.

### Investigação (item 2 do relatório do Hub): duplicatas em `hub_items`

Verificado no código do `_worker.js` (`handleHubIngest`, `POST /api/hub/items`): a tabela `hub_items` tem `UNIQUE(external_id, project_id)` e o insert usa `ON CONFLICT(...) DO UPDATE` — reenvio do mesmo `external_id`/`project_id` **atualiza a linha existente**, nunca cria uma linha nova. Uma exceção: se o item já foi soft-deletado (`deleted_at` preenchido), o `WHERE hub_items.deleted_at IS NULL` no `DO UPDATE` bloqueia a atualização — o conflito ainda ocorre (então nada é inserido), mas o item também não é reativado nem sobrescrito; a ingestão conta esse caso como `duplicates`, não como erro.

**Conclusão: não há duplicatas de `hub_items` para investigar em D1** — a constraint estrutural torna isso impossível, independente de quantas vezes o Hub reenviar o mesmo item. O efeito real do bug do Hub, do lado do AIDE, foi só reprocessamento redundante (relevancia/prioridade/tópicos reescritos a cada reenvio) — sem custo de dados duplicados. Item 3 do relatório (checar dados reais do D1) fica sem necessidade, já que a resposta veio da própria constraint do schema, não de uma amostragem.

## [II.1.4.1] — 2026-08-14

### Fix: botão de debug sobrepondo o cronômetro

Feedback direto na tela: o botão 🐛 (`bottom-2 left-2`) ficava por cima do `TimerIndicator` do sidebar — que também vive no canto inferior esquerdo, empurrado até lá pelo spacer (`flex-1`) entre a navegação e o rodapé do sidebar.

- `DebugPanel.jsx`: botão movido para o canto inferior **direito** — `bottom-3 right-3` no desktop, `bottom-20 right-2` no mobile (acima da barra de navegação inferior, que tem `h-16`).
- Único ponto de atenção verificado: `/career` (OpportunityPipeline) tem um toast transitório em `bottom-4 right-4`; pode sobrepor o botão momentaneamente enquanto o toast está visível, mas não é um conflito permanente como o do cronômetro.

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
