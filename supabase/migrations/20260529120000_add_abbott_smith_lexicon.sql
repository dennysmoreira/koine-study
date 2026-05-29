-- Adiciona a entrada do léxico Abbott-Smith ("A Manual Greek Lexicon of the New
-- Testament", G. Abbott-Smith, 1922 — domínio público) à tabela de lemmas.
-- Indexada pela MESMA chave de Strong's já usada pelo Dodson, então não altera o
-- linking token→lemma; serve como entrada de exegese (mais rica que a glosa curta
-- do Dodson) no painel do leitor. Fonte TEI: translatable-exegetical-tools/Abbott-Smith.
alter table public.lemmas
  add column if not exists abbott_smith text;

comment on column public.lemmas.abbott_smith is
  'Entrada do léxico Abbott-Smith (1922, domínio público), texto limpo extraído do TEI; chaveada por Strong''s.';
