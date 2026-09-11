# AIDE — Roadmap

## Esquema de versões: ARCO.MAJOR.MINOR.PATCH

| Nível | Quando |
|-------|--------|
| PATCH | Fix pequeno dentro de feature existente |
| MINOR | Feature completa, verificada pelo utilizador |
| MAJOR | Fim de sessão de desenvolvimento |
| ARCO | Mudança de paradigma |

## Version History

| Versão | Data | Descrição |
|--------|------|-----------|
| II.1.7.2 | 2026-09-11 | Fix: login travado pra Alice/Milene (D1 free tier) — cache em memória de sessão/permissões corta as 3 queries de auth por request para 1 na maioria dos casos |
| II.1.7.1 | 2026-09-10 | Fix: Chat para de fazer polling (10s) com a aba em segundo plano — mesma trava de visibilidade que a Reunião já tinha; mitigação sem custo pro limite diário do D1 free tier |
| II.1.7.0 | 2026-09-10 | Carreira: Kanban simplifica para Mapear→Analisar (2 colunas ativas) com rodízio automático Alice/Milene e Arquivo discreto; Hub: Postdoc volta a ser coletado (emprego geral continua parado) |
| II.1.6.0 | 2026-09-10 | Export multi-domínio (Carreira/Mercado/Networking/Eventos/Venues) em CSV/TXT/PDF, seleção livre, via Configurações |
| II.1.5.0 | 2026-09-10 | Carreira/Hub: Lauro aceito no PhD (Prof. Zondervan) — Empregos para de acumular no Hub (dados existentes mantidos), trilha PhD vira networking com rótulos próprios |
| II.1.4.2 | 2026-08-14 | Fix: botão de deletar no painel de detalhe de Vagas PhD (faltava desde sempre, agravado por bug de duplicação no Hub) |
| II.1.4.1 | 2026-08-14 | Fix: botão de debug movido pro canto inferior direito (sobrepunha o cronômetro do sidebar) |
| II.1.4.0 | 2026-08-14 | Painel de debug (🐛): log de API (últimas 50 chamadas) + changelog compacto, direto no app — portado do BBE |
| II.1.3.1 | 2026-08-13 | Pagamentos: coluna vira intervalo início–fim (sem repetir a data já agrupada) |
| II.1.3.0 | 2026-08-13 | Notificações: redesign completo (deep-link, ícones, agrupamento), Task↔Carreira via JOIN, presença em reunião enriquecida (ativos + saídos) |
| II.1.2.0 | 2026-08-13 | Task↔Carreira, regras de presença em reunião, log de presença, pagamentos com hora |
| II.1.0.0 | 2026-08-10 | Início Arco II — versionamento formal |
| 2.26.6 | 2026-08-10 | Hub redesign: compacto, lista view, sem stat cards |
| 2.26.5 | 2026-08-10 | Fix crítico: crash da aba Tarefas (loop infinito) |
| 2.26.4 | 2026-08-10 | Bloco 4: Hub compacto, lista vagas, Kanban "Triagem" |
| 2.26.3 | 2026-08-10 | Bloco 3: sync vaga↔tarefa, auditoria |
| 2.26.2 | 2026-08-10 | Bloco 2: fluxo "Mapear", arquivo, coleta concluída |
| 2.26.1 | 2026-08-10 | Bloco 1: filtro de tarefas, fix Milene |

## Em desenvolvimento

- (nenhum item aberto no momento — ver Backlog)

## Backlog

- Importar eventos JSON via /events
- Revisar /bridge/staging (355 tarefas)
- Second brain / Obsidian bridge
- Dashboard setorial por área temática
- Multiusuário Intelligence Hub
- Avaliar toggle Lista/Cards para Artigos Científicos (adiado no Bloco 5 —
  layout mestre-detalhe atual já é compacto; ver CHANGELOG)
