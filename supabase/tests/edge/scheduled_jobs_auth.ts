// Executa o handler real via HTTP local. Não substitui banco/SDK por mocks.
// Porta 15440 sem serviço: o último caso comprova propagação da falha real de conexão.
const cronSecret = crypto.randomUUID();
Deno.env.set("CRON_SECRET", cronSecret);
Deno.env.set("SUPABASE_URL", "http://127.0.0.1:15440");
Deno.env.set("SB_SECRET_KEY", crypto.randomUUID());
await import("../../functions/scheduled-jobs/index.ts");

let passed = 0;
async function check(status: number, init: RequestInit, label: string) {
  const response = await fetch("http://127.0.0.1:8000", init);
  const body = await response.text();
  if (response.status !== status) throw new Error(`${label}: ${response.status} ${body}`);
  passed++;
  console.log(`PASS ${label}`);
  return body;
}
const authorized = { Authorization: `Bearer ${cronSecret}`, "Content-Type": "application/json" };
try {
  await check(405, { method: "GET" }, "somente POST");
  await check(200, { method: "OPTIONS" }, "preflight CORS");
  await check(401, { method: "POST", body: '{"action":"cleanup","role":"service_role"}' }, "body não autoriza serviço");
  await check(401, { method: "POST", headers: { Authorization: "Bearer invalid-test-value" }, body: '{"action":"cleanup"}' }, "credencial inválida");
  await check(400, { method: "POST", headers: authorized, body: "invalid-json" }, "JSON inválido não dispara manutenção");
  await check(400, { method: "POST", headers: authorized, body: '{"action":"unknown"}' }, "action desconhecida");
  const failed = JSON.parse(await check(500, { method: "POST", headers: authorized, body: '{"action":"refresh_mvs"}' }, "erro real de conexão retorna falha"));
  if (failed.ok !== false || !failed.results.mvs.error || !failed.results.audit.error) throw new Error("falha não propagada");
  passed++;
  console.log(`PASS ${passed} verificações HTTP do handler real; nenhum banco consultado.`);
  Deno.exit(0);
} catch (error) {
  console.error(error);
  Deno.exit(1);
}
