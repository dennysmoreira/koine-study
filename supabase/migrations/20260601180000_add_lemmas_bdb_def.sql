-- Definicao do lexico BDB (Brown-Driver-Briggs) para os lemas hebraicos.
-- O Strong's (gloss_en/gloss_pt) da so uma glosa curta; o BDB e o melhor lexico
-- academico de dominio publico para hebraico biblico. Guardamos aqui a definicao
-- concisa (as glosas <def> do artigo BDB) para enriquecer o painel da palavra no
-- interlinear do AT. Coluna especifica de lexico, no mesmo espirito de abbott_smith.
-- Fonte: openscriptures/HebrewLexicon (CC BY 4.0), mapeada por Strong's via LexicalIndex.
alter table public.lemmas
  add column if not exists bdb_def text;
