-- ════════════════════════════════════════════════════════════════════════
--  koine-study — Seed do Antigo Testamento (39 livros) + versão original
--  hebraica (WLC).
--
--  Objetivo: o app passa a cobrir a Bíblia inteira. A coluna "Original" é
--  resolvida por testamento — grego (grc-sblgnt) para o NT, hebraico
--  (hbo-wlc) para o AT — mas apresentada como UMA versão lógica na UI.
--
--  Ordenação: o AT precede o NT. Como `id` já é canônico (AT 1–39, NT 40–66),
--  alinhamos `sort_order` ao `id` em ambos os testamentos — o NT existente
--  (sort_order 1–27) é reordenado para 40–66.
--
--  Idempotente: ON CONFLICT atualiza, então rodar de novo é seguro.
-- ════════════════════════════════════════════════════════════════════════

-- 39 livros do AT (cânon protestante). name_grc fica null (título original
-- hebraico será preenchido numa etapa posterior, junto da interlinear).
insert into public.books (id, osis_code, name_pt, name_grc, testament, sort_order) values
  (1,  'Gen',  'Gênesis',        null, 'OT', 1),
  (2,  'Exod', 'Êxodo',          null, 'OT', 2),
  (3,  'Lev',  'Levítico',       null, 'OT', 3),
  (4,  'Num',  'Números',        null, 'OT', 4),
  (5,  'Deut', 'Deuteronômio',   null, 'OT', 5),
  (6,  'Josh', 'Josué',          null, 'OT', 6),
  (7,  'Judg', 'Juízes',         null, 'OT', 7),
  (8,  'Ruth', 'Rute',           null, 'OT', 8),
  (9,  '1Sam', '1 Samuel',       null, 'OT', 9),
  (10, '2Sam', '2 Samuel',       null, 'OT', 10),
  (11, '1Kgs', '1 Reis',         null, 'OT', 11),
  (12, '2Kgs', '2 Reis',         null, 'OT', 12),
  (13, '1Chr', '1 Crônicas',     null, 'OT', 13),
  (14, '2Chr', '2 Crônicas',     null, 'OT', 14),
  (15, 'Ezra', 'Esdras',         null, 'OT', 15),
  (16, 'Neh',  'Neemias',        null, 'OT', 16),
  (17, 'Esth', 'Ester',          null, 'OT', 17),
  (18, 'Job',  'Jó',             null, 'OT', 18),
  (19, 'Ps',   'Salmos',         null, 'OT', 19),
  (20, 'Prov', 'Provérbios',     null, 'OT', 20),
  (21, 'Eccl', 'Eclesiastes',    null, 'OT', 21),
  (22, 'Song', 'Cânticos',       null, 'OT', 22),
  (23, 'Isa',  'Isaías',         null, 'OT', 23),
  (24, 'Jer',  'Jeremias',       null, 'OT', 24),
  (25, 'Lam',  'Lamentações',    null, 'OT', 25),
  (26, 'Ezek', 'Ezequiel',       null, 'OT', 26),
  (27, 'Dan',  'Daniel',         null, 'OT', 27),
  (28, 'Hos',  'Oséias',         null, 'OT', 28),
  (29, 'Joel', 'Joel',           null, 'OT', 29),
  (30, 'Amos', 'Amós',           null, 'OT', 30),
  (31, 'Obad', 'Obadias',        null, 'OT', 31),
  (32, 'Jonah','Jonas',          null, 'OT', 32),
  (33, 'Mic',  'Miquéias',       null, 'OT', 33),
  (34, 'Nah',  'Naum',           null, 'OT', 34),
  (35, 'Hab',  'Habacuque',      null, 'OT', 35),
  (36, 'Zeph', 'Sofonias',       null, 'OT', 36),
  (37, 'Hag',  'Ageu',           null, 'OT', 37),
  (38, 'Zech', 'Zacarias',       null, 'OT', 38),
  (39, 'Mal',  'Malaquias',      null, 'OT', 39)
on conflict (id) do update set
  osis_code  = excluded.osis_code,
  name_pt    = excluded.name_pt,
  testament  = excluded.testament,
  sort_order = excluded.sort_order;

-- Reordena o NT existente para 40–66, alinhando sort_order ao id canônico.
update public.books set sort_order = id where testament = 'NT';

-- Versão original hebraica. is_original = true: a coluna "Original" do AT
-- renderiza esta versão. sort_order 1 mantém os originais (grc=0, hbo=1) com
-- maior precedência na escolha do ref canônico.
insert into public.translations
  (code, name, language, license, source_url, text_type, is_original, sort_order) values
  ('hbo-wlc', 'Westminster Leningrad Codex', 'hbo', 'CC BY 4.0',
   'https://github.com/openscriptures/morphhb', 'critical', true, 1)
on conflict (code) do update set
  name        = excluded.name,
  language    = excluded.language,
  license     = excluded.license,
  source_url  = excluded.source_url,
  text_type   = excluded.text_type,
  is_original = excluded.is_original,
  sort_order  = excluded.sort_order;
