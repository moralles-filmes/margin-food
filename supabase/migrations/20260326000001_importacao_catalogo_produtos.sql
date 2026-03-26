-- =========================================================
-- IMPORTAÇÃO CATÁLOGO DE PRODUTOS
-- Data: 2026-03-26
-- Origem: catalogo_produtos.csv
-- =========================================================

-- Desabilitar RLS e triggers de usuário temporariamente para import via migration
ALTER TABLE public.stock_categories DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_locations  DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.produtos          DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.produtos          DISABLE TRIGGER USER;

-- 1. CATEGORIAS DE ESTOQUE
DO $$
DECLARE
  v_company_id uuid;
BEGIN
  SELECT id INTO v_company_id FROM public.companies
  WHERE id != '00000000-0000-0000-0000-000000000001'::uuid LIMIT 1;
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Nenhuma empresa encontrada na tabela companies';
  END IF;

  INSERT INTO public.stock_categories (name, sort_order, is_active, company_id)
  SELECT t.name, t.ord, true, v_company_id
  FROM (VALUES
    ('Bebidas', 1),
    ('Bebidas Quentes', 2),
    ('Cervejas', 3),
    ('Descartáveis', 4),
    ('Embalagens', 5),
    ('Frutos Do Mar', 6),
    ('Funcionários', 7),
    ('Hortifruti', 8),
    ('Insumos', 9),
    ('Limpeza', 10),
    ('Líquidos', 11),
    ('Molhos', 12),
    ('Oriental', 13),
    ('Outros', 14),
    ('Peixes', 15),
    ('Proteínas', 16),
    ('Refrigerantes', 17),
    ('Secos', 18),
    ('Sobremesa', 19),
    ('Temperos', 20),
    ('Vinhos e Espumantes', 21)
  ) AS t(name, ord)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.stock_categories sc
    WHERE lower(sc.name) = lower(t.name) AND sc.company_id = v_company_id
  );
END $$;

-- 2. LOCAIS DE ESTOQUE
DO $$
DECLARE
  v_company_id uuid;
BEGIN
  SELECT id INTO v_company_id FROM public.companies
  WHERE id != '00000000-0000-0000-0000-000000000001'::uuid LIMIT 1;
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Nenhuma empresa encontrada na tabela companies';
  END IF;

  INSERT INTO public.stock_locations (name, type, is_active, company_id)
  SELECT t.name, t.tp, true, v_company_id
  FROM (VALUES
    ('Estoque Seco',        'seco'),
    ('Bar',                 'bar'),
    ('Câmara Fria',         'refrigerado'),
    ('Câmara Congelada',    'congelado'),
    ('Material de Limpeza', 'seco'),
    ('Estoque De Embalagem','seco'),
    ('Depósito',            'seco')
  ) AS t(name, tp)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.stock_locations sl
    WHERE lower(sl.name) = lower(t.name) AND sl.company_id = v_company_id
  );
END $$;

-- 3. PRODUTOS
DO $$
DECLARE
  v_company_id uuid;
  v_inserted   int;
