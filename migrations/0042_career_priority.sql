-- Campo is_priority em career_opportunities: marca cards do Kanban de
-- Carreira como prioritários (estrela na UI), fazendo-os aparecer no topo
-- do grupo (normal ou EC) dentro de cada coluna, antes da ordenação escolhida.
ALTER TABLE career_opportunities ADD COLUMN is_priority INTEGER DEFAULT 0;
