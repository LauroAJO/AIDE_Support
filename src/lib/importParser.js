// Importação em massa (Etapa 3) — validação e normalização client-side.
//
// Estas funções rodam ANTES de enviar ao backend (POST /api/market/import):
// validam o JSON colado pelo usuário, normalizam os campos e produzem um
// relatório de preview (o que será importado, o que tem erro) sem gravar nada.
//
// IMPORTANTE: `tags` é mantida como ARRAY aqui (não stringificada). O backend
// (`handleMarketImport`) é quem faz JSON.stringify — normalizar para string
// aqui causaria dupla-codificação ("[\"H2\"]" viraria "\"[\\\"H2\\\"]\"").

const VALID_ORG_TYPES = [
  'company', 'university', 'research_institute', 'funder', 'consortium', 'other',
];

const VALID_OUTREACH = [
  'not_contacted', 'contacted', 'responded', 'meeting_scheduled',
  'ongoing', 'converted', 'inactive',
];

function asArray(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string' && v.trim()) {
    // aceita "H2, PEM, SOE" como atalho
    return v.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

function clampScore(v, min, max, fallback) {
  const n = Number(v);
  if (Number.isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

// Valida e normaliza uma organização. Retorna { valid, data, errors }.
export function validateOrganization(org) {
  org = org || {};
  const errors = [];
  const name = (org.name || '').trim();
  if (!name) errors.push('name é obrigatório');

  let type = org.type || 'company';
  if (org.type && !VALID_ORG_TYPES.includes(org.type)) {
    errors.push(`type inválido: ${org.type}`);
    type = 'other';
  }

  return {
    valid: errors.length === 0,
    data: {
      name,
      type,
      subtype: org.subtype || '',
      country: org.country || 'NL',
      city: org.city || '',
      website: org.website || '',
      linkedin: org.linkedin || '',
      description: org.description || '',
      relevance_score: clampScore(org.relevance_score, 1, 5, 3),
      relevance_notes: org.relevance_notes || '',
      tags: asArray(org.tags),
      status: org.status || 'prospect',
      source: org.source || '',
    },
    errors,
  };
}

// Valida e normaliza um contato. Mapeia para os campos de network_people
// (name, role, email, linkedin, tags...) + contact_professional (outreach_*,
// relevance_for_*). `organization_name` é resolvido para organization_id pelo
// backend no momento da importação. Retorna { valid, data, errors }.
export function validateContact(contact) {
  contact = contact || {};
  const errors = [];
  const name = (contact.name || '').trim();
  if (!name) errors.push('name é obrigatório');

  let outreach = contact.outreach_status || 'not_contacted';
  if (contact.outreach_status && !VALID_OUTREACH.includes(contact.outreach_status)) {
    errors.push(`outreach_status inválido: ${contact.outreach_status}`);
    outreach = 'not_contacted';
  }

  return {
    valid: errors.length === 0,
    data: {
      // network_people
      name,
      type: contact.type || 'person',
      organization_name: (contact.organization_name || contact.institution || '').trim(),
      role: contact.role || '',
      area_of_work: contact.area_of_work || '',
      email: contact.email || '',
      phone: contact.phone || '',
      linkedin: contact.linkedin || '',
      notes: contact.notes || '',
      connection_strength: clampScore(contact.connection_strength, 1, 5, 3),
      tags: asArray(contact.tags),
      // contact_professional
      outreach_status: outreach,
      outreach_channel: contact.outreach_channel || '',
      relevance_for_phd: clampScore(contact.relevance_for_phd, 0, 5, 0),
      relevance_for_job: clampScore(contact.relevance_for_job, 0, 5, 0),
      relevance_for_spinoff: clampScore(contact.relevance_for_spinoff, 0, 5, 0),
      relevance_notes: contact.relevance_notes || '',
    },
    errors,
  };
}

// Valida o JSON completo de importação. Aceita string ou objeto. Retorna um
// relatório de validação (NÃO grava): por item (valid/data/errors) + sumário.
export function parseImportJSON(jsonData) {
  let parsed = jsonData;
  if (typeof jsonData === 'string') {
    try {
      parsed = JSON.parse(jsonData);
    } catch (e) {
      return {
        valid: false,
        source_description: '',
        organizations: [],
        contacts: [],
        summary: { totalOrgs: 0, validOrgs: 0, totalContacts: 0, validContacts: 0, errorCount: 1 },
        errors: [`JSON inválido: ${String(e.message || e)}`],
      };
    }
  }

  const topErrors = [];
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      valid: false,
      source_description: '',
      organizations: [],
      contacts: [],
      summary: { totalOrgs: 0, validOrgs: 0, totalContacts: 0, validContacts: 0, errorCount: 1 },
      errors: ['O JSON deve ser um objeto com organizations e/ou contacts'],
    };
  }

  const rawOrgs = Array.isArray(parsed.organizations) ? parsed.organizations : [];
  const rawContacts = Array.isArray(parsed.contacts) ? parsed.contacts : [];

  const organizations = rawOrgs.map((o, i) => ({ index: i, raw: o, ...validateOrganization(o) }));
  const contacts = rawContacts.map((c, i) => ({ index: i, raw: c, ...validateContact(c) }));

  if (rawOrgs.length === 0 && rawContacts.length === 0) {
    topErrors.push('Nenhuma organização ou contato encontrado no JSON');
  }

  const validOrgs = organizations.filter((o) => o.valid).length;
  const validContacts = contacts.filter((c) => c.valid).length;
  const errorCount =
    topErrors.length +
    organizations.reduce((a, o) => a + o.errors.length, 0) +
    contacts.reduce((a, c) => a + c.errors.length, 0);

  return {
    valid: topErrors.length === 0 && (validOrgs > 0 || validContacts > 0),
    source_description: parsed.source_description || '',
    organizations,
    contacts,
    summary: {
      totalOrgs: organizations.length,
      validOrgs,
      totalContacts: contacts.length,
      validContacts,
      errorCount,
    },
    errors: topErrors,
  };
}
