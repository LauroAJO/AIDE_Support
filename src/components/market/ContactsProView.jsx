import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, X, Loader2, GraduationCap, Briefcase, Rocket, Clock, Search,
} from 'lucide-react';
import { useStore } from '../../store';
import { apiFetch } from '../../lib/api';
import LoadingSpinner from '../shared/LoadingSpinner';
import Avatar from '../shared/Avatar';
import {
  OutreachBadge, OUTREACH_LABELS, OUTREACH_ORDER,
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
  const navigate = useNavigate();
  const contacts = useStore((s) => s.marketContacts);
  const setContacts = useStore((s) => s.setMarketContacts);

  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedId, setSelectedId] = useState(null);
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

  // Seleciona o contato — o painel direito é apenas um redirect para o
  // Networking, onde vive o perfil completo. Não há mais fetch de detalhe aqui.
  const openDetail = (personId) => {
    setSelectedId(personId);
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

      {/* RIGHT — redirect para o Networking (o perfil completo vive lá). */}
      <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-line bg-surface p-5">
        {!selectedId ? (
          <div className="flex h-full items-center justify-center text-muted">Selecione um contato</div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <p className="text-sm font-medium text-ink">Ver perfil completo em Networking</p>
            <button
              type="button"
              onClick={() => navigate('/networking', { state: { contactId: selectedId } })}
              className="flex items-center gap-2 rounded-xl bg-accent px-6 py-3 text-base font-semibold text-white transition hover:bg-accent-hover"
            >
              Ver no Networking →
            </button>
            <p className="text-xs text-muted">O perfil completo está disponível na aba Networking</p>
          </div>
        )}
      </div>

      {addOpen && <AddProfessionalModal onClose={() => setAddOpen(false)} onCreated={(pid) => { setAddOpen(false); load(); openDetail(pid); }} />}
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
