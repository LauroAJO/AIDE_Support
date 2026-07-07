import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, X, Pencil, Linkedin, Mail, Loader2, GraduationCap, Briefcase, Rocket, Clock, Search, Users,
} from 'lucide-react';
import { useStore } from '../../store';
import { apiFetch } from '../../lib/api';
import LoadingSpinner from '../shared/LoadingSpinner';
import Avatar from '../shared/Avatar';
import {
  StarRating, OutreachBadge, OUTREACH_LABELS, OUTREACH_ORDER, parseTags,
} from './marketShared';

// Pequenos ícones coloridos de relevância (PhD / Emprego / Spin-off).
function RelevanceIcons({ p }) {
  const items = [
    { Icon: GraduationCap, val: p.relevance_for_phd, color: 'text-indigo-500', title: 'PhD' },
    { Icon: Briefcase, val: p.relevance_for_job, color: 'text-blue-500', title: 'Emprego' },
    { Icon: Rocket, val: p.relevance_for_spinoff, color: 'text-emerald-500', title: 'Spin-off' },
  ];
  return (
    <span className="flex items-center gap-2">
      {items.filter((i) => Number(i.val) > 0).map(({ Icon, val, color, title }) => (
        <span key={title} title={title} className={`flex items-center gap-0.5 text-[11px] font-medium ${color}`}>
          <Icon className="h-3.5 w-3.5" />{val}
        </span>
      ))}
    </span>
  );
}

