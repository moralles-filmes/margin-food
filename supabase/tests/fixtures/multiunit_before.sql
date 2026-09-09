SET session_replication_role=replica;
INSERT INTO companies(id,nome) VALUES
 ('11111111-1111-4111-8111-111111111111','Loja A'),
 ('22222222-2222-4222-8222-222222222222','Loja B'),
 ('33333333-3333-4333-8333-333333333333','Loja C');
INSERT INTO auth.users(id,email,raw_app_meta_data) VALUES
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','single@example.test','{"company_id":"11111111-1111-4111-8111-111111111111"}'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','other@example.test','{"company_id":"22222222-2222-4222-8222-222222222222"}');
INSERT INTO profiles(id,email,nome,company_id) SELECT id,email,email,(raw_app_meta_data->>'company_id')::uuid FROM auth.users;
INSERT INTO permissions(key,description,module,submodule,action) VALUES
 ('financeiro:relatorio-socios:view','Ver','financeiro','relatorio-socios','view'),
 ('financeiro:relatorio-socios:export','Exportar','financeiro','relatorio-socios','export'),
 ('financeiro:contas:view','Ver contas','financeiro','contas','view'),
 ('financeiro:contas:create','Criar contas','financeiro','contas','create'),
 ('financeiro:contas:edit','Editar contas','financeiro','contas','edit'),
 ('financeiro:contas:delete','Excluir contas','financeiro','contas','delete'),
 ('financeiro:lancamentos:view','Ver razão','financeiro','lancamentos','view'),
 ('configuracoes:usuarios:manage','Gerir','configuracoes','usuarios','manage'),
 ('system:global:manage','Global','system','global','manage'),
 ('rh:documentos:view','Documentos','rh','documentos','view');
INSERT INTO role_permissions(role,permission_key) SELECT 'admin',key FROM permissions WHERE key<>'system:global:manage';
INSERT INTO role_permissions(role,permission_key) VALUES('operador','financeiro:relatorio-socios:view');
INSERT INTO user_roles(user_id,role) VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','admin'),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','admin');
INSERT INTO user_permissions(user_id,permission_key,effect) VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','financeiro:relatorio-socios:export','DENY');
INSERT INTO fin_contas(id,nome,tipo,company_id) VALUES
 ('11111111-aaaa-4111-8111-111111111111','Conta A','CAIXA','11111111-1111-4111-8111-111111111111'),
 ('22222222-aaaa-4222-8222-222222222222','Conta B','CAIXA','22222222-2222-4222-8222-222222222222'),
 ('33333333-aaaa-4333-8333-333333333333','Conta C','CAIXA','33333333-3333-4333-8333-333333333333');
SET session_replication_role=origin;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
