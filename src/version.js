// Single source of truth for the app version shown in the header.
//
// v2026-08-10 — AIDE adota o esquema ARCO.MAJOR.MINOR.PATCH (mesmo sistema
// já usado no LifeGame). II.1.0.0 marca o início do "Arco II": versionamento
// formal, CHANGELOG.md e ROADMAP.md. Esta troca é só de esquema — não é um
// reset funcional; ver CHANGELOG.md para o estado do sistema neste marco.
//   PATCH — fix pequeno dentro de feature existente
//   MINOR — feature completa, verificada pelo utilizador
//   MAJOR — fim de sessão de desenvolvimento
//   ARCO  — mudança de paradigma
export const APP_VERSION = 'II.1.0.4';