BEGIN
  SELECT id INTO v_company_id FROM public.companies
  WHERE id != '00000000-0000-0000-0000-000000000001'::uuid LIMIT 1;
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Nenhuma empresa encontrada na tabela companies';
  END IF;

  INSERT INTO public.produtos (
    nome_produto, sku, categoria, unidade_medida, unidade_compra,
    fator_conversao_padrao, custo_padrao, default_cost_purchase_unit, default_cost_base_unit,
    estoque_minimo, estoque_ideal, local_estoque, lead_time_dias, ativo, observacoes,
    package_quantity, package_measure_unit, conversion_mode, conta_no_cmv,
    inactivity_days_threshold, fornecedores_preferenciais, company_id
  )
  SELECT
    trim(t.nome), t.sku, t.cat, t.um, t.uc,
    t.fator, t.custo, t.dcpu, t.dcbu,
    t.est_min, t.est_ide,
    NULLIF(trim(t.local_est), ''),
    t.lead, t.ativo,
    NULLIF(trim(t.obs), ''),
    t.pkg_qty, NULLIF(trim(t.pkg_unit), ''),
    t.conv_mode, t.cmv,
    t.inact, '{}'::text[], v_company_id
  FROM (VALUES
    -- BEBIDAS
    ('Agua Mineral com gas',              'MP-0011','Bebidas',         'UN','Fardo',  12::numeric,  40.20::numeric, 40.20::numeric,  3.35::numeric,   60::numeric, 168::numeric,'Estoque Seco',  1::int,true ,'',   NULL::numeric,NULL::text,'manual',true ,NULL::numeric),
    ('Agua Sem Gás',                      'MP-0012','Bebidas',         'UN','Fardo',  12,           37.44,          37.44,           3.12,            60,          168,         'Estoque Seco',  1,    true ,'',   NULL,         NULL,      'manual',true ,NULL),
    ('Aperol',                            'MP-0017','Bebidas',         'L', 'L',       1,           57.40,          57.40,          57.40,             1,            3,         'Bar',           1,    true ,'',   NULL,         NULL,      'manual',true ,NULL),
    ('Café em Grão',                      'MP-0043','Bebidas',         'KG','Pacote',  1,           89.90,          89.90,          89.90,             1,            2,         'Estoque Seco',  1,    true ,'',   NULL,         NULL,      'manual',true ,NULL),
    ('Cerveja Budweiser 600',             'MP-0054','Bebidas',         'UN','UN',      1,            5.66,           5.66,           5.66,            10,           24,         'Bar',           1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Flavor House  Sabor Iced Tea 1',    'MP-0101','Bebidas',         'KG','Pacote',  1,          310.00,         310.00,         310.00,             1,            3,         'Estoque Seco',  1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Flavor House Sabor Abacaxi',        'MP-0099','Bebidas',         'UN','UN',      1,           87.74,          87.74,          87.74,             1,            3,         'Estoque Seco',  1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Flavor House Sabor amora',          'MP-0100','Bebidas',         'UN','UN',      1,          113.55,         113.55,         113.55,             1,            2,         'Estoque Seco',  1,    true ,'',   NULL,         NULL,      'manual',true ,NULL),
    ('Flavor House Sabor Pink Limonade',  'MP-0102','Bebidas',         'UN','UN',      1,           80.00,          80.00,          80.00,             1,            3,         'Câmara Fria',   1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Soda Aguamix',                      'MP-0208','Bebidas',         'L', 'UN',      1.5,          9.50,           9.50,          6.3333,            3,            9,         'Câmara Congelada',1,  true ,'',   1500,         'ml',      'manual',true ,30),
    ('Vinho Branco Goes',                 'MP-0229','Bebidas',         'L', 'Galão',   0.74,        22.90,          22.90,         30.9459,            1,            3,         'Estoque Seco',  1,    true ,'',   740,          'ml',      'auto',  true ,30),
    ('Vinho Tinto GOes',                  'MP-0230','Bebidas',         'L', 'UN',      0.74,        18.90,          18.90,         25.5405,            2,            6,         'Estoque Seco',  1,    true ,'',   740,          'ml',      'auto',  true ,30),
    -- BEBIDAS QUENTES
    ('Buffallo Trace Wisk',               'MP-0038','Bebidas Quentes', 'UN','UN',      1,          173.50,         173.50,         173.50,             1,            1,         'Bar',           1,    true ,'',   NULL,         NULL,      'manual',true ,NULL),
    ('Cachaça Sagatiba',                  'MP-0039','Bebidas Quentes', 'UN','UN',      1,           22.18,          22.18,          22.18,             1,            3,         'Bar',           1,    true ,'',   NULL,         NULL,      'manual',true ,NULL),
    ('Cachaça Seleta',                    'MP-0040','Bebidas Quentes', 'UN','UN',      1,           68.00,          68.00,          68.00,             1,            3,         'Bar',           1,    true ,'',   NULL,         NULL,      'manual',true ,NULL),
    ('Cachaça Velho Barreiro',            'MP-0041','Bebidas Quentes', 'UN','UN',      1,           15.19,          15.19,          15.19,             1,            3,         'Bar',           1,    true ,'',   NULL,         NULL,      'manual',true ,NULL),
    ('Campari',                           'MP-0046','Bebidas Quentes', 'UN','UN',      1,           50.54,          50.54,          50.54,             1,            2,         'Bar',           1,    true ,'',   NULL,         NULL,      'manual',true ,NULL),
    ('Cinzano Vermouth',                  'MP-0066','Bebidas Quentes', 'UN','UN',      1,           44.50,          44.50,          44.50,             1,            2,         'Bar',           1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Conheque Presidente',               'MP-0075','Bebidas Quentes', 'UN','UN',      1,           14.55,          14.55,          14.55,             1,            2,         'Câmara Fria',   1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Gin Gordons',                       'MP-0112','Bebidas Quentes', 'L', 'L',       1,           59.26,          59.26,          59.26,             1,            4,         'Bar',           1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Gin Tanqueray',                     'MP-0113','Bebidas Quentes', 'L', 'L',       1,           88.57,          88.57,          88.57,             1,            3,         'Bar',           1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Licor 43',                          'MP-0128','Bebidas Quentes', 'L', 'L',       1,          143.12,         143.12,         143.12,             1,            4,         'Bar',           1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Licor Cointreau',                   'MP-0129','Bebidas Quentes', 'L', 'L',       1,          169.00,         169.00,         169.00,             1,            1,         'Bar',           1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Rum Bacardi',                       'MP-0184','Bebidas Quentes', 'UN','UN',      1,           40.59,          40.59,          40.59,             1,            1,         'Bar',           1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Rum Havana',                        'MP-0185','Bebidas Quentes', 'L', 'UN',      1,           93.75,          93.75,          93.75,             1,            1,         'Bar',           1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Stock Curaçau',                     'MP-0214','Bebidas Quentes', 'L', 'UN',      1,           21.00,          21.00,          21.00,             1,            1,         'Estoque Seco',  1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Tequila Jose Cuervo Prata',         'MP-0216','Bebidas Quentes', 'L', 'Garrafa', 1,          127.62,         127.62,         127.62,             1,            1,         'Estoque Seco',  1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Vodka Absolut',                     'MP-0231','Bebidas Quentes', 'L', 'UN',      1,           86.94,          86.94,          86.94,             1,            3,         'Bar',           1,    true ,'',   740,          'ml',      'manual',true ,30),
    ('Vodka Sminorff',                    'MP-0232','Bebidas Quentes', 'L', 'UN',      1,           28.89,          28.89,          28.89,             1,            4,         'Bar',           1,    true ,'',   740,          'ml',      'manual',true ,30),
    ('Whisky Black Label',                'MP-0235','Bebidas Quentes', 'L', 'UN',      1,          109.90,         109.90,         109.90,             1,            2,         'Bar',           1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Whisky Chivas',                     'MP-0234','Bebidas Quentes', 'L', 'UN',      1,          129.90,         129.90,         129.90,             1,            2,         'Bar',           1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Whisky Red Label',                  'MP-0236','Bebidas Quentes', 'L', 'UN',      1,           99.99,          99.99,          99.99,             1,            1,         'Bar',           1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    -- CERVEJAS
    ('Cerveja  Heineken Long Neck Zero',  'MP-0057','Cervejas',        'UN','UN',      1,            5.99,           5.99,           5.99,             4,           24,         'Bar',           1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Cerveja Budweiser Long Neck',       'MP-0061','Cervejas',        'UN','UN',      1,            4.80,           4.80,           4.80,             4,           12,         'Bar',           1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Cerveja Corona 600 ml',             'MP-0055','Cervejas',        'UN','UN',      1,            6.45,           6.45,           6.45,             4,           24,         'Bar',           1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Cerveja Corona Long Neck',          'MP-0056','Cervejas',        'UN','UN',      1,            5.39,           5.39,           5.39,             4,           24,         'Bar',           1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Cerveja Heineken 600',              'MP-0062','Cervejas',        'UN','UN',      1,            9.36,           9.36,           9.36,             2,           48,         'Bar',           1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Cerveja Heineken LongNeck',         'MP-0063','Cervejas',        'UN','UN',      1,            6.33,           6.33,           6.33,             4,           12,         'Bar',           1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Cerveja Original 600',              'MP-0058','Cervejas',        'UN','UN',      1,            6.51,           6.51,           6.51,             4,           48,         'Bar',           1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Cerveja Spaten 600',                'MP-0064','Cervejas',        'UN','UN',      1,            6.97,           6.97,           6.97,             4,           12,         'Bar',           1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Cerveja Stella Artois 600 ml',      'MP-0060','Cervejas',        'UN','UN',      1,            6.64,           6.64,           6.64,             5,           24,         'Bar',           1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Cerveja Stella Artois Pure Gold Longneck','MP-0059','Cervejas',  'UN','UN',      1,            5.63,           5.63,           5.63,             4,           12,         'Bar',           1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    -- DESCARTÁVEIS
    ('Canudo Mexedor para Saquerinha',    'MP-0047','Descartáveis',    'UN','Pacote', 100,           6.00,           6.00,           0.06,           100,          400,         'Estoque Seco',  0,    true ,'',   NULL,         NULL,      'manual',true ,NULL),
    ('Canudo para Suco Preto',            'MP-0048','Descartáveis',    'UN','Pacote', 100,           4.13,           4.13,          0.0413,          100,          300,         'Estoque Seco',  1,    true ,'',   NULL,         NULL,      'manual',true ,NULL),
    ('Clip Para Hashi',                   'MP-0067','Descartáveis',    'UN','Pacote',  1,           36.90,          36.90,          36.90,             1,            2,         'Estoque Seco',  1,    true ,'',   NULL,         NULL,      'manual',false,30),
    ('Guardanapos Pluma',                 'MP-0117','Descartáveis',    'UN','UN',      1,            4.59,           4.59,           4.59,            20,           80,         'Estoque Seco',  1,    true ,'',   NULL,         NULL,      'manual',false,30),
    ('Luvas Para Manipulação',            'MP-0133','Descartáveis',    'UN','UN',      1,           39.00,          39.00,          39.00,             1,            5,         'Material de Limpeza',1,true ,'', NULL,         NULL,      'manual',false,30),
    ('Papel Higienico Rolo',              'MP-0159','Descartáveis',    'UN','UN',      1,            3.73,           3.73,           3.73,             1,            3,         'Material de Limpeza',1,true ,'', NULL,         NULL,      'manual',false,30),
    ('Papel Toalha Rolo',                 'MP-0160','Descartáveis',    'UN','UN',      1,           14.83,          14.83,          14.83,             1,            5,         'Material de Limpeza',1,true ,'', NULL,         NULL,      'manual',true ,30),
    ('Perflex',                           'MP-0158','Descartáveis',    'UN','UN',      1,           84.00,          84.00,          84.00,             1,            4,         'Material de Limpeza',1,true ,'', NULL,         NULL,      'manual',false,30),
    ('Saco Virgem 15cm x 20 cm',          'MP-0191','Descartáveis',    'KG','Pacote',  1,           28.00,          28.00,          28.00,             1,            2,         'Estoque De Embalagem',1,true,'',NULL,         NULL,      'manual',false,30),
    ('Sacola Branca 40x50',               'MP-0188','Descartáveis',    'KG','Pacote',  1,           70.00,          70.00,          70.00,             1,            1,         'Estoque Seco',  1,    true ,'',   NULL,         NULL,      'manual',false,30),
    -- EMBALAGENS
    ('Bobina Picotada 20 X 30',           'MP-0032','Embalagens',      'UN','UN',      1,           23.10,          23.10,          23.10,             1,            3,         'Estoque Seco',  0,    true ,'',   NULL,         NULL,      'manual',false,NULL),
    ('Bobina Picotada 40 X 60',           'MP-0033','Embalagens',      'UN','UN',      1,           22.67,          22.67,          22.67,             1,            4,         'Estoque Seco',  1,    true ,'',   NULL,         NULL,      'manual',false,NULL),
    ('Bobina Termica 80 MM',              'MP-0034','Embalagens',      'UN','CX',      1,           14.00,          14.00,          14.00,             1,            2,         'Estoque Seco',  1,    true ,'',   NULL,         NULL,      'manual',false,NULL),
    ('Embalagem Isopor Teste',            '',        'Embalagens',     'UN','UN',      1,            1.50,           0.00,           0.00,             0,            0,         '',              1,    false,'',   NULL,         NULL,      'manual',true ,NULL),
    ('Filme Pvc',                         'MP-0098','Embalagens',      'UN','UN',      1,          109.44,         109.44,         109.44,             1,            4,         'Estoque Seco',  1,    true ,'',   NULL,         NULL,      'manual',false,30),
    ('Marmitex de Isopor 4 divisão',      'MP-0141','Embalagens',      'UN','Fardo', 100,           45.00,          45.00,           0.45,           100,          200,         'Estoque De Embalagem',1,true,'',NULL,         NULL,      'manual',true ,30),
    ('Marmitex de Isopor G',              'MP-0142','Embalagens',      'UN','Fardo', 100,           45.00,          45.00,           0.45,           100,          200,         'Estoque De Embalagem',1,true,'',NULL,         NULL,      'manual',true ,30),
    -- FRUTOS DO MAR
    ('Carne de Siri Mista',               'MP-0207','Frutos Do Mar',   'KG','KG',      1,           23.00,          23.00,          23.00,             3,           10,         'Câmara Congelada',1,  true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Lula',                              'MP-0132','Frutos Do Mar',   'KG','KG',      1,           51.84,          51.84,          51.84,             5,           40,         'Câmara Congelada',1,  true ,'',   NULL,         NULL,      'manual',true ,30),
    -- FUNCIONÁRIOS
    ('Café Funcionários',                 'MP-0042','Funcionários',    'UN','UN',      1,           28.35,          28.35,          28.35,             2,            7,         'Bar',           1,    true ,'',   NULL,         NULL,      'manual',false,NULL),
    ('Farinha De Mandioca',               'MP-0093','Funcionários',    'KG','KG',      1,            8.38,           8.38,           8.38,             1,            3,         'Estoque Seco',  1,    true ,'',   NULL,         NULL,      'manual',false,30),
    ('Feijão Preto',                      'MP-0097','Funcionários',    'KG','KG',      1,            5.50,           5.50,           5.50,             1,            4,         'Estoque Seco',  1,    true ,'',   NULL,         NULL,      'manual',false,30),
    ('Macarrão Espaguete',                'MP-0134','Funcionários',    'UN','UN',      1,            3.22,           3.22,           3.22,             1,            7,         'Estoque Seco',  1,    true ,'',   NULL,         NULL,      'manual',false,30),
    ('Margarina 500 Gramas',              'MP-0140','Funcionários',    'UN','UN',      1,            6.83,           6.83,           6.83,             1,            5,         'Estoque Seco',  1,    true ,'',   NULL,         NULL,      'manual',false,30),
    ('Molho de Pimenta vermelho',         'MP-0147','Funcionários',    'UN','UN',      1,            8.29,           8.29,           8.29,             1,            1,         'Estoque Seco',  1,    true ,'',   NULL,         NULL,      'manual',false,30),
    ('Óleo de Soja',                      'MP-0155','Funcionários',    'L', 'UN',      0.9,          9.03,           9.03,         10.0333,          1.8,         10.8,         'Estoque Seco',  1,    true ,'',   900,          'ml',      'auto',  false,30),
    ('Suco Funcionários',                 'MP-0182','Funcionários',    'UN','UN',      1,           12.19,          12.19,          12.19,             1,            7,         'Estoque Seco',  1,    true ,'',   NULL,         NULL,      'manual',false,30),
    -- HORTIFRUTI
    ('Abacaxi',                           'MP-0006','Hortifruti',      'UN','UN',      1,            8.00,           8.00,           8.00,             2,            5,         'Câmara Fria',   1,    true ,'',   NULL,         NULL,      'manual',true ,NULL),
    ('Abobora',                           'MP-0007','Hortifruti',      'KG','KG',      1,            7.64,           7.64,           7.64,             2,           10,         'Câmara Fria',   1,    true ,'',   NULL,         NULL,      'manual',true ,NULL),
    ('Alho Descascado',                   'MP-0015','Hortifruti',      'KG','KG',      1,           30.00,          30.00,          30.00,             1,            3,         'Câmara Fria',   1,    true ,'',   NULL,         NULL,      'manual',true ,NULL),
    ('Alho Poro',                         'MP-0022','Hortifruti',      'UN','Pacote',  1,            7.27,           7.27,           7.27,             1,            4,         'Câmara Fria',   1,    true ,'',   NULL,         NULL,      'manual',true ,NULL),
    ('Banana',                            'MP-0025','Hortifruti',      'KG','KG',      1,            4.97,           4.97,           4.97,             2,           15,         'Estoque Seco',  1,    true ,'',   NULL,         NULL,      'manual',true ,NULL),
    ('Batata Doce',                       'MP-0026','Hortifruti',      'KG','KG',      1,            4.08,           4.08,           4.08,             1,            4,         'Câmara Fria',   1,    true ,'',   NULL,         NULL,      'manual',true ,NULL),
    ('Beterraba',                         'MP-0027','Hortifruti',      'KG','KG',      1,            4.23,           4.23,           4.23,             1,            3,         'Câmara Fria',   1,    true ,'',   NULL,         NULL,      'manual',true ,NULL),
    ('Brocolis',                          'MP-0037','Hortifruti',      'UN','UN',      1,           10.30,          10.30,          10.30,             3,           10,         'Câmara Fria',   1,    true ,'',   NULL,         NULL,      'manual',true ,NULL),
    ('Cebola Branca',                     'MP-0049','Hortifruti',      'KG','KG',      1,            3.02,           3.02,           3.02,             1,            5,         'Câmara Fria',   1,    true ,'',   NULL,         NULL,      'manual',true ,NULL),
    ('Cebola Rocha',                      'MP-0051','Hortifruti',      'KG','KG',      1,            6.07,           6.07,           6.07,             1,            8,         'Câmara Fria',   1,    true ,'',   NULL,         NULL,      'manual',true ,NULL),
    ('Cebolinha',                         'MP-0052','Hortifruti',      'UN','UN',      1,           10.16,          10.16,          10.16,             1,            6,         'Câmara Fria',   1,    true ,'',   NULL,         NULL,      'manual',true ,NULL),
    ('Cenoura',                           'MP-0053','Hortifruti',      'KG','KG',      1,            3.51,           3.51,           3.51,             2,            6,         'Câmara Fria',   1,    true ,'',   NULL,         NULL,      'manual',true ,NULL),
    ('Chuchu',                            'MP-0065','Hortifruti',      'UN','UN',      1,            4.27,           4.27,           4.27,             4,           10,         'Câmara Fria',   1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Coentro',                           'MP-0073','Hortifruti',      'UN','UN',      1,           25.00,          25.00,          25.00,             1,            2,         'Câmara Fria',   1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Couve Manteiga',                    'MP-0237','Hortifruti',      'KG','Pacote',  1,            5.00,           5.00,           5.00,             3,           10,         'Câmara Fria',   1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Gengibre Raiz',                     'MP-0109','Hortifruti',      'KG','KG',      1,           13.00,          13.00,          13.00,             1,            2,         'Câmara Fria',   1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Laranja',                           'MP-0124','Hortifruti',      'KG','KG',      1,            3.75,           3.75,           3.75,             2,           15,         'Câmara Fria',   1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Limão Siciliano',                   'MP-0130','Hortifruti',      'KG','KG',      1,           13.69,          13.69,          13.69,             1,           10,         'Câmara Fria',   1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Limão Taiti',                       'MP-0131','Hortifruti',      'KG','KG',      1,            5.49,           5.49,           5.49,             1,            5,         'Câmara Fria',   1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Maracujá',                          'MP-0138','Hortifruti',      'KG','KG',      1,            9.46,           9.46,           9.46,             1,            4,         'Câmara Fria',   1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Morango',                           'MP-0148','Hortifruti',      'UN','Caixa',   1,           12.57,          12.57,          12.57,             3,            8,         'Câmara Fria',   1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Ovo',                               'MP-0156','Hortifruti',      'UN','UN',      1,            1.00,           1.00,           1.00,             2,           30,         'Câmara Fria',   1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Pepino Japonês',                    'MP-0164','Hortifruti',      'KG','KG',      1,            2.65,           2.65,           2.65,             2,           20,         'Câmara Fria',   1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Pimenta dedo de moça',              'MP-0173','Hortifruti',      'KG','KG',      1,           16.00,          16.00,          16.00,             1,            2,         'Câmara Fria',   1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Pimentão',                          'MP-0174','Hortifruti',      'KG','KG',      1,           12.00,          12.00,          12.00,             1,           10,         'Câmara Fria',   1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Repolho',                           'MP-0183','Hortifruti',      'KG','UN',      1,            2.82,           2.82,           2.82,             3,           15,         'Câmara Fria',   1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Salsão',                            'MP-0198','Hortifruti',      'KG','KG',      1,           11.00,          11.00,          11.00,             1,            2,         'Estoque Seco',  1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Salsinha',                          'MP-0199','Hortifruti',      'KG','KG',      1,           13.50,          13.50,          13.50,             2,            2,         'Estoque Seco',  1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Tomate',                            'MP-0218','Hortifruti',      'KG','KG',      1,            5.26,           5.26,           5.26,             1,            5,         'Câmara Fria',   1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Tomate Cereja',                     'MP-0219','Hortifruti',      'KG','KG',      1,           16.00,          16.00,          16.00,             2,            5,         'Câmara Fria',   1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    -- INSUMOS (testes/inativos)
    ('Açúcar Teste',                      '',        'Insumos',        'KG','UN',      1,            4.00,           0.00,           0.00,             0,            0,         '',              1,    false,'',   NULL,         NULL,      'manual',true ,NULL),
    ('Nori Teste',                        '',        'Insumos',        'UN','UN',      1,           25.00,           0.00,           0.00,             0,            0,         '',              1,    false,'',   NULL,         NULL,      'manual',true ,NULL),
    -- LIMPEZA
    ('Agua Sanitaria 1 L',                'MP-0013','Limpeza',         'UN','UN',      1,            4.55,           4.55,           4.55,             3,            7,         'Material de Limpeza',1,true ,'', NULL,         NULL,      'manual',false,NULL),
    ('Alcool Liquido 1l',                 'MP-0014','Limpeza',         'UN','UN',      1,            8.87,           8.87,           8.87,             3,            8,         'Material de Limpeza',1,true ,'', NULL,         NULL,      'manual',false,NULL),
    ('Cloro',                             'MP-0005','Limpeza',         'UN','UN',      1,            2.90,           2.90,           2.90,             1,            0,         'Depósito',      1,    false,'',   NULL,         NULL,      'manual',false,NULL),
    ('Desincrustante 5 L',                'MP-0078','Limpeza',         'L', 'Galão',   5,          114.00,         114.00,          22.80,             5,           10,         'Material de Limpeza',1,true ,'', NULL,         NULL,      'manual',false,30),
    ('Detergente',                        'MP-0004','Limpeza',         'UN','UN',      1,            2.00,           2.00,           2.00,             1,            0,         'Depósito',      1,    false,'',   NULL,         NULL,      'manual',false,NULL),
    ('Detergente 500 ml',                 'MP-0079','Limpeza',         'UN','UN',      1,            3.42,           3.42,           3.42,             3,           24,         'Material de Limpeza',1,true ,'', NULL,         NULL,      'manual',false,30),
    ('Detergente Maquina de Louças',      'MP-0080','Limpeza',         'L', 'Galão',   5,           77.03,          77.03,         15.406,             5,           10,         'Material de Limpeza',1,true ,'', NULL,         NULL,      'manual',false,30),
    ('Difusir Palito',                    'MP-0081','Limpeza',         'UN','UN',      1,           16.50,          16.50,          16.50,             1,            4,         'Material de Limpeza',1,true ,'', NULL,         NULL,      'manual',false,30),
    ('Esponja Amarela',                   'MP-0083','Limpeza',         'UN','UN',      1,            1.88,           1.88,           1.88,             1,           20,         'Material de Limpeza',1,true ,'', NULL,         NULL,      'manual',false,30),
    ('Esponja Branca G',                  'MP-0084','Limpeza',         'UN','UN',      1,           18.90,          18.90,          18.90,             1,            4,         'Material de Limpeza',1,true ,'', NULL,         NULL,      'manual',false,30),
    ('Esponja de Fibra Pequena',          'MP-0085','Limpeza',         'UN','UN',      1,            2.80,           2.80,           2.80,             1,           10,         'Material de Limpeza',1,true ,'', NULL,         NULL,      'manual',false,30),
    ('Esponja Para Taças',                'MP-0086','Limpeza',         'UN','UN',      1,            2.20,           2.20,           2.20,             1,            4,         'Material de Limpeza',1,true ,'', NULL,         NULL,      'manual',false,30),
    ('Papel Higienico Tork',              'MP-0223','Limpeza',         'UN','UN',      1,           23.00,          23.00,          23.00,          23.4,            0,         'Material de Limpeza',4,true ,'', NULL,         NULL,      'manual',false,30),
    ('Papel Toalha Cliente tork',         'MP-0224','Limpeza',         'UN','UN',      1,           77.03,          77.03,          77.03,             2,            4,         'Material de Limpeza',1,true ,'', NULL,         NULL,      'manual',false,30),
    ('Perflex Azul',                      'MP-0166','Limpeza',         'UN','UN',      1,          121.95,         121.95,         121.95,             1,            3,         'Material de Limpeza',1,true ,'', NULL,         NULL,      'manual',false,30),
    ('Perflex Laranja',                   'MP-0167','Limpeza',         'UN','UN',      1,          122.40,         122.40,         122.40,             1,            3,         'Material de Limpeza',1,true ,'', NULL,         NULL,      'manual',false,30),
    ('Perflex Verde',                     'MP-0168','Limpeza',         'UN','UN',      1,          124.90,         124.90,         124.90,             1,            3,         'Material de Limpeza',1,true ,'', NULL,         NULL,      'manual',false,30),
    ('Peroxido',                          'MP-0169','Limpeza',         'UN','UN',      5,          118.04,         118.04,         23.608,             1,            2,         'Material de Limpeza',1,true ,'', NULL,         NULL,      'manual',false,30),
    ('Pinho Gel',                         'MP-0175','Limpeza',         'UN','UN',      1,           16.00,          16.00,          16.00,             1,            1,         'Material de Limpeza',1,true ,'', NULL,         NULL,      'manual',false,30),
    ('Sabonete Anticéptico',              'MP-0186','Limpeza',         'UN','UN',      1,          113.76,         113.76,         113.76,             2,            3,         'Material de Limpeza',1,true ,'', NULL,         NULL,      'manual',false,30),
    ('Sabonete Refil',                    'MP-0187','Limpeza',         'UN','UN',      1,          156.19,         156.19,         156.19,             1,            3,         'Material de Limpeza',1,true ,'', NULL,         NULL,      'manual',false,30),
    ('Saco de lixo 30 litros',            'MP-0189','Limpeza',         'KG','Pacote',  1,            8.00,           8.00,           8.00,             1,            2,         'Estoque Seco',  1,    true ,'',   NULL,         NULL,      'manual',false,NULL),
    ('Saco de Lixo Reforçado 100 l',      'MP-0190','Limpeza',         'KG','Pacote',  1,           54.97,          54.97,          54.97,             1,            4,         'Material de Limpeza',1,true ,'', NULL,         NULL,      'manual',false,30),
    ('Secante Maquina de Lavar',          'MP-0201','Limpeza',         'L', 'UN',      5,           77.60,          77.60,          15.52,             5,           10,         'Material de Limpeza',1,true ,'', NULL,         NULL,      'manual',false,30),
    -- LÍQUIDOS
    ('Azeite Teste',                      '',        'Líquidos',       'L', 'UN',      1,           35.00,           0.00,           0.00,             0,            0,         '',              1,    false,'',   NULL,         NULL,      'manual',true ,NULL),
    -- MOLHOS
    ('Extrato de Tomate 2kg',             'MP-0090','Molhos',          'KG','Pacote',  2,           28.87,          28.87,         14.435,             2,            4,         'Estoque Seco',  1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Shoyu Teste',                       '',        'Molhos',         'L', 'UN',      1,           12.00,           0.00,           0.00,             0,            0,         '',              1,    false,'',   NULL,         NULL,      'manual',true ,NULL),
    ('Vinagre Arroz Teste',               '',        'Molhos',         'L', 'UN',      1,            8.50,           0.00,           0.00,             0,            0,         '',              1,    false,'',   NULL,         NULL,      'manual',true ,NULL),
    -- ORIENTAL
    ('Arroz Japones 5 kg',                'MP-0019','Oriental',        'KG','Pacote',  5,           42.75,          42.75,           8.55,            15,           80,         'Estoque Seco',  1,    true ,'',   NULL,         NULL,      'manual',true ,NULL),
    ('Cebola Crispy',                     'MP-0050','Oriental',        'KG','Pacote',  1,           42.50,          42.50,          42.50,             3,            6,         'Estoque Seco',  1,    true ,'',   NULL,         NULL,      'manual',true ,NULL),
    ('Creme Cheese',                      'MP-0076','Oriental',        'KG','KG',      1,           30.50,          30.50,          30.50,             3,           24,         'Câmara Fria',   1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Farinha Panko',                     'MP-0003','Oriental',        'KG','UN',      1,           14.90,          14.90,          14.90,            15,           50,         'Estoque Seco',  1,    true ,'Marca Alfa',NULL,     NULL,      'manual',true ,NULL),
    ('Farinha Panko',                     'MP-0095','Oriental',        'KG','KG',      1,           13.86,          13.86,          13.86,            10,           60,         'Estoque Seco',  1,    false,'30', NULL,         NULL,      'manual',true ,NULL),
    ('Folha de Arroz',                    'MP-0103','Oriental',        'UN','UN',      1,           33.62,          33.62,          33.62,             2,            6,         'Estoque Seco',  1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Gengibre em Conserva',              'MP-0108','Oriental',        'KG','KG',      1,           11.70,          11.70,          11.70,             2,            4,         'Estoque Seco',  1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Gergelim Preto',                    'MP-0111','Oriental',        'KG','KG',      1,           22.64,          22.64,          22.64,             1,            3,         'Estoque Seco',  1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Gergilim Branco',                   'MP-0110','Oriental',        'KG','KG',      1,           18.62,          18.62,          18.62,             1,            3,         'Estoque Seco',  1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Glutamato Monossodico',             'MP-0114','Oriental',        'KG','UN',      0.5,         16.63,          16.63,          33.26,           0.5,            1,         'Estoque Seco',  1,    true ,'',   500,          'g',       'auto',  true ,30),
    ('Guioza',                            'MP-0118','Oriental',        'UN','Pacote', 12,           12.94,          12.94,         1.0783,           180,         1200,         'Câmara Congelada',1,  true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Hondashi',                          'MP-0121','Oriental',        'UN','UN',      1,           42.93,          42.93,          42.93,             3,           10,         'Estoque Seco',  1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Kani',                              'MP-0122','Oriental',        'UN','UN',      1,           29.90,          29.90,          29.90,             1,            5,         'Câmara Congelada',1,  true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Macarrão de Yakisoba Premium Alfa', 'MP-0136','Oriental',        'UN','UN',      1,            7.93,           7.93,           7.93,             2,            7,         'Estoque Seco',  1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Macarrão Somen Alfa',               'MP-0135','Oriental',        'UN','UN',      1,            8.81,           8.81,           8.81,             1,            6,         'Estoque Seco',  1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Maionese',                          'MP-0137','Oriental',        'KG','Galão',   3,            0.00,           0.00,           0.00,             3,            9,         'Estoque Seco',  1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Massa de Guioza',                   'MP-0143','Oriental',        'UN','Pacote', 20,            8.43,           8.43,          0.4215,           200,          300,         'Câmara Congelada',1,  true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Massa de Harumaki',                 'MP-0144','Oriental',        'UN','Pacote', 30,           20.84,          20.84,         0.6947,            60,          900,         'Câmara Congelada',1,  true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Misso Balde 10 k',                  'MP-0145','Oriental',        'KG','Galão', 10,          163.52,         163.52,          16.352,            10,           20,         'Estoque Seco',  1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Molho de Pimenta Shiracha',         'MP-0146','Oriental',        'UN','UN',      1,           26.90,          26.90,          26.90,             1,            2,         'Estoque Seco',  1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Molho Tare 5 L',                    'MP-0215','Oriental',        'L', 'Galão',   5,           34.23,          34.23,           6.846,            10,          20,         'Estoque Seco',  1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Nori 50 Folhas',                    'MP-0151','Oriental',        'UN','UN',     50,           39.00,          39.00,           0.78,             3,           20,         'Estoque Seco',  1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Óleo de Gergelim Torrado',          'MP-0154','Oriental',        'L', 'UN',      1,           39.90,          39.90,          39.90,             1,            2,         'Estoque Seco',  1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Sake do Chef',                      'MP-0192','Oriental',        'L', 'Galão',   5,          123.38,         123.38,          24.676,            5,           10,         'Estoque Seco',  0,    true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Sake Dourado',                      'MP-0193','Oriental',        'L', 'UN',      0.74,        37.65,          37.65,         50.8784,            2,            8,         'Estoque Seco',  1,    true ,'',   740,          'ml',      'auto',  true ,30),
    ('Sake Hakuchica',                    'MP-0194','Oriental',        'L', 'UN',      0.74,       134.68,         134.68,          182.00,            2,            5,         'Estoque Seco',  1,    true ,'',   740,          'ml',      'manual',true ,30),
    ('Sake Soft',                         'MP-0195','Oriental',        'L', 'UN',      0.74,        30.53,          30.53,         41.2568,            2,            8,         'Estoque Seco',  1,    true ,'',   740,          'ml',      'auto',  true ,30),
    ('Salsa Trufada',                     'MP-0197','Oriental',        'KG','UN',      1,          210.00,         210.00,         210.00,             1,            2,         'Estoque Seco',  1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Shimeji Branco',                    'MP-0202','Oriental',        'KG','KG',      1,           21.88,          21.88,          21.88,            15,           60,         'Câmara Fria',   1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Shoyu  Cereja Suave  20L',          'MP-0205','Oriental',        'L', 'Galão', 20,          189.90,         189.90,           9.495,            20,           40,         'Estoque Seco',  1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Shoyu blister Delivery',            'MP-0203','Oriental',        'UN','UN',      1,            0.92,           0.92,           0.92,            20,           50,         'Estoque De Embalagem',1,true,'',NULL,         NULL,      'manual',true ,30),
    ('Shoyu Premium Sakura 20 L',         'MP-0204','Oriental',        'L', 'Galão', 20,          217.16,         217.16,          10.858,            20,           40,         'Estoque Seco',  1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Shoyu Suave Sakura 20L',            'MP-0206','Oriental',        'L', 'Galão', 20,          240.00,         240.00,          12.00,             20,           20,         'Estoque Seco',  1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Trufa Negra',                       'MP-0225','Oriental',        'UN','UN',      1,          156.63,         156.63,         156.63,             1,            1,         'Estoque Seco',  1,    true ,'',   1,            'kg',      'manual',true ,30),
    ('Vinagre de Arroz',                  'MP-0226','Oriental',        'L', 'Galão', 20,           36.92,          36.92,           1.846,            20,           60,         'Estoque Seco',  1,    true ,'',   1,            'kg',      'manual',true ,30),
    ('Vinagre de Maçã 750 ml',            'MP-0227','Oriental',        'L', 'Galão',  0.75,         8.49,           8.49,          11.320,             2,            6,         'Estoque Seco',  1,    true ,'',   750,          'ml',      'manual',true ,30),
    ('Vinagre de vinho Branco 740,00',    'MP-0228','Oriental',        'L', 'Galão',  0.74,        10.90,          10.90,         14.7297,             2,            4,         'Estoque Seco',  1,    true ,'',   740,          'ml',      'auto',  true ,30),
    ('Wasabi em Pó',                      'MP-0233','Oriental',        'KG','Pacote',  1,           33.45,          33.45,          33.45,             1,            3,         'Estoque Seco',  1,    true ,'',   NULL,         NULL,      'manual',true ,NULL),
    -- OUTROS
    ('Mussarela',                         'MP-0150','Outros',          'KG','KG',      1,           25.00,          25.00,          25.00,             1,            3,         'Câmara Fria',   1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    -- PEIXES
    ('Atum Nacional',                     'MP-0020','Peixes',          'KG','KG',      1,           59.90,          59.90,          59.90,             5,           25,         'Câmara Fria',   1,    true ,'',   NULL,         NULL,      'manual',true ,NULL),
    ('Camarão',                           'MP-0045','Peixes',          'KG','KG',      1,           35.26,          35.26,          35.26,            15,           70,         'Câmara Fria',   1,    true ,'',   NULL,         NULL,      'manual',true ,NULL),
    ('Poupa De Salmão',                   'MP-0176','Peixes',          'KG','KG',      1,           34.59,          34.59,          34.59,             1,           15,         'Câmara Congelada',1,  true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Salmão Fresco',                     'SALM-001','Peixes',         'KG','KG',      1,           46.56,          46.56,          46.56,            90,          392,         'Câmara Fria',  10,    true ,'',   NULL,         NULL,      'manual',true ,NULL),
    ('Tilapia Fresca',                    'MP-0217','Peixes',          'KG','KG',      1,           36.94,          36.94,          36.94,             5,           80,         'Câmara Congelada',1,  true ,'',   NULL,         NULL,      'manual',true ,30),
    -- PROTEÍNAS
    ('Patinho',                           'MP-0161','Proteínas',       'KG','KG',      1,           35.21,          35.21,          35.21,             3,           10,         'Câmara Congelada',1,  true ,'',   NULL,         NULL,      'manual',true ,NULL),
    ('Peito de Frango',                   'MP-0162','Proteínas',       'KG','KG',      1,           13.52,          13.52,          13.52,             3,           10,         'Câmara Congelada',1,  true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Peito de Frango Funcionários',      'MP-0163','Proteínas',       'KG','KG',      1,           13.52,          13.52,          13.52,             2,           15,         'Câmara Congelada',1,  true ,'',   NULL,         NULL,      'manual',false,30),
    -- REFRIGERANTES
    ('Coca Cola Normal',                  'MP-0071','Refrigerantes',   'UN','UN',      1,            2.95,           2.95,           2.95,            20,           90,         'Bar',           1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Coca Cola Zero',                    'MP-0072','Refrigerantes',   'UN','UN',      1,            2.89,           2.89,           2.89,            20,           90,         'Bar',           1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Fanta Laranja 350 Ml',              'MP-0091','Refrigerantes',   'UN','UN',      1,            2.64,           2.64,           2.64,             2,            6,         'Bar',           1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Fanta Uva',                         'MP-0092','Refrigerantes',   'UN','UN',      1,            2.75,           2.75,           2.75,             2,            6,         'Estoque Seco',  1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Guarana Normal',                    'MP-0115','Refrigerantes',   'UN','UN',      1,            2.82,           2.82,           2.82,            10,           48,         'Bar',           1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Guarana zero',                      'MP-0116','Refrigerantes',   'UN','UN',      1,            2.97,           2.97,           2.97,            10,           48,         'Bar',           1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    ('H2o Limão',                         'MP-0119','Refrigerantes',   'UN','UN',      1,            3.91,           3.91,           3.91,            10,           72,         'Bar',           1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    ('H2o Limoneto',                      'MP-0120','Refrigerantes',   'UN','UN',      1,            3.92,           3.92,           3.92,             6,           48,         'Bar',           1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Pepsi Black',                       'MP-0165','Refrigerantes',   'UN','UN',      1,            2.77,           2.77,           2.77,             5,           15,         'Bar',           1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Red Bull Melancia',                 'MP-0177','Refrigerantes',   'UN','UN',      1,            6.93,           6.93,           6.93,             1,            5,         'Bar',           1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Red Bull Pessego',                  'MP-0178','Refrigerantes',   'UN','UN',      1,            7.60,           7.60,           7.60,             1,            5,         'Bar',           1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Red Bull Sugar Free',               'MP-0179','Refrigerantes',   'UN','UN',      1,            6.79,           6.79,           6.79,             1,            5,         'Bar',           1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Red Bull Tradicional',              'MP-0180','Refrigerantes',   'UN','UN',      1,            6.79,           6.79,           6.79,             1,            5,         'Bar',           1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    ('RedBull Tropical',                  'MP-0181','Refrigerantes',   'UN','UN',      1,            6.79,           6.79,           6.79,             2,            5,         'Bar',           1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Schweppes 350 ml',                  'MP-0200','Refrigerantes',   'UN','UN',      1,            2.92,           2.92,           2.92,             3,            7,         'Estoque Seco',  1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Sprit 350 ml',                      'MP-0212','Refrigerantes',   'UN','UN',      1,            2.53,           2.53,           2.53,             3,            6,         'Estoque Seco',  1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Sprit Zero',                        'MP-0213','Refrigerantes',   'UN','UN',      1,            2.78,           2.78,           2.78,             2,            6,         'Estoque Seco',  1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Tonica 350 ml',                     'MP-0220','Refrigerantes',   'UN','UN',      1,            2.67,           2.67,           2.67,             4,            6,         'Estoque Seco',  1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Tonica Rose 350 ml',                'MP-0221','Refrigerantes',   'UN','UN',      1,            2.30,           2.30,           2.30,             3,            6,         'Estoque Seco',  1,    true ,'',   NULL,         NULL,      'manual',true ,NULL),
    ('Tonica Zero',                       'MP-0222','Refrigerantes',   'UN','UN',      1,            2.75,           2.75,           2.75,             2,            6,         'Estoque Seco',  1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    -- SECOS
    ('Azeite Composto 500 ml',            'MP-0021','Secos',           'L', 'UN',      0.5,         16.44,          16.44,          32.88,           1.5,            4,         'Estoque Seco',  1,    true ,'',   500,          'ml',      'auto',  true ,NULL),
    ('Açucar Cristal 1Kg',                'MP-0008','Secos',           'KG','Pacote',  1,            3.66,           3.66,           3.66,             3,           20,         'Estoque Seco',  0,    true ,'',   NULL,         NULL,      'manual',true ,NULL),
    ('Açucar Cristal de 5 kg',            'MP-0009','Secos',           'KG','Pacote',  5,           16.64,          16.64,           3.328,            20,           30,         'Estoque Seco',  0,    true ,'',   NULL,         NULL,      'manual',true ,NULL),
    ('Açucar Refinado 1 KG',              'MP-0010','Secos',           'KG','Pacote',  1,            3.61,           3.61,           3.61,             3,            6,         'Estoque Seco',  1,    true ,'',   NULL,         NULL,      'manual',true ,NULL),
    ('Amido de Milho',                    'MP-0016','Secos',           'KG','KG',      1,            8.80,           8.80,           8.80,             2,            4,         'Estoque Seco',  1,    true ,'',   NULL,         NULL,      'manual',true ,NULL),
    ('Arroz Branco 5 KG',                 'MP-0018','Secos',           'KG','Pacote',  5,           14.00,          14.00,           2.80,            10,           40,         'Estoque Seco',  1,    true ,'',   NULL,         NULL,      'manual',false,NULL),
    ('Arroz Teste',                       '',        'Secos',          'KG','UN',      1,            5.50,           0.00,           0.00,             0,            0,         '',              1,    false,'',   NULL,         NULL,      'manual',true ,NULL),
    ('Azeite extra Virgem 500 ml',        'MP-0023','Secos',           'L', 'UN',      0.5,         30.73,          30.73,          61.46,           2.5,          7.5,         'Estoque Seco',  1,    true ,'',   500,          'ml',      'auto',  true ,30),
    ('Azeite Trufado',                    'MP-0024','Secos',           'UN','UN',      1,          138.00,         138.00,         138.00,             1,            3,         'Estoque Seco',  1,    true ,'',   NULL,         NULL,      'manual',true ,NULL),
    ('Bisnaga de chocolate',              'MP-0029','Secos',           'UN','UN',      1,           29.32,          29.32,          29.32,             1,           10,         'Estoque Seco',  1,    true ,'',   NULL,         NULL,      'manual',true ,NULL),
    ('Bisnaga de Doce de Leite',          'MP-0030','Secos',           'UN','UN',      1,           21.02,          21.02,          21.02,             1,            6,         'Estoque Seco',  1,    true ,'',   NULL,         NULL,      'manual',true ,NULL),
    ('Bisnaga de Goiabada',               'MP-0031','Secos',           'UN','UN',      1,           19.40,          19.40,          19.40,             1,            6,         'Estoque Seco',  1,    true ,'',   NULL,         NULL,      'manual',true ,NULL),
    ('Brownie Mr Bay',                    'MP-0036','Secos',           'UN','UN',      1,            9.16,           9.16,           9.16,             4,           15,         'Câmara Congelada',1,  true ,'',   NULL,         NULL,      'manual',true ,NULL),
    ('Clorodeter',                        'MP-0002','Secos',           'UN','UN',      1,            3.00,           3.00,           3.00,             1,            0,         '',              1,    false,'',   NULL,         NULL,      'manual',false,NULL),
    ('Cobertura de Caramelo',             'MP-0068','Secos',           'UN','UN',      1,           29.80,          29.80,          29.80,             1,            2,         'Estoque Seco',  1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Cobertura de Chocolate',            'MP-0069','Secos',           'UN','UN',      1,           32.90,          32.90,          32.90,             1,            2,         'Estoque Seco',  1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Cobertura De Morango',              'MP-0070','Secos',           'UN','UN',      1,           29.91,          29.91,          29.91,             1,            2,         'Estoque Seco',  1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Creme de Leite 1lt',                'MP-0077','Secos',           'L', 'L',       1,           14.54,          14.54,          14.54,             1,            5,         'Estoque Seco',  1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Detercloro',                        'MP-0001','Secos',           'UN','UN',      1,            2.00,           2.00,           2.00,             1,            0,         '',              1,    false,'',   NULL,         NULL,      'manual',false,NULL),
    ('Doritos 300',                       'MP-0082','Secos',           'UN','UN',      1,           13.49,          13.49,          13.49,             2,            5,         'Estoque Seco',  1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Esponja De Aço',                    'MP-0035','Secos',           'UN','UN',      1,            2.50,           2.50,           2.50,             1,            2,         'Material de Limpeza',1,true ,'', NULL,         NULL,      'manual',false,NULL),
    ('Farinha De Trigo',                  'MP-0094','Secos',           'KG','Pacote',  5,           13.03,          13.03,           2.606,            5,           25,         'Estoque Seco',  1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Feijão Carioca',                    'MP-0096','Secos',           'KG','KG',      1,            6.95,           6.95,           6.95,             2,           10,         'Estoque Seco',  1,    true ,'',   NULL,         NULL,      'manual',false,30),
    ('Gas Amarelo',                       'MP-0105','Secos',           'UN','UN',      1,           33.09,          33.09,          33.09,             1,            4,         'Estoque Seco',  1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Gás Maçarico',                      'MP-0106','Secos',           'UN','UN',      1,           10.23,          10.23,          10.23,             1,            4,         'Estoque Seco',  1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Geleia de Pimenta',                 'MP-0107','Secos',           'KG','Galão',   1,           29.90,          29.90,          29.90,             1,            2,         'Estoque Seco',  1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Ketchup',                           'MP-0123','Secos',           'UN','UN',      1,           24.33,          24.33,          24.33,             1,            2,         'Estoque Seco',  1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Leite Condensado',                  'MP-0125','Secos',           'UN','UN',      1,            6.33,           6.33,           6.33,             2,            8,         'Estoque Seco',  1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Leite de Coco',                     'MP-0126','Secos',           'UN','UN',      1,            9.00,           9.00,           9.00,             1,            3,         'Estoque Seco',  1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Leite Integral',                    'MP-0127','Secos',           'L', 'L',       1,            4.14,           4.14,           4.14,             1,            1,         'Estoque Seco',  1,    true ,'',   NULL,         NULL,      'manual',false,30),
    ('Margarina',                         'MP-0139','Secos',           'KG','Galão',  14,          190.65,         190.65,         13.6179,            14,           14,         'Estoque Seco',  1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Mostarda',                          'MP-0149','Secos',           'KG','Galão',   3,           28.50,          28.50,           9.50,             3,            3,         'Estoque Seco',  1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Óleo de Algodão',                   'MP-0152','Secos',           'L', 'UN',     14,           58.81,          58.81,          4.2007,            28,           84,         'Estoque Seco',  1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Óleo de Dender',                    'MP-0153','Secos',           'UN','UN',     14,           12.90,          12.90,          0.9214,             1,            3,         'Estoque Seco',  1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Ovoltine',                          'MP-0157','Secos',           'KG','UN',      1,           21.00,          21.00,          21.00,             1,            1,         'Estoque Seco',  1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Sal Refinado',                      'MP-0196','Secos',           'KG','UN',      1,            1.66,           1.66,           1.66,             3,           10,         'Estoque Seco',  1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    -- SOBREMESA
    ('Ganache',                           'MP-0104','Sobremesa',       'KG','Galão',   5,          114.90,         114.90,          22.98,             5,            5,         'Estoque Seco',  1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Patit Gateaul 100 G',               'MP-0170','Sobremesa',       'UN','Pacote', 24,          278.64,         278.64,          11.61,            24,          144,         'Câmara Congelada',1,  true ,'',   NULL,         NULL,      'manual',true ,NULL),
    ('Picole de Brigadeiro',              'MP-0171','Sobremesa',       'UN','UN',      1,            7.18,           7.18,           7.18,             1,           15,         'Câmara Congelada',1,  true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Picolé Tablito',                    'MP-0172','Sobremesa',       'UN','UN',      1,            8.74,           8.74,           8.74,             1,           15,         'Câmara Congelada',1,  true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Sorvete de Chocolate 2 L',          'MP-0209','Sobremesa',       'L', 'Balde',   2,           22.82,          22.82,          11.41,             2,            6,         'Câmara Congelada',1,  true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Sorvete de Creme',                  'MP-0210','Sobremesa',       'L', 'Balde',   2,           24.45,          24.45,         12.225,             4,            8,         'Câmara Congelada',1,  true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Sorvete De Morango 5l',             'MP-0211','Sobremesa',       'L', 'Balde',   5,           98.50,          98.50,          19.70,             5,           10,         'Câmara Congelada',1,  true ,'',   NULL,         NULL,      'manual',true ,30),
    -- TEMPEROS
    ('Caldo de Galinha',                  'MP-0044','Temperos',        'KG','KG',      1,           12.10,          12.10,          12.10,             1,            2,         'Estoque Seco',  1,    true ,'',   NULL,         NULL,      'manual',true ,NULL),
    ('Coloral',                           'MP-0074','Temperos',        'KG','KG',      1,           14.90,          14.90,          14.90,             1,            2,         'Estoque Seco',  1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Lemon Pepper',                      'MP-0239','Temperos',        'KG','KG',      1,           32.50,          32.50,          32.50,             1,            2,         'Estoque Seco',  1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Páprica Doce',                      'MP-0240','Temperos',        'KG','KG',      1,           17.95,          17.95,          17.95,             1,            2,         'Estoque Seco',  1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Tempero do chefe',                  'MP-0238','Temperos',        'KG','KG',      1,           30.60,          30.60,          30.60,             1,            3,         'Estoque Seco',  1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    -- VINHOS E ESPUMANTES
    ('Espumante Bossa N°1',               'MP-0087','Vinhos e Espumantes','UN','UN',   1,           63.96,          63.96,          63.96,             1,            4,         'Bar',           1,    true ,'',   NULL,         NULL,      'manual',true ,30),
    ('Espumante Bossa N°2',               'MP-0088','Vinhos e Espumantes','UN','UN',   1,           63.96,          63.96,          63.96,             1,            3,         'Câmara Fria',   1,    true ,'',   NULL,         NULL,      'manual',true ,30)
  ) AS t(nome, sku, cat, um, uc, fator, custo, dcpu, dcbu, est_min, est_ide, local_est, lead, ativo, obs, pkg_qty, pkg_unit, conv_mode, cmv, inact)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.produtos p2
    WHERE p2.company_id = v_company_id
      AND (
        (t.sku != '' AND p2.sku = t.sku)
        OR (t.sku = '' AND lower(trim(p2.nome_produto)) = lower(trim(t.nome)))
      )
  );

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RAISE NOTICE 'Importação concluída: % produto(s) inserido(s) para company_id %', v_inserted, v_company_id;
END $$;

-- Reabilitar RLS e triggers
ALTER TABLE public.produtos          ENABLE TRIGGER USER;
ALTER TABLE public.stock_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_locations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.produtos          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_categories FORCE ROW LEVEL SECURITY;
ALTER TABLE public.stock_locations  FORCE ROW LEVEL SECURITY;
ALTER TABLE public.produtos          FORCE ROW LEVEL SECURITY;

-- Recarregar cache do PostgREST
NOTIFY pgrst, 'reload schema';