export default function ContactsProView({ initialContactId = null }) {
  const contacts = useStore((s) => s.marketContacts);
  const setContacts = useStore((s) => s.setMarketContacts);

  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editor, setEditor] = useState(null);
  const [interactionFor, setInteractionFor] = useState(null);
  const [addOpen, setAddOpen] = useState(false);

  const load = async () => {
    try {
      setContacts(await apiFetch('/api/market/contacts'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openDetail = async (personId) => {
    setSelectedId(personId);
    setDetailLoading(true);
    try {
      setDetail(await apiFetch(`/api/market/contacts/${personId}`));
    } catch {
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  // Etapa 6 — abre direto o contato indicado pela navegação vinda do Networking.
  useEffect(() => {
    if (initialContactId) openDetail(initialContactId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialContactId]);

  const filtered = useMemo(() => {
    let list = [...contacts];
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((c) => (c.person_name || '').toLowerCase().includes(q) || (c.organization_name || '').toLowerCase().includes(q));
    if (statusFilter) list = list.filter((c) => c.outreach_status === statusFilter);
    return list;
  }, [contacts, search, statusFilter]);

  // Persiste uma alteração parcial no contact_professional e recarrega.
  const patchProfessional = async (personId, patch) => {
    await apiFetch(`/api/market/contacts/${personId}/professional`, { method: 'PUT', body: JSON.stringify(patch) });
    await load();
    if (selectedId === personId) openDetail(personId);
  };

  if (loading) return <div className="h-full"><LoadingSpinner label="Carregando contatos..." /></div>;

  return (
    <div className="flex h-full flex-col gap-4 lg:flex-row">
      {/* LEFT — lista */}
      <div className="flex min-h-0 flex-col gap-3 lg:w-[40%]">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar contatos..." className="input pl-9" />
          </div>
          <button type="button" onClick={() => setAddOpen(true)} className="flex items-center gap-1 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white transition hover:opacity-90">
            <Plus className="h-4 w-4" /> Contato
          </button>
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-lg border border-line bg-surface2 px-2 py-1.5 text-xs text-ink2">
          <option value="">Todos os status</option>
          {OUTREACH_ORDER.map((s) => <option key={s} value={s}>{OUTREACH_LABELS[s]}</option>)}
        </select>

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
          {filtered.length === 0 && <p className="px-1 text-sm text-muted">Nenhum contato profissional. Use o botão "Contato" ou a Importação em massa.</p>}
          {filtered.map((c) => (
            <button
              key={c.person_id}
              type="button"
              onClick={() => openDetail(c.person_id)}
              className={`flex w-full items-start gap-3 rounded-xl border bg-surface p-3 text-left transition hover:border-accent ${
                selectedId === c.person_id ? 'border-accent shadow-soft' : 'border-line'
              }`}
            >
              <Avatar user={{ name: c.person_name }} size={36} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold text-ink">{c.person_name || '—'}</div>
                <div className="truncate text-xs text-muted">{c.organization_name || 'Sem organização'}</div>
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <OutreachBadge status={c.outreach_status} />
                  <RelevanceIcons p={c} />
                </div>
                {c.next_action && (
                  <div className="mt-1 flex items-center gap-1 text-[11px] text-amber-600">
                    <Clock className="h-3 w-3" />{c.next_action}{c.next_action_date ? ` · ${c.next_action_date}` : ''}
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* RIGHT — detalhe */}
      <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-line bg-surface p-5">
        {!selectedId && <div className="flex h-full items-center justify-center text-muted">Selecione um contato</div>}
        {selectedId && detailLoading && <LoadingSpinner label="Carregando..." />}
        {selectedId && !detailLoading && detail && (
          <ContactDetail
            data={detail}
            onEdit={() => setEditor(detail)}
            onRegister={() => setInteractionFor(detail.person.id)}
            onChangeStatus={(status) => patchProfessional(detail.person.id, { outreach_status: status })}
            onChangeRelevance={(field, val) => patchProfessional(detail.person.id, { [field]: val })}
          />
        )}
      </div>

      {editor && <ProfessionalEditor data={editor} onClose={() => setEditor(null)} onSaved={() => { setEditor(null); load(); openDetail(editor.person.id); }} />}
      {interactionFor && <InteractionModal personId={interactionFor} onClose={() => setInteractionFor(null)} onSaved={() => { setInteractionFor(null); openDetail(interactionFor); }} />}
      {addOpen && <AddProfessionalModal onClose={() => setAddOpen(false)} onCreated={(pid) => { setAddOpen(false); load(); openDetail(pid); }} />}
    </div>
  );
}

function ContactDetail({ data, onEdit, onRegister, onChangeStatus, onChangeRelevance }) {
  const navigate = useNavigate();
  const { person, professional, org_links: orgLinks } = data;
  const prof = professional || {};
  const tags = parseTags(person.tags);
  const history = parseTags(prof.interaction_history);
  const linkedin = prof.confirmed_linkedin || person.linkedin;
  const email = prof.confirmed_email || person.email;
  const projects = (orgLinks || []).filter((l) => l.project_name);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Avatar user={{ name: person.name }} size={48} />
          <div>
            <h2 className="text-xl font-bold text-ink">{person.name}</h2>
            {person.role && <div className="text-sm text-muted">{person.role}</div>}
          </div>
        </div>
        <button type="button" onClick={onEdit} className="flex items-center gap-1 rounded-lg border border-line px-3 py-1.5 text-sm text-ink2 hover:bg-surface2">
          <Pencil className="h-4 w-4" /> Editar
        </button>
      </div>

      {/* Organizações vinculadas */}
      <div className="flex flex-wrap gap-1.5">
        {(orgLinks || []).map((l) => (
          <span key={l.id} className="rounded-full bg-accent/10 px-2.5 py-0.5 text-xs font-medium text-accent">
            {l.organization_name}{l.role_at_org ? ` · ${l.role_at_org}` : ''}
          </span>
        ))}
        {(orgLinks || []).length === 0 && <span className="text-xs text-muted">Sem organização vinculada</span>}
      </div>

      {/* Ações rápidas */}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onRegister} className="flex items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90">
          <Plus className="h-4 w-4" /> Registrar Contato
        </button>
        <a
          href={linkedin ? (linkedin.startsWith('http') ? linkedin : `https://${linkedin}`) : undefined}
          target="_blank" rel="noreferrer"
          className={`flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm ${linkedin ? 'border-line text-ink2 hover:bg-surface2' : 'border-line text-muted opacity-50 pointer-events-none'}`}
        >
          <Linkedin className="h-4 w-4" /> Abrir LinkedIn
        </a>
        <a
          href={email ? `mailto:${email}` : undefined}
          className={`flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm ${email ? 'border-line text-ink2 hover:bg-surface2' : 'border-line text-muted opacity-50 pointer-events-none'}`}
        >
          <Mail className="h-4 w-4" /> Enviar Email
        </a>
      </div>

      {/* Ver no Networking — link inverso Mercado → Networking (bidirecional).
          person.id é o network_people.id (referenciado por contact_professional). */}
      <button
        type="button"
        onClick={() => navigate('/networking', { state: { contactId: person.id } })}
        className="flex items-center gap-1.5 rounded-lg border border-indigo-300 px-3 py-1.5 text-sm font-medium text-indigo-700 transition hover:bg-indigo-50"
      >
        <Users className="h-4 w-4" /> Ver no Networking
      </button>

      {/* Status de outreach */}
      <div>
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">Status de outreach</span>
        <div className="mt-1.5 flex items-center gap-2">
          <OutreachBadge status={prof.outreach_status} />
          <select
            value={prof.outreach_status || 'not_contacted'}
            onChange={(e) => onChangeStatus(e.target.value)}
            className="rounded-lg border border-line bg-surface2 px-2 py-1 text-xs text-ink2"
          >
            {OUTREACH_ORDER.map((s) => <option key={s} value={s}>{OUTREACH_LABELS[s]}</option>)}
          </select>
        </div>
      </div>

      {/* Relevâncias editáveis */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <RelevanceRow label="PhD" value={prof.relevance_for_phd} onChange={(v) => onChangeRelevance('relevance_for_phd', v)} />
        <RelevanceRow label="Emprego" value={prof.relevance_for_job} onChange={(v) => onChangeRelevance('relevance_for_job', v)} />
        <RelevanceRow label="Spin-off" value={prof.relevance_for_spinoff} onChange={(v) => onChangeRelevance('relevance_for_spinoff', v)} />
      </div>

      {/* Próxima ação */}
      {(prof.next_action || prof.next_action_date) && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <Clock className="mr-1 inline h-4 w-4" />
          {prof.next_action || 'Próxima ação'}{prof.next_action_date ? ` · ${prof.next_action_date}` : ''}
        </div>
      )}

      {/* Histórico de interações */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Histórico de interações</h3>
          <button type="button" onClick={onRegister} className="flex items-center gap-1 text-xs font-medium text-accent hover:underline">
            <Plus className="h-3.5 w-3.5" /> Registrar interação
          </button>
        </div>
        {history.length === 0 ? <p className="text-sm text-muted">Nenhuma interação registrada.</p> : (
          <ul className="space-y-2">
            {history.slice().reverse().map((h, i) => (
              <li key={i} className="rounded-lg border border-line px-3 py-2 text-sm">
                <div className="flex items-center gap-2 text-xs text-muted">
                  <span>{h.date || '—'}</span>
                  {h.type && <span className="rounded bg-surface2 px-1.5 py-0.5">{h.type}</span>}
                </div>
                {h.notes && <div className="mt-1 text-ink2">{h.notes}</div>}
              </li>
            ))}
          </ul>
        )}
      </div>

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((t) => <span key={t} className="rounded bg-surface2 px-2 py-0.5 text-xs text-ink2">{t}</span>)}
        </div>
      )}

      {(prof.notes || person.notes) && (
        <div>
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">Notas</span>
          <p className="mt-1 text-sm text-ink2">{prof.notes || person.notes}</p>
        </div>
      )}

      {projects.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Projetos vinculados</h3>
          <ul className="space-y-1.5">
            {projects.map((l) => <li key={l.id} className="rounded-lg border border-line px-3 py-2 text-sm text-ink">{l.project_name}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

function RelevanceRow({ label, value, onChange }) {
  return (
    <div className="rounded-lg border border-line px-3 py-2">
      <div className="mb-1 text-xs font-medium text-ink2">{label}</div>
      <StarRating value={value} size={16} onChange={onChange} />
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-ink2">{label}</span>
      {children}
    </label>
  );
}

function ProfessionalEditor({ data, onClose, onSaved }) {
  const prof = data.professional || {};
  const [form, setForm] = useState({
    outreach_channel: prof.outreach_channel || '',
    last_contact_date: prof.last_contact_date || '',
    next_action: prof.next_action || '',
    next_action_date: prof.next_action_date || '',
    confirmed_email: prof.confirmed_email || '',
    confirmed_linkedin: prof.confirmed_linkedin || '',
    notes: prof.notes || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      await apiFetch(`/api/market/contacts/${data.person.id}/professional`, { method: 'PUT', body: JSON.stringify(form) });
      onSaved();
    } catch (e) {
      setError(String(e.message || e));
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div className="flex h-full w-full flex-col bg-surface shadow-soft sm:max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-base font-bold text-ink">Editar contato — {data.person.name}</h2>
          <button onClick={onClose} className="rounded-md p-1 text-ink2 hover:bg-surface2"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {error && <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">{error}</div>}
          <Field label="Canal de contato"><input value={form.outreach_channel} onChange={(e) => set({ outreach_channel: e.target.value })} className="input" placeholder="linkedin | email | evento | indicação" /></Field>
          <Field label="Último contato (data)"><input value={form.last_contact_date} onChange={(e) => set({ last_contact_date: e.target.value })} className="input" placeholder="2026-06-25" /></Field>
          <Field label="Próxima ação"><input value={form.next_action} onChange={(e) => set({ next_action: e.target.value })} className="input" /></Field>
          <Field label="Data da próxima ação"><input value={form.next_action_date} onChange={(e) => set({ next_action_date: e.target.value })} className="input" placeholder="2026-07-01" /></Field>
          <Field label="Email confirmado"><input value={form.confirmed_email} onChange={(e) => set({ confirmed_email: e.target.value })} className="input" /></Field>
          <Field label="LinkedIn confirmado"><input value={form.confirmed_linkedin} onChange={(e) => set({ confirmed_linkedin: e.target.value })} className="input" /></Field>
          <Field label="Notas"><textarea value={form.notes} onChange={(e) => set({ notes: e.target.value })} className="input min-h-[70px]" /></Field>
        </div>
        <div className="flex justify-end gap-2 border-t border-line px-4 py-3">
          <button type="button" onClick={onClose} className="rounded-lg border border-line px-4 py-2 text-sm text-ink2 hover:bg-surface2">Cancelar</button>
          <button type="button" onClick={save} disabled={saving} className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Salvar
          </button>
        </div>
      </div>
    </div>
  );
}

function InteractionModal({ personId, onClose, onSaved }) {
  const [form, setForm] = useState({ date: '', type: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      await apiFetch(`/api/market/contacts/${personId}/professional`, {
        method: 'PUT',
        body: JSON.stringify({ interaction: { date: form.date, type: form.type, notes: form.notes } }),
      });
      onSaved();
    } catch (e) {
      setError(String(e.message || e));
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-surface p-5 shadow-soft" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold text-ink">Registrar interação</h2>
          <button onClick={onClose} className="rounded-md p-1 text-ink2 hover:bg-surface2"><X className="h-5 w-5" /></button>
        </div>
        {error && <div className="mb-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">{error}</div>}
        <div className="space-y-3">
          <Field label="Data"><input value={form.date} onChange={(e) => set({ date: e.target.value })} className="input" placeholder="2026-06-25 (vazio = hoje)" /></Field>
          <Field label="Tipo"><input value={form.type} onChange={(e) => set({ type: e.target.value })} className="input" placeholder="email | reunião | mensagem" /></Field>
          <Field label="Notas"><textarea value={form.notes} onChange={(e) => set({ notes: e.target.value })} className="input min-h-[70px]" /></Field>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-line px-4 py-2 text-sm text-ink2 hover:bg-surface2">Cancelar</button>
          <button type="button" onClick={save} disabled={saving} className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Salvar
          </button>
        </div>
      </div>
    </div>
  );
}

// Cria um registro profissional para uma pessoa existente em network_people.
function AddProfessionalModal({ onClose, onCreated }) {
  const [people, setPeople] = useState([]);
  const [personId, setPersonId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch('/api/network/people').then((rows) => setPeople(rows || [])).catch(() => setPeople([]));
  }, []);

  const create = async () => {
    if (!personId) { setError('Selecione uma pessoa'); return; }
    setSaving(true);
    setError('');
    try {
      await apiFetch(`/api/market/contacts/${personId}/professional`, {
        method: 'POST',
        body: JSON.stringify({ outreach_status: 'not_contacted' }),
      });
      onCreated(personId);
    } catch (e) {
      setError(String(e.message || e));
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-surface p-5 shadow-soft" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold text-ink">Adicionar contato profissional</h2>
          <button onClick={onClose} className="rounded-md p-1 text-ink2 hover:bg-surface2"><X className="h-5 w-5" /></button>
        </div>
        {error && <div className="mb-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">{error}</div>}
        <p className="mb-3 text-xs text-muted">Escolha uma pessoa já existente no Networking para adicionar contexto profissional (Mercado).</p>
        <Field label="Pessoa">
          <select value={personId} onChange={(e) => setPersonId(e.target.value)} className="input">
            <option value="">— Selecione —</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-line px-4 py-2 text-sm text-ink2 hover:bg-surface2">Cancelar</button>
          <button type="button" onClick={create} disabled={saving} className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Criar
          </button>
        </div>
      </div>
    </div>
  );
}
