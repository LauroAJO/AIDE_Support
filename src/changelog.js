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
