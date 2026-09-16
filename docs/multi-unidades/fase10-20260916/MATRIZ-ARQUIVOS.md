# Índice por arquivo

Gerado por `scripts/audit-phase10-frontend.mjs`. Cada célula contém linhas de código, não um selo de aprovação. Origem de cliente por operação, expressão, nomes dinâmicos e assinaturas efetivas estão no JSON. Chamadas candidatas incluem também Map/Set/URLSearchParams; não somar esta contagem como operações de banco testadas. A revisão semântica e riscos estão em MATRIZ-FRONTEND.md.

| Arquivo | Chamadas candidatas | scope | queryKey | lifetime | mutation | effects | cache | persistence | realtime | permission |
|---|---:|---|---|---|---|---|---|---|---|---|
| `src/hooks/use-toast.ts` | 1 | — | — | — | 61 | 82, 94 | 53 | — | — | — |
| `src/hooks/useTheme.ts` | 0 | — | — | — | — | — | — | 6, 15 | — | — |
| `src/integrations/supabase/client.ts` | 0 | — | — | — | — | — | — | 15 | — | — |
| `src/contexts/CompanyScopeContext.tsx` | 0 | 24 | — | — | — | — | — | — | — | — |
| `src/lib/companySelection.ts` | 0 | — | — | — | — | — | — | 8, 11 | — | — |
| `src/lib/companyAccess.ts` | 7 | — | — | 20, 23, 30, 33, 38, 48, 51, 60, 61, 62 | — | — | — | — | — | — |
| `src/lib/companyClientLifetime.ts` | 0 | — | — | 7 | — | — | 11 | — | — | — |
| `src/integrations/supabase/companyClient.ts` | 0 | — | — | 12, 28, 54 | — | — | — | — | — | — |
| `src/contexts/AuthContext.tsx` | 0 | 25, 71, 134, 141, 196, 199, 204, 207 | — | 83, 92, 102, 182 | — | — | — | 148 | — | — |
| `src/contexts/CompanyScopeProvider.tsx` | 0 | 5, 47, 48, 68 | 56 | 19, 24, 38, 61 | — | — | — | — | — | — |
| `src/hooks/useNotifications.ts` | 6 | 1, 22 | — | 78 | 41 | — | — | — | 66, 67, 78 | — |
| `src/contexts/NotificationsContext.tsx` | 0 | 3, 10 | — | — | — | — | — | — | — | — |
| `src/hooks/useScopeActivity.ts` | 0 | 2, 7 | — | — | — | — | — | — | — | — |
| `src/components/RequisicaoNotificationModal.tsx` | 1 | 1, 14, 21, 22 | — | — | — | 47 | — | — | — | — |
| `src/domain/financeiro/presentation/scenario.ts` | 0 | — | — | — | — | — | 517 | — | — | — |
| `src/domain/financeiro/presentation/revenue.ts` | 1 | — | — | — | — | — | — | — | — | — |
| `src/domain/financeiro/presentation/categories.ts` | 1 | — | — | — | 89 | — | 56, 57, 58 | — | — | — |
| `src/domain/financeiro/presentation/highlights.ts` | 0 | — | — | — | — | — | 6 | — | — | — |
| `src/domain/financeiro/presentation/meetings.ts` | 0 | — | — | — | — | — | 889 | — | — | — |
| `src/lib/presentationDetailNavigation.ts` | 2 | 371, 372 | — | — | 298, 355 | — | — | — | — | — |
| `src/lib/dirtyStateRegistry.ts` | 3 | — | — | — | 15, 21, 34 | — | 3 | — | — | — |
| `src/components/PwaUpdatePrompt.tsx` | 1 | — | — | — | 80 | 19, 55, 115 | — | 15, 16, 53 | — | — |
| `src/lib/dataEvents.ts` | 2 | — | — | — | 134, 135 | 7, 8, 19, 119, 144 | 36 | 91, 92 | — | — |
| `src/lib/swRecovery.ts` | 1 | — | — | — | 15 | — | — | — | — | — |
| `src/hooks/usePersistedTab.ts` | 0 | — | — | — | — | — | — | 4, 7, 11, 18, 26, 32, 41 | — | — |
| `src/lib/companyPayload.ts` | 0 | 2, 3, 4 | — | — | — | — | — | — | — | — |
| `src/hooks/useCompanyId.ts` | 0 | 1, 2, 3 | — | — | — | — | — | — | — | — |
| `src/hooks/useSalmonStore.ts` | 39 | 1, 2, 3, 99, 100, 353, 393, 664, 956 | — | — | 267, 324, 334, 353, 393, 664, 689, 703, 956 | 281, 327, 337, 366, 401, 438, 451, 472, 491, 502, 515, 518, 522, 539, 561, 573, 588, 622, 625, 629, 644, 650, 673, 691 | — | — | — | — |
| `src/lib/tenant.ts` | 1 | — | — | — | — | — | — | — | — | — |
| `src/hooks/useEstoqueGeralStore.ts` | 15 | 1, 10, 235, 236 | — | — | 622, 689, 746 | 655, 703, 719, 759 | — | — | — | — |
| `src/hooks/usePurchaseOrdersStore.ts` | 44 | 1, 2, 3, 5, 107, 108, 109, 297, 371, 467, 590 | — | 234 | 297, 327, 354, 360, 371, 398, 467, 523, 532, 590, 629, 634, 666, 672 | 287, 312, 340, 348, 386, 387, 416, 448, 483, 484, 485, 509, 517, 518, 519, 538, 539, 583, 604, 605, 623, 640, 644, 645, 646, 679 | — | — | 221, 229, 230, 234 | — |
| `src/components/NotificationBell.tsx` | 0 | 7, 24 | — | — | — | — | — | — | — | — |
| `src/permissions/registry.ts` | 0 | — | — | — | — | — | — | — | — | 627 |
| `src/components/AppLayout.tsx` | 0 | 8, 136 | — | — | — | — | — | 142, 157 | — | — |
| `src/hooks/useMentionToast.ts` | 3 | 1, 8 | — | 51, 87 | — | 37, 74 | — | 18, 35, 73 | 60, 62, 88 | — |
| `src/permissions/hooks.ts` | 2 | 14, 15, 93, 94, 104, 105, 115, 116, 126, 127 | — | — | 41 | — | — | — | — | 5, 92 |
| `src/hooks/useSalmonDashboard.ts` | 1 | 1, 58 | — | — | — | — | — | — | — | — |
| `src/components/compras/QuickSupplierDialog.tsx` | 0 | — | — | — | — | 40, 57 | — | — | — | — |
| `src/components/EntriesView.tsx` | 0 | — | — | — | — | 87, 92, 142, 144, 178, 194, 223, 232, 243 | — | — | — | 46, 47, 48 |
| `src/components/EtiquetaModal.tsx` | 0 | — | — | — | — | 50 | — | — | — | — |
| `src/components/ManipulationView.tsx` | 0 | — | — | — | — | 116, 160, 177, 178, 179, 208, 209, 210, 211, 212, 230, 235, 250, 255, 598 | — | — | — | 49, 50 |
| `src/components/StockView.tsx` | 0 | — | — | — | — | 39 | — | — | — | — |
| `src/components/GoalsView.tsx` | 0 | — | — | — | — | 70, 72 | — | — | — | 23 |
| `src/hooks/usePlanningStore.ts` | 4 | 1, 59 | — | — | — | 125, 126, 131, 133, 149, 150, 154 | — | — | — | — |
| `src/components/financeiro/MonthNavigator.tsx` | 1 | — | — | — | — | — | — | — | — | — |
| `src/components/PlanningView.tsx` | 1 | — | — | — | — | — | — | — | — | 68 |
| `src/components/SalmonControlView.tsx` | 0 | — | — | — | — | — | — | 2, 59 | — | — |
| `src/permissions/components.tsx` | 0 | — | — | — | — | — | — | — | — | 15 |
| `src/components/SimuladorCompraGeral.tsx` | 1 | 1, 12, 53, 54 | — | — | — | 92, 271 | — | — | — | 55 |
| `src/components/estoque/ListaFixaSetorAdmin.tsx` | 15 | 1, 8, 10, 46, 48, 49 | — | — | 126, 152, 175, 201, 202, 213 | 82, 131, 136, 138, 163, 166, 178, 181, 217, 220 | — | — | — | 47 |
| `src/components/estoque/RequisicaoQuantityList.tsx` | 1 | — | — | — | 35 | — | 21 | — | — | — |
| `src/components/estoque/RequisicaoListaFixa.tsx` | 4 | 1, 7, 42, 43 | — | — | — | 55, 106, 151, 164, 173, 204, 210, 219, 223 | 118 | — | — | 44 |
| `src/components/RequisicaoEstoqueSection.tsx` | 10 | 1, 12, 86, 87 | — | — | — | 113, 169, 188, 225, 227, 249, 253, 262, 266, 292, 296, 313, 326, 332, 335, 351, 364, 369, 372, 388, 404, 408, 414, 417, 434, 438, 443, 446, 466, 471, 474, 494, 499, 502 | — | — | — | 88, 89, 90 |
| `src/components/MovimentacoesSection.tsx` | 3 | 1, 17, 74, 75 | — | — | — | 193, 194, 205, 222, 224, 228, 235, 236, 255, 257, 261 | — | — | — | 76, 77 |
| `src/components/StockCadastrosSection.tsx` | 27 | 1, 12, 16, 53, 55, 56 | — | — | 149, 158, 179, 205, 212, 233, 242, 275, 283, 304, 313, 329 | 142, 143, 152, 162, 169, 171, 180, 181, 198, 199, 208, 216, 223, 225, 234, 235, 245, 247, 251, 268, 269, 278, 287, 294, 296, 305, 306, 316, 318, 322, 332, 334, 338 | — | — | — | 54 |
| `src/lib/companyRealtime.ts` | 0 | — | — | 12 | — | — | — | — | — | — |
| `src/components/estoque/StockInactivityAlert.tsx` | 3 | 1, 27 | — | 57 | — | — | — | — | 54, 55, 57 | 29 |
| `src/components/estoque/StockDashboardSection.tsx` | 1 | 1, 156 | — | — | — | — | — | — | — | 157 |
| `src/components/estoque/StockTopConsumedSection.tsx` | 1 | 1, 67 | — | — | — | — | — | — | — | 68 |
| `src/components/estoque/StockLossesSection.tsx` | 1 | 1, 62 | — | — | — | — | — | — | — | 63 |
| `src/components/estoque/StockTransfersSection.tsx` | 2 | 1, 42 | — | — | — | 92, 110, 111, 112, 113, 115, 117, 131, 142 | — | — | — | 43 |
| `src/components/estoque/StockPredictiveSection.tsx` | 1 | 1, 91 | — | — | — | 119 | — | — | — | 92 |
| `src/components/cmv/cmvCache.ts` | 2 | — | — | — | 37, 62 | — | 14, 17, 30, 44, 52 | 3 | — | — |
| `src/components/estoque/ProdutoFormPanel.tsx` | 0 | — | — | — | — | 118, 119, 120, 132, 133, 190, 192 | — | — | — | — |
| `src/components/estoque/NovaMovimentacaoModal.tsx` | 1 | 1, 97 | — | — | — | 237, 238, 244, 253, 260, 279, 286, 288 | — | — | — | — |
| `src/components/EstoqueGeralView.tsx` | 4 | 2, 40, 84, 88 | — | — | — | 16, 284, 288, 405, 407, 412, 422, 430, 448, 461, 477, 879, 884, 889 | 57, 474, 475 | 6, 85 | — | 93, 94, 95, 96, 98 |
| `src/components/UserMentionSelect.tsx` | 1 | 1, 23 | — | — | — | — | — | — | — | 24 |
| `src/lib/pdfPedidoFornecedor.ts` | 0 | — | — | — | — | 175 | — | — | — | — |
| `src/components/compras/ExportPedidoModal.tsx` | 0 | — | — | — | — | 68, 74, 97 | — | — | — | — |
| `src/components/PedidosComprasMercadoView.tsx` | 1 | 1, 4, 68, 69 | — | — | — | 271, 295, 296, 297, 299, 341, 356, 388, 437, 446, 530 | — | — | — | 97, 98, 99, 100, 101, 102 |
| `src/components/compras/AlertasFaltaEstoqueView.tsx` | 3 | 1, 57 | — | — | 121 | 89, 128, 132 | — | — | — | 58, 59, 60, 61, 62 |
| `src/components/SuppliersView.tsx` | 0 | — | — | — | — | 32, 40, 44, 46, 49, 51, 61, 65, 70, 72 | — | — | — | 27, 28, 29 |
| `src/components/compras/ShoppingChecklistView.tsx` | 2 | 1, 9, 21, 22 | — | — | 172 | 69 | — | — | — | 24, 27 |
| `src/components/compras/CalendarioLembretesView.tsx` | 7 | 1, 2, 3, 5, 62, 63, 65, 117 | — | — | 113, 117, 129 | 93, 114, 115, 118, 119, 130, 180, 206, 209 | — | — | — | 64 |
| `src/components/compras/RankingFornecedoresView.tsx` | 2 | 1, 4, 41, 52 | — | — | — | 107, 111, 125, 126 | — | — | — | 42, 43 |
| `src/types/cotacao.ts` | 0 | — | — | — | — | — | — | 5 | — | — |
| `src/hooks/useCotacoesStore.ts` | 15 | 1, 4, 69, 72 | — | 116 | — | — | — | — | 111, 112, 113, 117 | — |
| `src/components/compras/cotacao/ImportItensDialog.tsx` | 4 | 6, 26 | — | — | 97 | 83, 107 | — | — | — | — |
| `src/components/compras/cotacao/CotacaoFormDialog.tsx` | 0 | — | — | — | — | 90, 92, 105, 125, 136, 137, 160, 163, 170 | — | — | — | — |
| `src/components/compras/cotacao/CotacaoRespostasMatrix.tsx` | 0 | — | — | — | — | 87, 91 | — | — | — | — |
| `src/components/compras/cotacao/CotacaoComparativoTable.tsx` | 0 | — | — | — | — | — | 18 | — | — | — |
| `src/domain/compras/cotacaoOptimizer.ts` | 1 | — | — | — | 307 | — | — | — | — | — |
| `src/components/compras/cotacao/CotacaoSugestaoInteligente.tsx` | 0 | — | — | — | — | 55, 68, 72, 83, 86 | — | — | — | — |
| `src/components/compras/cotacao/CotacaoWhatsappPanel.tsx` | 0 | — | — | — | — | 65, 66, 67, 78, 81, 86, 93, 99, 101, 105 | — | — | — | 32 |
| `src/components/compras/cotacao/CotacaoDetailDrawer.tsx` | 0 | — | — | — | — | 52, 79, 83, 103, 107 | — | — | — | 37, 38, 39 |
| `src/components/compras/cotacao/CotacaoView.tsx` | 0 | — | — | — | — | — | — | — | — | 42, 43 |
| `src/components/ComprasView.tsx` | 1 | 1, 6, 36, 37 | — | — | — | — | — | 3, 50 | — | 41, 42, 43, 44, 45, 46, 47, 48 |
| `src/hooks/useRelatoriosData.ts` | 5 | 1, 185 | — | — | — | — | — | — | — | — |
| `src/components/AnaliseItemView.tsx` | 3 | 1, 80 | — | — | — | — | — | — | — | 81 |
| `src/components/relatorios/GastosPorSetorChart.tsx` | 1 | 1, 32 | — | — | — | — | — | — | — | 33 |
| `src/components/RelatoriosView.tsx` | 0 | — | — | — | — | — | — | — | — | 60 |
| `src/components/cmv/CmvFiltersBar.tsx` | 1 | 1, 30 | — | — | — | — | — | — | — | — |
| `src/components/CmvView.tsx` | 4 | 1, 2, 24, 26 | — | — | — | 77, 115, 148, 169, 175 | 19, 63, 75, 85, 107, 129, 144, 171, 172 | — | — | 28 |
| `src/components/FichaTecnicaView.tsx` | 2 | 1, 223, 568, 906, 1068, 1166, 1371 | — | — | — | 301, 340, 348, 349, 402, 403, 483, 484, 625, 649, 651, 681, 919, 930, 932, 1080, 1093, 1097, 1185, 1383, 1385 | — | 78 | — | 228, 229, 230, 231, 232, 233, 234, 235, 236, 237, 238, 239 |
| `src/lib/exportHelpers.ts` | 0 | — | — | — | — | 81, 85 | — | — | — | — |
| `src/components/SecurityAuditView.tsx` | 1 | 1, 33 | — | 58 | — | — | — | — | — | 34 |
| `src/components/GlobalAuditView.tsx` | 3 | 1, 86 | — | — | — | — | — | — | — | 87, 88 |
| `src/components/PerformanceMonitorView.tsx` | 2 | 1, 24 | — | — | — | — | — | — | — | 25, 26 |
| `src/hooks/usePasswordValidation.ts` | 1 | 1, 24 | — | — | — | — | — | — | — | — |
| `src/components/PermissionMatrix.tsx` | 3 | 3, 20 | — | — | 26, 37, 47 | — | — | — | — | — |
| `src/components/ui/TableActions.tsx` | 0 | — | — | — | — | — | — | — | — | 42, 43 |
| `src/components/AdminUsersView.tsx` | 5 | 1, 5, 60, 61 | — | — | — | 173, 186, 220, 252, 255, 264, 265, 271, 308, 309, 314, 322, 325, 328, 331, 342, 344, 349, 355, 359, 364, 369, 375, 384, 386 | — | — | — | 63 |
| `src/hooks/useIntegracoesConfig.ts` | 4 | 2, 3, 47, 48 | — | — | — | — | — | — | — | — |
| `src/components/configuracoes/IntegracoesView.tsx` | 0 | — | — | — | — | 63, 66, 77, 80 | — | — | — | — |
| `src/components/ConfiguracoesView.tsx` | 0 | — | — | — | — | 75 | — | — | — | 59, 60 |
| `src/hooks/useInventarioStore.ts` | 1 | 1, 98 | — | — | — | 124, 141, 155, 177, 179, 182, 185, 195, 201, 215, 225, 229, 232, 233, 236, 246, 249, 256, 258, 266, 269, 270, 272, 282, 286, 288, 299, 308, 315, 318, 325, 328, 335, 338 | — | — | — | — |
| `src/hooks/useQuantityNavigation.ts` | 1 | — | — | — | 18 | — | 4 | — | — | — |
| `src/components/QuickInventorySection.tsx` | 5 | 1, 35 | — | — | 134 | 132, 159, 181, 192, 194 | — | — | — | 36 |
| `src/lib/pdfInventarioContagem.ts` | 1 | — | — | — | — | 302 | 72 | — | — | — |
| `src/components/inventario/ExportListaContagemModal.tsx` | 0 | — | — | — | — | 53, 57 | — | — | — | — |
| `src/components/InventarioView.tsx` | 3 | 1, 957 | — | — | — | 160, 175, 193, 207 | — | — | — | 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64 |
| `src/components/CentralIAView.tsx` | 1 | 1, 132 | — | — | — | — | — | — | — | 151 |
| `src/components/rh/EscalasSection.tsx` | 14 | 1, 2, 3, 5, 75, 76, 78, 195 | — | — | 149, 177, 195, 224, 231 | 155, 156, 183, 184, 191, 205, 206, 225, 226, 236, 237 | — | — | — | 77 |
| `src/components/rh/TarefasSection.tsx` | 7 | 1, 2, 3, 5, 77, 78, 80, 131 | — | — | 131, 161, 173 | 123, 143, 144, 163, 164, 176 | — | — | — | 79 |
| `src/components/rh/OnboardingSection.tsx` | 7 | 1, 2, 3, 5, 101, 102, 104, 141 | — | — | 141, 168, 201 | 140, 150, 151, 171, 203, 204 | — | — | — | 103 |
| `src/components/rh/TreinamentoSection.tsx` | 8 | 1, 2, 3, 5, 86, 87, 89, 131, 161 | — | — | 131, 161, 196 | 129, 140, 141, 148, 153, 166, 167, 169, 175, 203, 204, 205, 224 | — | — | — | 88 |
| `src/components/rh/FeriasAfastamentosSection.tsx` | 10 | 1, 2, 3, 5, 89, 90, 92, 151 | — | — | 151, 191, 208 | 143, 146, 161, 162, 171, 180, 181, 189, 195, 197, 212, 213 | — | — | — | 91 |
| `src/components/rh/DocumentosComplianceSection.tsx` | 10 | 1, 2, 3, 5, 78, 79, 81, 159 | — | — | 159, 216 | 138, 153, 174, 175, 181, 195, 198, 207, 217, 218 | — | — | — | 80 |
| `src/components/rh/FolhaPagamentoSection.tsx` | 10 | 1, 2, 3, 5, 97, 98, 100, 202 | — | — | 200, 202, 216, 226 | 128, 206, 210, 220, 221, 229, 230 | 138 | — | — | 99 |
| `src/components/rh/BeneficiosSection.tsx` | 9 | 1, 2, 3, 7, 82, 83, 85, 156, 223 | — | — | 152, 156, 192, 223 | 130, 131, 153, 154, 157, 158, 193, 194, 207, 224, 225 | — | — | — | 84 |
| `src/components/rh/DashboardRhSection.tsx` | 5 | 1, 47 | — | — | — | — | — | — | — | 48 |
| `src/components/rh/SSTSection.tsx` | 15 | 1, 2, 3, 5, 57, 58, 60, 162, 163, 170, 293, 294, 301, 438, 439, 451 | — | — | 170, 181, 301, 316, 451, 464 | 169, 173, 174, 182, 183, 300, 308, 309, 317, 318, 450, 456, 457, 467, 468 | — | — | — | 59 |
| `src/components/rh/ComunicacaoInternaSection.tsx` | 9 | 1, 2, 3, 5, 51, 52, 54, 116 | — | — | 112, 116, 143, 150 | 96, 113, 114, 119, 120, 144, 145, 151, 152 | — | — | — | 53 |
| `src/components/rh/ControleCustosRhSection.tsx` | 5 | 1, 2, 3, 5, 60, 61, 63, 151 | — | — | 151 | 84, 153, 154, 158 | — | — | — | 62 |
| `src/components/rh/GestaoDisciplinarSection.tsx` | 5 | 1, 2, 3, 5, 51, 52, 53, 118 | — | — | 118, 137 | 96, 120, 121, 145, 146 | — | — | — | — |
| `src/components/RhView.tsx` | 20 | 1, 2, 3, 9, 122, 142, 143, 298, 371 | — | — | 298, 336, 350, 357, 371, 393, 444 | 284, 299, 300, 323, 337, 338, 351, 352, 358, 359, 366, 379, 380, 390, 396, 397, 414, 415, 428, 448, 449, 464, 465, 466, 469 | — | 5, 171 | — | 145, 146, 147, 148, 149, 150, 151, 152, 153 |
| `src/lib/pdfFinanceiro.ts` | 0 | — | — | — | — | 61, 81, 101 | — | — | — | — |
| `src/lib/categoriaOptions.ts` | 0 | — | — | — | — | — | 22 | — | — | — |
| `src/components/financeiro/CategoryCombobox.tsx` | 1 | — | — | — | — | — | 42 | — | — | — |
| `src/lib/safeXlsx.ts` | 1 | — | — | — | — | — | — | — | — | — |
| `src/components/financeiro/DateRangePresets.tsx` | 2 | — | — | — | — | — | — | — | — | — |
| `src/components/financeiro/ContasPagarSection.tsx` | 20 | 1, 88 | — | — | — | 233, 240, 243, 299, 358, 372, 373, 376, 385, 389, 391, 435, 443, 445, 461, 462, 464, 500, 501, 512, 516, 519, 520, 521, 535, 536, 538, 539 | — | — | — | 89, 90, 91, 92, 93 |
| `src/components/financeiro/ContasReceberSection.tsx` | 15 | 1, 85 | — | — | — | 257, 314, 328, 329, 332, 341, 345, 347, 382, 385, 389, 390, 407, 415, 416, 419, 420, 434, 435, 437, 438 | — | — | — | 86, 87, 88, 89 |
| `src/components/financeiro/FluxoCaixaSection.tsx` | 4 | 1, 91 | — | — | 155 | 122 | — | — | — | 92, 93 |
| `src/components/financeiro/CadastroBaseTree.tsx` | 21 | 1, 2, 3, 5, 369, 370, 371, 552 | — | — | 442, 453, 539, 552, 592, 635 | 514, 519, 544, 546, 549, 553, 554, 558, 567, 578, 593, 594, 596, 646, 648, 650, 654, 669, 672, 676, 679, 725, 727, 730, 739, 745, 747, 749, 752, 784 | 55 | — | — | 372, 373, 374, 375, 376 |
| `src/lib/exportDemonstrativo.ts` | 0 | — | — | — | — | 171 | — | — | — | — |
| `src/components/financeiro/DemonstrativoTree.tsx` | 1 | — | — | — | 217 | — | — | — | — | — |
| `src/components/financeiro/DRESection.tsx` | 2 | 1, 55 | — | — | — | 80 | — | — | — | 63, 64 |
| `src/components/financeiro/DFCSection.tsx` | 2 | 1, 54 | — | — | — | 83 | — | — | — | 63, 64 |
| `src/components/financeiro/DashboardCharts.tsx` | 2 | 1, 59 | — | — | — | 83 | — | — | — | 60 |
| `src/components/financeiro/DashboardFinanceiroSection.tsx` | 3 | 1, 84 | — | — | — | 126, 168, 214, 215, 217, 241, 243 | — | — | — | 85, 86 |
| `src/components/financeiro/AlertasSection.tsx` | 2 | 1, 90 | — | — | — | 111, 227, 272 | — | — | — | 91, 92 |
| `src/components/financeiro/RecorrenciasSection.tsx` | 5 | 1, 103 | — | — | — | 158, 190, 211, 224, 226, 233, 235, 239, 240, 246, 275 | — | — | — | 104, 105, 106 |
| `src/components/financeiro/CategorizacaoSection.tsx` | 14 | 1, 2, 3, 82, 83, 189 | — | — | 185, 189, 211 | 160, 169, 186, 187, 190, 191, 196, 212, 213, 215, 225, 227, 235, 237, 238, 239, 243, 252, 257, 268, 276 | — | — | — | 84, 85, 86, 87, 88 |
| `src/components/financeiro/FechamentoMarcasTab.tsx` | 8 | 1, 15, 67, 68 | — | — | 150, 158, 186 | 133, 137, 141, 153, 165, 169, 175, 189, 190, 193 | 101 | — | — | — |
| `src/components/financeiro/FechamentoCaixaSection.tsx` | 8 | 1, 91 | — | — | — | 139, 157, 174, 249, 256, 257, 258, 259, 260, 286, 288, 290, 293, 297, 316, 319, 322, 411, 412, 414, 447, 449 | 14, 294, 295, 317, 318, 339, 344, 351 | — | — | 92, 93, 94, 95, 96 |
| `src/lib/conciliacaoSaldoExtrato.ts` | 0 | — | — | — | — | — | — | 66, 68, 74, 87, 89 | — | — |
| `src/components/financeiro/ContasBancariasSection.tsx` | 8 | 1, 2, 3, 5, 105, 106, 107, 269 | — | — | 269 | 242, 266, 267, 270, 271, 276, 293, 315, 317, 320, 340 | — | — | — | 108, 109, 110, 111, 112, 113, 114 |
| `src/components/financeiro/LivroRazaoSection.tsx` | 14 | 1, 3, 120, 122 | — | — | — | 341, 362, 366, 370, 386, 429, 433, 437, 441, 468, 470, 475, 478, 479, 493, 500, 503, 506, 514, 518, 519, 520, 533, 534, 544, 545, 549, 561, 562, 563, 566, 633, 635, 640, 643, 665 | 273, 283 | — | — | 123, 124, 125, 126, 127 |
| `src/components/financeiro/PlanoContasFinSection.tsx` | 5 | 1, 2, 3, 5, 42, 43, 45, 94 | — | — | 94 | 80, 91, 92, 95, 96, 100, 107, 109, 112 | — | — | — | 44 |
| `src/components/financeiro/CentrosCustoFinSection.tsx` | 5 | 1, 2, 3, 5, 38, 39, 41, 85 | — | — | 85 | 74, 82, 83, 86, 87, 91, 98, 100, 103 | — | — | — | 40 |
| `src/components/financeiro/OrcamentoSection.tsx` | 6 | 1, 127 | — | — | 285 | 178, 316, 318, 324, 326, 328, 330, 352, 353, 356, 372, 374, 377, 380, 423, 424, 453 | 76 | — | — | 143, 144, 145, 146 |
| `src/lib/extratoParser.ts` | 2 | — | — | — | — | — | — | — | — | — |
| `src/components/financeiro/CriarLancamentoExtratoDialog.tsx` | 17 | 1, 2, 3, 16, 57, 58, 60, 288, 354 | — | — | 242, 288, 304, 354, 365 | 175, 176, 177, 178, 179, 227, 246, 247, 268, 311, 312, 313, 333, 372, 373, 374, 378, 382 | — | — | — | 59 |
| `src/components/financeiro/ConfirmarSaldoExtratoDialog.tsx` | 1 | 1, 80 | — | — | — | 97, 102, 106, 115, 128, 139 | — | — | — | 93 |
| `src/lib/conciliacaoConciliados.ts` | 1 | — | — | — | 141 | — | 58, 66, 102, 116 | — | — | — |
| `src/components/financeiro/ConciliacaoBancariaSection.tsx` | 47 | 1, 2, 22, 210, 213, 214 | — | 215, 343, 345, 411, 430, 433, 436, 437, 3606 | 193, 1083, 2008, 2788 | 517, 552, 557, 564, 565, 570, 571, 574, 581, 585, 589, 598, 634, 640, 641, 642, 644, 683, 685, 690, 693, 694, 702, 706, 718, 720, 721, 726, 776, 778, 780, 783, 784, 798, 803, 810, 813, 814, 1232, 1316, 1320, 1328, 1331, 1409, 1436, 1443, 1462, 1486, 1500, 1502, 1524, 1527, 1592, 1596, 1601, 1657, 1668, 1685, 1729, 1735, 1787, 1788, 1789, 1791, 1844, 1849, 1853, 1887, 1902, 1905, 1906, 1907, 1908, 1912, 1919, 1957, 1966, 2078, 2080, 2087, 2088, 2089, 2090, 2093, 2189, 2190, 2204, 2209, 2213, 3607 | 157, 962, 983, 984, 1006, 1274, 1359, 1979, 1985 | 119, 123, 128, 130, 134, 320, 341, 375, 1448, 2084 | — | 211, 212 |
| `src/domain/financeiro/bordero/report.ts` | 0 | — | — | — | — | — | 355, 365, 550 | — | — | — |
| `src/hooks/useBordero.ts` | 1 | 3, 30, 54 | 57, 70 | 32, 35 | — | 70 | — | — | — | — |
| `src/components/financeiro/bordero/BorderoCategoryTable.tsx` | 1 | — | — | — | 43 | — | — | — | — | — |
| `src/lib/borderoPdfExport.ts` | 0 | — | — | — | — | 434 | — | — | — | — |
| `src/components/financeiro/BorderoSection.tsx` | 2 | 5, 112 | — | — | — | 134, 137 | — | — | — | 109, 110 |
| `src/lib/presentationSlides.ts` | 3 | — | — | — | — | — | 235, 236 | — | — | — |
| `src/lib/financeiroPresentationAdapter.ts` | 0 | — | — | — | — | — | 389, 491 | — | — | — |
| `src/components/financeiro/PresentationFinancialTree.tsx` | 1 | — | — | — | 55 | — | — | — | — | — |
| `src/hooks/usePresentationDetail.ts` | 2 | 1, 235, 258 | 238, 246, 260 | 192, 205, 213, 224 | — | 246 | — | — | — | — |
| `src/hooks/usePresentationExpenseDetails.ts` | 1 | 1, 39 | 64 | 56 | — | 64 | — | — | — | — |
| `src/hooks/usePresentationDecisions.ts` | 10 | 1, 76, 114, 132, 149 | 79, 116, 134, 153, 156 | — | 2, 161, 187, 208, 231, 262, 287, 313 | 153, 155 | — | — | — | — |
| `src/components/financeiro/PresentationDecisionRegisterDialog.tsx` | 0 | — | — | — | 187 | 172, 197, 202 | — | 122, 134, 139, 151, 196 | — | — |
| `src/components/financeiro/PresentationDecisionGovernance.tsx` | 0 | — | — | 170, 214 | 251, 278, 290, 320, 340, 348, 371 | 245, 258, 266, 288, 299, 328, 357, 379 | — | — | — | — |
| `src/hooks/usePresentationMeetings.ts` | 8 | 1, 77, 115, 146 | 80, 117, 149, 152 | — | 2, 157, 182, 208, 226, 244 | 149, 151 | — | — | — | — |
| `src/lib/presentationMeetingDraft.ts` | 0 | — | — | — | — | — | — | 46, 56, 66, 72, 82 | — | — |
| `src/lib/presentationPdfExport.ts` | 2 | — | — | 50, 79, 83 | — | — | 466, 507, 604 | — | — | — |
| `src/lib/presentationMinutesPdfExport.ts` | 0 | — | — | 16, 20 | — | — | — | — | — | — |
| `src/lib/presentationMinutesPptxExport.ts` | 1 | — | — | 18, 100 | — | — | — | — | — | — |
| `src/components/financeiro/PresentationMeetingGovernance.tsx` | 0 | 1, 176 | — | 175, 239, 385, 389 | 253, 261, 287, 315, 322, 336 | 119, 259, 263, 274, 283, 296, 320, 327, 343, 349, 358, 385, 389, 391, 394 | — | — | — | — |
| `src/components/financeiro/PresentationScenarioSection.tsx` | 0 | — | — | — | — | — | 633 | — | — | — |
| `src/hooks/usePresentationSocios.ts` | 1 | 1, 168 | 32, 113, 181, 198 | 131, 135 | — | 198 | — | — | — | — |
| `src/hooks/usePresentationRevenue.ts` | 1 | 1, 109 | 25, 57, 117, 127 | 68, 71 | — | 127 | — | — | — | — |
| `src/lib/expensesPresentationAdapter.ts` | 0 | — | — | — | — | — | 244 | — | — | — |
| `src/hooks/usePresentationExpenses.ts` | 1 | 1, 102 | 25, 57, 110, 120 | 63, 66 | — | 120 | — | — | — | — |
| `src/hooks/usePresentationCategoryMetadata.ts` | 1 | 1, 46 | 48 | — | — | — | — | — | — | — |
| `src/hooks/usePresentationPlan.ts` | 1 | 1, 316 | 320, 340 | 281, 294 | — | 340 | — | — | — | — |
| `src/hooks/usePresentationScenario.ts` | 0 | — | — | — | — | — | — | 66, 87, 136, 141, 161, 163, 221 | — | — |
| `src/components/financeiro/PresentationCompanyScope.tsx` | 4 | 3, 11, 13, 16, 17 | — | — | 16, 19, 20 | — | — | — | — | — |
| `src/components/financeiro/PresentationSlideCanvas.tsx` | 2 | — | — | — | — | 289 | 330, 403, 566 | — | — | — |
| `src/lib/presentationPptxExport.ts` | 2 | — | — | 68, 72 | — | — | 482, 527, 630 | — | — | — |
| `src/components/financeiro/PresentationMode.tsx` | 1 | — | — | 154, 291, 331 | — | 58, 280, 303, 304, 312, 313, 316, 319, 338, 341 | 141 | — | — | — |
| `src/components/financeiro/ApresentacaoSociosSection.tsx` | 0 | 58, 151 | — | — | — | — | — | — | — | 152, 153, 154, 155, 156 |
| `src/components/financeiro/ProjecaoFluxoSection.tsx` | 2 | 1, 58 | — | — | — | 84, 86, 97, 174 | — | — | — | 59, 60 |
| `src/components/financeiro/KPIsSection.tsx` | 2 | 1, 76 | — | — | — | 97, 99, 129, 232 | — | — | — | 77, 78 |
| `src/components/financeiro/AuditoriaFinSection.tsx` | 5 | 1, 155 | — | — | 291 | 209, 211, 232, 348 | — | — | — | 156, 157 |
| `src/components/financeiro/ComparativoSection.tsx` | 2 | 1, 76 | — | — | — | 90, 91, 105, 107, 117, 239 | — | — | — | 77, 78 |
| `src/components/FinanceiroView.tsx` | 1 | 1, 165 | — | — | — | — | 278 | 3, 166 | — | 47, 48, 49 |
| `src/pages/Index.tsx` | 0 | 8, 56 | — | — | — | 121, 131, 183, 194 | — | 3, 112 | — | — |
| `src/pages/Login.tsx` | 0 | 1, 4, 15, 16 | — | — | — | 35, 45, 50 | — | — | — | — |
| `src/pages/ResetPassword.tsx` | 0 | 1, 13 | — | — | — | 22, 31, 36, 45, 51, 53 | — | — | — | — |
| `src/components/admin/CheckupSuiteCard.tsx` | 2 | 1, 215 | — | — | — | 133, 193, 291 | — | — | — | 144, 145 |
| `src/components/admin/AccessManagementCard.tsx` | 4 | 1, 3, 32, 33 | — | — | — | 59, 64, 81, 113, 115, 117, 123, 132, 136, 150, 152, 162 | — | — | — | — |
| `src/components/admin/BugTrackerView.tsx` | 6 | 1, 4, 5, 55, 56, 57, 298 | — | — | 134, 147 | 82, 111, 136, 137, 141, 157, 158 | — | — | — | — |
| `src/components/admin/AdminCompaniesView.tsx` | 5 | 1, 3, 36, 37 | — | — | — | 85, 95, 101, 117, 128, 132, 148, 150, 167, 171, 175, 189, 192 | — | — | — | 38, 39 |
| `src/pages/AdminPanel.tsx` | 1 | 1, 4, 19, 41 | — | — | — | 69 | — | 67, 68, 242 | — | 43 |
| `src/components/FloatingCalculator.tsx` | 0 | — | — | — | — | — | — | 24, 35 | — | — |
| `src/App.tsx` | 0 | — | 94 | — | — | 116, 128 | — | 54, 55, 60, 83 | — | — |
| `src/main.tsx` | 0 | — | — | — | — | — | — | 21, 22, 26, 39, 40, 43 | — | — |
| `src/components/financeiro/CategoriasFinSection.tsx` | 6 | 1, 3, 45, 47 | — | — | 100 | 85, 97, 98, 101, 102, 106, 113, 115, 118 | — | — | — | 46 |
| `src/lib/pdfGenerator.ts` | 0 | — | — | — | — | 48 | — | — | — | — |
