// Compact changelog shown inside the app (🐛 debug panel → aba Changelog).
//
// Mantido em paralelo ao CHANGELOG.md do repositório: aquele é o histórico
// completo (para editor/GitHub, com "Desvios do spec" e detalhes técnicos);
// este aqui é o resumo — só os destaques, pensado pra ser lido rápido dentro
// do app, sem precisar abrir o repositório. Não é gerado automaticamente a
// partir do CHANGELOG.md — atualizado manualmente a cada versão, já que muda
// pouco por sessão. Mais recente primeiro.
export const CHANGELOG = [
  {
    version: 'II.1.14.0',
    date: '2026-09-14',
    title: 'Integração de Dados Externos — Fase 5 (EURAXESS)',
    items: [
      'EURAXESS bloqueia buscas automatizadas (confirmado nesta sessão — 403/429 em toda tentativa) — em vez de fingir uma integração automática, Vagas PhD/Empregos ganham 5 campos EURAXESS editáveis à mão (instituição, prazo, programa, tipo de contrato, link)',
      'Botão "Sincronizar" tenta preencher automaticamente a partir da página EURAXESS quando possível; quando falha, grava o motivo em vez de travar',
    ],
  },
  {
    version: 'II.1.13.0',
    date: '2026-09-14',
    title: 'Integração de Dados Externos — Fase 4 (grafos)',
    items: [
      'Nova página /networking/graph ("Grafos externos"): rede de colaboração científica (coautoria via OpenAlex) e rede de organizações por projeto CORDIS compartilhado',
      'Mapa de Rede original continua intocado — o novo visualizador é um componente separado e mais simples',
    ],
  },
  {
    version: 'II.1.12.0',
    date: '2026-09-14',
    title: 'Integração de Dados Externos — Fase 3 (OpenAlex → Hub)',
    items: [
      'Botão "Importar publicações para o Hub" na seção OpenAlex de Networking — manda as publicações já vinculadas da pessoa direto pra Hub → Artigos Científicos, sem duplicar em reimportações',
    ],
  },
  {
    version: 'II.1.11.0',
    date: '2026-09-14',
    title: 'Integração de Dados Externos — Fase 2 (ROR + CORDIS)',
    items: [
      'Mercado: nova seção "Dados externos" em cada organização — buscar/vincular ROR (nome, tipo, localização, site) igual ao fluxo de ORCID/OpenAlex da Fase 1',
      'Botão "Buscar projetos CORDIS" liga até 10 projetos financiados pela UE por nome da organização (busca textual, sem ID confiável — marcado como best-effort na UI)',
    ],
  },
  {
    version: 'II.1.10.0',
    date: '2026-09-14',
    title: 'Integração de Dados Externos — Fase 1 (ORCID + OpenAlex)',
    items: [
      'Networking: nova seção "Dados externos" no perfil de cada pessoa — busca por nome, você escolhe o candidato certo, vincula ORCID e/ou OpenAlex',
      'Vincular já traz na hora h-index, citações, trabalhos e vínculos institucionais — sem esperar processamento em lote',
      'Cache de 24h evita rebuscar toda hora; botão "Atualizar" força uma busca nova quando precisar',
    ],
  },
  {
    version: 'II.1.9.0',
    date: '2026-09-14',
    title: 'Integração de Dados Externos — Fase 0 (fundações)',
    items: [
      'Schema novo: perfis externos, fila de enriquecimento, publicações/projetos externos, log de peso setorial — nenhum fetcher real ainda (ORCID/OpenAlex/ROR/CORDIS chegam nas próximas fases)',
      'Peso setorial agora pode ser calculado automaticamente combinando avaliação manual + citações + financiamento + revista, quando esses dados existirem',
      'Novo endpoint de grafo genérico (base para as visualizações das próximas fases) — Mapa de Rede atual continua 100% como estava, sem tocar',
    ],
  },
  {
    version: 'II.1.8.0',
    date: '2026-09-11',
    title: 'Pagamentos: lançamento manual — "Registrar para" + tarefa rápida',
    items: [
      'Fix: lançamento manual sempre ia pra conta de quem estava logado (Lauro), mesmo aberto na aba de outra pessoa — por isso "sumia" pra Milene/Alice. Agora tem um seletor "Registrar para"',
      'Digitar um nome/título e clicar "Criar tarefa" (ou só Salvar) cria a tarefa na hora, já concluída e atribuída à pessoa escolhida (+ Lauro como co-responsável) — sem passar pelo formulário de área/projeto/frente',
      'Esse formulário completo continua disponível pra quem quiser organizar por área/projeto/frente',
    ],
  },
  {
    version: 'II.1.7.2',
    date: '2026-09-11',
    title: 'Fix: login travado (D1 free tier estourou de novo, mais cedo)',
    items: [
      'Confirmado no painel da Cloudflare: aide-db leu 6M linhas em 24h — acima do teto de 5M/dia, travando inclusive o login',
      'Toda ação autenticada rodava 3 queries no D1 só pra checar sessão/permissões — agora fica em cache por ~45s, cortando a maior parte dessas leituras repetidas',
      'Mudanças de permissão/role/arquivamento continuam instantâneas — o cache é invalidado na hora nesses casos',
    ],
  },
  {
    version: 'II.1.7.1',
    date: '2026-09-10',
    title: 'Fix: Chat não pinga mais com a aba em segundo plano',
    items: [
      'Polling de mensagens (10s) agora só busca se a aba estiver visível — mesma trava que a Reunião já usava no poll de participantes',
      'Motivo: Cloudflare passou a aplicar o limite diário de leitura do D1 free tier (5M linhas/dia) a partir de 01/09/2026, e o login (OAuth) chegou a falhar por estourar a cota',
      'Fix sem custo — só reduz leituras desperdiçadas; upgrade pro Workers Paid continua sendo opcional, decisão do Lauro',
    ],
  },
  {
    version: 'II.1.7.0',
    date: '2026-09-10',
    title: 'Carreira: Kanban vira Mapear → Analisar; Hub: Postdoc de volta',
    items: [
      'Kanban de Carreira simplificado: 2 colunas ativas — Mapear (assistentes) → Analisar (Lauro decide)',
      'Vaga vinda do Hub já chega com responsável — rodízio automático Alice/Milene',
      'Arquivo saiu da aba visível: agora é um ícone discreto; envio pra lá é por botão no card ("Arquivo"/"Descartar")',
      'Hub: vagas de Postdoc voltam a ser coletadas (Empregos); vaga geral continua parada',
    ],
  },
  {
    version: 'II.1.6.0',
    date: '2026-09-10',
    title: 'Export de Carreira/Mercado/Networking/Eventos/Venues',
    items: [
      'Novo painel "Exportar dados" em Configurações',
      'CSV, TXT ou PDF — escolha quais áreas, até todas de uma vez',
      'PDF gerado no navegador, um arquivo com uma seção por área',
    ],
  },
  {
    version: 'II.1.5.0',
    date: '2026-09-10',
    title: 'PhD aceito! Carreira/Hub ajustados',
    items: [
      'Empregos no Hub para de acumular vagas novas (dados existentes continuam navegáveis)',
      'Trilha PhD em Carreira virou networking: Descobertas / A contatar / Contato feito / Em conversa / Sem retorno',
      'Removido lembrete de visto desatualizado em Metas',
    ],
  },
  {
    version: 'II.1.4.2',
    date: '2026-08-14',
    title: 'Fix: botão de deletar em Vagas PhD (painel de detalhe)',
    items: [
      'DetailModal de Vagas PhD ganhou o botão de deletar, igual EmpregoPage já tinha',
      'Duplicatas em hub_items: verificado no código — UNIQUE + upsert torna impossível, sem necessidade de checar D1',
    ],
  },
  {
    version: 'II.1.4.1',
    date: '2026-08-14',
    title: 'Botão de debug: movido pro canto inferior direito',
    items: [
      'Estava em bottom-2 left-2, sobrepondo o cronômetro do sidebar (também no canto inferior esquerdo, empurrado pra baixo pelo spacer)',
      'Agora fica em bottom-3 right-3 no desktop, bottom-20 right-2 no mobile (acima da barra de navegação inferior)',
    ],
  },
  {
    version: 'II.1.4.0',
    date: '2026-08-14',
    title: 'Painel de debug (🐛): log de API + changelog no app',
    items: [
      'Botão fixo no canto inferior esquerdo, sempre visível (login, pending, app)',
      'Aba "API log": últimas 50 chamadas com status/duração/erro, botão copiar tudo',
      'Aba "Changelog": este resumo, direto no app — sem precisar abrir o repositório',
      'Padrão portado do Birdie Bear Entertainment (apiFetch já era centralizado no AIDE)',
    ],
  },
  {
    version: 'II.1.3.1',
    date: '2026-08-13',
    title: 'Pagamentos: intervalo início–fim',
    items: [
      'Coluna "Início–Fim" mostra HH:MM–HH:MM por linha, sem repetir a data já agrupada',
      'Entrada em aberto mostra "em andamento" em vez do horário de fim',
    ],
  },
  {
    version: 'II.1.3.0',
    date: '2026-08-13',
    title: 'Notificações redesenhadas, Task↔Carreira via backend',
    items: [
      'Clique na notificação abre o item exato (deep-link), não mais só a lista genérica',
      'Ícone por tipo, agrupamento por data, "Marcar todas como lidas"',
      'Task↔Carreira agora via JOIN no backend, não mais lookup no store local',
      'Reunião: status mostra participantes ativos e recém-saídos separadamente',
    ],
  },
  {
    version: 'II.1.2.0',
    date: '2026-08-13',
    title: 'Task↔Carreira, regras de presença em reunião, log de presença',
    items: [
      'Badge "Ver vaga em Carreira" ficou clicável (deep-link)',
      'Assistentes podem iniciar a própria contagem de tempo antes do Lauro entrar',
      'Novo log de presença em reunião (entrada/saída, histórico completo)',
      'Pagamentos: coluna de horário passou a mostrar a hora, não só a data',
    ],
  },
  {
    version: 'II.1.0.0',
    date: '2026-08-10',
    title: 'Início do Arco II — versionamento formal',
    items: [
      'Adoção do esquema ARCO.MAJOR.MINOR.PATCH',
      'CHANGELOG.md e ROADMAP.md formais a partir daqui',
    ],
  },
  {
    version: '2.26.6',
    date: '2026-08-10',
    title: 'Hub redesign: compacto, lista view, sem stat cards',
    items: [
      'Remoção do dashboard de overview e dos stat cards por sub-aba',
      'Modo Lista como padrão em Vagas PhD/Empregos/Notícias',
    ],
  },
  {
    version: '2.26.5',
    date: '2026-08-10',
    title: 'Fix crítico: crash da aba Tarefas (loop infinito)',
    items: [
      'Selector do Zustand que devolvia array novo a cada render corrigido',
    ],
  },
];
