-- Remove a coluna de licença das versões. O catálogo de traduções deixa de
-- armazenar e exibir texto de licença (decisão de produto). Os scripts de
-- ETL e o leitor param de ler/gravar esse campo.
alter table public.translations
  drop column if exists license;
