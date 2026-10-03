export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      admin_actions_log: {
        Row: {
          action: string
          actor_user_id: string
          company_id: string
          created_at: string
          details: Json | null
          id: string
          target_email: string | null
          target_user_id: string | null
        }
        Insert: {
          action: string
          actor_user_id: string
          company_id: string
          created_at?: string
          details?: Json | null
          id?: string
          target_email?: string | null
          target_user_id?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string
          company_id?: string
          created_at?: string
          details?: Json | null
          id?: string
          target_email?: string | null
          target_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_actions_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_insights: {
        Row: {
          agente: string
          company_id: string
          created_at: string
          created_by: string | null
          dados: Json | null
          descricao: string
          id: string
          impacto: string | null
          periodo: string
          recomendacao: string | null
          severidade: string
          tipo: string
          titulo: string
        }
        Insert: {
          agente?: string
          company_id: string
          created_at?: string
          created_by?: string | null
          dados?: Json | null
          descricao?: string
          id?: string
          impacto?: string | null
          periodo: string
          recomendacao?: string | null
          severidade?: string
          tipo?: string
          titulo?: string
        }
        Update: {
          agente?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          dados?: Json | null
          descricao?: string
          id?: string
          impacto?: string | null
          periodo?: string
          recomendacao?: string | null
          severidade?: string
          tipo?: string
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_ai_insights_company"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_logs: {
        Row: {
          agente: string
          company_id: string
          contexto_enviado: Json | null
          created_at: string
          entrada_usuario: string
          id: string
          idempotency_key: string
          metadata: Json | null
          periodo: string | null
          resposta_ia: string
          user_id: string
        }
        Insert: {
          agente?: string
          company_id: string
          contexto_enviado?: Json | null
          created_at?: string
          entrada_usuario?: string
          id?: string
          idempotency_key?: string
          metadata?: Json | null
          periodo?: string | null
          resposta_ia?: string
          user_id: string
        }
        Update: {
          agente?: string
          company_id?: string
          contexto_enviado?: Json | null
          created_at?: string
          entrada_usuario?: string
          id?: string
          idempotency_key?: string
          metadata?: Json | null
          periodo?: string | null
          resposta_ia?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_ai_logs_company"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_score_historico: {
        Row: {
          classificacao: string
          company_id: string
          componentes: Json
          created_at: string
          id: string
          periodo: string
          score_total: number
        }
        Insert: {
          classificacao?: string
          company_id: string
          componentes?: Json
          created_at?: string
          id?: string
          periodo: string
          score_total?: number
        }
        Update: {
          classificacao?: string
          company_id?: string
          componentes?: Json
          created_at?: string
          id?: string
          periodo?: string
          score_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "ai_score_historico_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      alertas_falta_estoque: {
        Row: {
          company_id: string
          confirmado_em: string | null
          confirmado_por: string | null
          created_at: string
          created_by: string
          id: string
          origem: string
          produto_id: string
          produto_nome: string
          quantidade_solicitada: number
          requisicao_id: string | null
          requisicao_item_id: string | null
          saldo_no_momento: number
          setor_solicitante: string
          status: string
          unidade: string
        }
        Insert: {
          company_id: string
          confirmado_em?: string | null
          confirmado_por?: string | null
          created_at?: string
          created_by: string
          id?: string
          origem?: string
          produto_id: string
          produto_nome?: string
          quantidade_solicitada?: number
          requisicao_id?: string | null
          requisicao_item_id?: string | null
          saldo_no_momento?: number
          setor_solicitante?: string
          status?: string
          unidade?: string
        }
        Update: {
          company_id?: string
          confirmado_em?: string | null
          confirmado_por?: string | null
          created_at?: string
          created_by?: string
          id?: string
          origem?: string
          produto_id?: string
          produto_nome?: string
          quantidade_solicitada?: number
          requisicao_id?: string | null
          requisicao_item_id?: string | null
          saldo_no_momento?: number
          setor_solicitante?: string
          status?: string
          unidade?: string
        }
        Relationships: [
          {
            foreignKeyName: "alertas_falta_estoque_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alertas_falta_estoque_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "mv_giro_estoque"
            referencedColumns: ["produto_id"]
          },
          {
            foreignKeyName: "alertas_falta_estoque_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alertas_falta_estoque_requisicao_id_fkey"
            columns: ["requisicao_id"]
            isOneToOne: false
            referencedRelation: "requisicoes_estoque"
            referencedColumns: ["id"]
          },
        ]
      }
      app_config: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      aprovacoes_solic_compra_mercado: {
        Row: {
          aprovado_em: string
          aprovado_por_user_id: string | null
          comentario: string | null
          company_id: string
          decisao: string
          id: string
          solicitacao_id: string
        }
        Insert: {
          aprovado_em?: string
          aprovado_por_user_id?: string | null
          comentario?: string | null
          company_id?: string
          decisao: string
          id?: string
          solicitacao_id: string
        }
        Update: {
          aprovado_em?: string
          aprovado_por_user_id?: string | null
          comentario?: string | null
          company_id?: string
          decisao?: string
          id?: string
          solicitacao_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "aprovacoes_solic_compra_mercado_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aprovacoes_solic_compra_mercado_solicitacao_id_fkey"
            columns: ["solicitacao_id"]
            isOneToOne: false
            referencedRelation: "solic_compra_mercado"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_inventario_log: {
        Row: {
          acao: string
          antes: Json | null
          company_id: string | null
          created_at: string
          depois: Json | null
          id: string
          inventario_id: string | null
          ip_address: string | null
          item_id: string | null
          user_id: string
          user_role: string
        }
        Insert: {
          acao: string
          antes?: Json | null
          company_id?: string | null
          created_at?: string
          depois?: Json | null
          id?: string
          inventario_id?: string | null
          ip_address?: string | null
          item_id?: string | null
          user_id: string
          user_role?: string
        }
        Update: {
          acao?: string
          antes?: Json | null
          company_id?: string | null
          created_at?: string
          depois?: Json | null
          id?: string
          inventario_id?: string | null
          ip_address?: string | null
          item_id?: string | null
          user_id?: string
          user_role?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_inventario_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_inventario_log_inventario_id_fkey"
            columns: ["inventario_id"]
            isOneToOne: false
            referencedRelation: "inventarios"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          acao: string
          campo: string | null
          company_id: string | null
          created_at: string
          id: string
          log_scope: string
          registro_id: string
          scope_reason: string
          tabela: string
          user_id: string | null
          valor_anterior: string | null
          valor_novo: string | null
        }
        Insert: {
          acao: string
          campo?: string | null
          company_id?: string | null
          created_at?: string
          id?: string
          log_scope?: string
          registro_id: string
          scope_reason?: string
          tabela: string
          user_id?: string | null
          valor_anterior?: string | null
          valor_novo?: string | null
        }
        Update: {
          acao?: string
          campo?: string | null
          company_id?: string | null
          created_at?: string
          id?: string
          log_scope?: string
          registro_id?: string
          scope_reason?: string
          tabela?: string
          user_id?: string | null
          valor_anterior?: string | null
          valor_novo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_email: string | null
          actor_role: string | null
          actor_user_id: string | null
          after: Json | null
          before: Json | null
          company_id: string | null
          created_at: string
          entity: string
          entity_id: string | null
          entity_unaccent: string | null
          id: string
          log_scope: string
          metadata: Json | null
          module: string
          scope_reason: string
          severity: string
          source: string
          success: boolean
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_role?: string | null
          actor_user_id?: string | null
          after?: Json | null
          before?: Json | null
          company_id?: string | null
          created_at?: string
          entity: string
          entity_id?: string | null
          entity_unaccent?: string | null
          id?: string
          log_scope?: string
          metadata?: Json | null
          module: string
          scope_reason?: string
          severity?: string
          source?: string
          success?: boolean
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_role?: string | null
          actor_user_id?: string | null
          after?: Json | null
          before?: Json | null
          company_id?: string | null
          created_at?: string
          entity?: string
          entity_id?: string | null
          entity_unaccent?: string | null
          id?: string
          log_scope?: string
          metadata?: Json | null
          module?: string
          scope_reason?: string
          severity?: string
          source?: string
          success?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      canais_venda: {
        Row: {
          ativo: boolean
          company_id: string
          created_at: string
          custo_embalagem_adicional: number
          deleted_at: string | null
          deleted_by: string | null
          id: string
          imposto_percent: number
          nome: string
          taxa_fixa: number
          taxa_percentual: number
        }
        Insert: {
          ativo?: boolean
          company_id?: string
          created_at?: string
          custo_embalagem_adicional?: number
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          imposto_percent?: number
          nome: string
          taxa_fixa?: number
          taxa_percentual?: number
        }
        Update: {
          ativo?: boolean
          company_id?: string
          created_at?: string
          custo_embalagem_adicional?: number
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          imposto_percent?: number
          nome?: string
          taxa_fixa?: number
          taxa_percentual?: number
        }
        Relationships: [
          {
            foreignKeyName: "canais_venda_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      cenarios_simulacao: {
        Row: {
          company_id: string
          componente_id: string
          created_at: string
          created_by: string | null
          id: string
          nome: string
          params: Json
          resultado: Json
        }
        Insert: {
          company_id?: string
          componente_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          nome: string
          params?: Json
          resultado?: Json
        }
        Update: {
          company_id?: string
          componente_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          nome?: string
          params?: Json
          resultado?: Json
        }
        Relationships: [
          {
            foreignKeyName: "cenarios_simulacao_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cenarios_simulacao_componente_id_fkey"
            columns: ["componente_id"]
            isOneToOne: false
            referencedRelation: "ficha_componentes"
            referencedColumns: ["id"]
          },
        ]
      }
      cmv_cache: {
        Row: {
          cache_key: string
          company_id: string
          created_at: string
          created_by: string | null
          data: Json
          expires_at: string
          id: string
        }
        Insert: {
          cache_key: string
          company_id: string
          created_at?: string
          created_by?: string | null
          data?: Json
          expires_at: string
          id?: string
        }
        Update: {
          cache_key?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          data?: Json
          expires_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cmv_cache_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          ativo: boolean
          cnpj: string | null
          created_at: string
          id: string
          nome: string
          onboarding_request_id: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          cnpj?: string | null
          created_at?: string
          id?: string
          nome: string
          onboarding_request_id?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          cnpj?: string | null
          created_at?: string
          id?: string
          nome?: string
          onboarding_request_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      company_memberships: {
        Row: {
          company_id: string
          created_at: string
          id: string
          job_role_id: string | null
          sector: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          job_role_id?: string | null
          sector?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          job_role_id?: string | null
          sector?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_memberships_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_memberships_job_role_id_fkey"
            columns: ["job_role_id"]
            isOneToOne: false
            referencedRelation: "job_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      config_precificacao: {
        Row: {
          company_id: string
          created_at: string
          id: string
          origem_preco_salmao: string | null
          preco_referencia_salmao_auto: number | null
          preco_referencia_salmao_manual: number | null
          ultimo_lote_info: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          company_id?: string
          created_at?: string
          id?: string
          origem_preco_salmao?: string | null
          preco_referencia_salmao_auto?: number | null
          preco_referencia_salmao_manual?: number | null
          ultimo_lote_info?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          origem_preco_salmao?: string | null
          preco_referencia_salmao_auto?: number | null
          preco_referencia_salmao_manual?: number | null
          ultimo_lote_info?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "config_precificacao_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      confirmacoes_recebimento: {
        Row: {
          company_id: string
          criado_em: string
          criado_por: string
          id: string
          mensagem: string
          recebimento_id: string
          responsavel_compra_id: string | null
          solicitacao_id: string
          visto_por: string[] | null
        }
        Insert: {
          company_id?: string
          criado_em?: string
          criado_por: string
          id?: string
          mensagem?: string
          recebimento_id: string
          responsavel_compra_id?: string | null
          solicitacao_id: string
          visto_por?: string[] | null
        }
        Update: {
          company_id?: string
          criado_em?: string
          criado_por?: string
          id?: string
          mensagem?: string
          recebimento_id?: string
          responsavel_compra_id?: string | null
          solicitacao_id?: string
          visto_por?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "confirmacoes_recebimento_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "confirmacoes_recebimento_recebimento_id_fkey"
            columns: ["recebimento_id"]
            isOneToOne: false
            referencedRelation: "recebimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "confirmacoes_recebimento_solicitacao_id_fkey"
            columns: ["solicitacao_id"]
            isOneToOne: false
            referencedRelation: "solic_compra_mercado"
            referencedColumns: ["id"]
          },
        ]
      }
      cotacao_fornecedores: {
        Row: {
          company_id: string
          condicao_pagamento: string | null
          cotacao_id: string
          created_at: string
          frete: number
          id: string
          mensagem_enviada_em: string | null
          observacao: string | null
          pedido_minimo_snapshot: number
          prazo_entrega_dias: number | null
          respondido_em: string | null
          status: string
          supplier_id: string | null
          supplier_nome_snapshot: string
          updated_at: string
          whatsapp_snapshot: string | null
        }
        Insert: {
          company_id: string
          condicao_pagamento?: string | null
          cotacao_id: string
          created_at?: string
          frete?: number
          id?: string
          mensagem_enviada_em?: string | null
          observacao?: string | null
          pedido_minimo_snapshot?: number
          prazo_entrega_dias?: number | null
          respondido_em?: string | null
          status?: string
          supplier_id?: string | null
          supplier_nome_snapshot: string
          updated_at?: string
          whatsapp_snapshot?: string | null
        }
        Update: {
          company_id?: string
          condicao_pagamento?: string | null
          cotacao_id?: string
          created_at?: string
          frete?: number
          id?: string
          mensagem_enviada_em?: string | null
          observacao?: string | null
          pedido_minimo_snapshot?: number
          prazo_entrega_dias?: number | null
          respondido_em?: string | null
          status?: string
          supplier_id?: string | null
          supplier_nome_snapshot?: string
          updated_at?: string
          whatsapp_snapshot?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cotacao_fornecedores_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cotacao_fornecedores_cotacao_id_fkey"
            columns: ["cotacao_id"]
            isOneToOne: false
            referencedRelation: "cotacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cotacao_fornecedores_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cotacao_supplier_tenant_fk"
            columns: ["supplier_id", "company_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id", "company_id"]
          },
        ]
      }
      cotacao_ia_config: {
        Row: {
          api_key: string | null
          ativo: boolean
          company_id: string
          created_at: string
          id: string
          model: string | null
          provider: string
          updated_at: string
        }
        Insert: {
          api_key?: string | null
          ativo?: boolean
          company_id: string
          created_at?: string
          id?: string
          model?: string | null
          provider?: string
          updated_at?: string
        }
        Update: {
          api_key?: string | null
          ativo?: boolean
          company_id?: string
          created_at?: string
          id?: string
          model?: string | null
          provider?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cotacao_ia_config_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      cotacao_itens: {
        Row: {
          company_id: string
          conversion_factor_snapshot: number
          cotacao_id: string
          created_at: string
          id: string
          observacao: string | null
          produto_id: string | null
          produto_nome_snapshot: string
          purchase_unit_snapshot: string | null
          quantidade: number
          unidade_snapshot: string | null
          updated_at: string
        }
        Insert: {
          company_id: string
          conversion_factor_snapshot?: number
          cotacao_id: string
          created_at?: string
          id?: string
          observacao?: string | null
          produto_id?: string | null
          produto_nome_snapshot: string
          purchase_unit_snapshot?: string | null
          quantidade?: number
          unidade_snapshot?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          conversion_factor_snapshot?: number
          cotacao_id?: string
          created_at?: string
          id?: string
          observacao?: string | null
          produto_id?: string | null
          produto_nome_snapshot?: string
          purchase_unit_snapshot?: string | null
          quantidade?: number
          unidade_snapshot?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cotacao_itens_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cotacao_itens_cotacao_id_fkey"
            columns: ["cotacao_id"]
            isOneToOne: false
            referencedRelation: "cotacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cotacao_itens_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "mv_giro_estoque"
            referencedColumns: ["produto_id"]
          },
          {
            foreignKeyName: "cotacao_itens_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      cotacao_respostas: {
        Row: {
          company_id: string
          cotacao_fornecedor_id: string
          cotacao_item_id: string
          created_at: string
          disponivel: boolean
          id: string
          observacao: string | null
          preco_unitario: number | null
          quantidade_disponivel: number | null
          selecionado: boolean
          updated_at: string
        }
        Insert: {
          company_id: string
          cotacao_fornecedor_id: string
          cotacao_item_id: string
          created_at?: string
          disponivel?: boolean
          id?: string
          observacao?: string | null
          preco_unitario?: number | null
          quantidade_disponivel?: number | null
          selecionado?: boolean
          updated_at?: string
        }
        Update: {
          company_id?: string
          cotacao_fornecedor_id?: string
          cotacao_item_id?: string
          created_at?: string
          disponivel?: boolean
          id?: string
          observacao?: string | null
          preco_unitario?: number | null
          quantidade_disponivel?: number | null
          selecionado?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cotacao_respostas_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cotacao_respostas_cotacao_fornecedor_id_fkey"
            columns: ["cotacao_fornecedor_id"]
            isOneToOne: false
            referencedRelation: "cotacao_fornecedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cotacao_respostas_cotacao_item_id_fkey"
            columns: ["cotacao_item_id"]
            isOneToOne: false
            referencedRelation: "cotacao_itens"
            referencedColumns: ["id"]
          },
        ]
      }
      cotacao_sugestoes: {
        Row: {
          company_id: string
          cotacao_id: string
          created_at: string
          created_by: string
          dados_json: Json
          economia_estimada: number
          id: string
          tipo: string
          total_estimado: number
        }
        Insert: {
          company_id: string
          cotacao_id: string
          created_at?: string
          created_by?: string
          dados_json?: Json
          economia_estimada?: number
          id?: string
          tipo: string
          total_estimado?: number
        }
        Update: {
          company_id?: string
          cotacao_id?: string
          created_at?: string
          created_by?: string
          dados_json?: Json
          economia_estimada?: number
          id?: string
          tipo?: string
          total_estimado?: number
        }
        Relationships: [
          {
            foreignKeyName: "cotacao_sugestoes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cotacao_sugestoes_cotacao_id_fkey"
            columns: ["cotacao_id"]
            isOneToOne: false
            referencedRelation: "cotacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      cotacao_whatsapp_logs: {
        Row: {
          company_id: string
          cotacao_fornecedor_id: string | null
          cotacao_id: string
          created_at: string
          created_by: string
          id: string
          message: string | null
          phone: string | null
          sent_at: string | null
          status: string
          tipo: string
          zapi_response: Json | null
        }
        Insert: {
          company_id: string
          cotacao_fornecedor_id?: string | null
          cotacao_id: string
          created_at?: string
          created_by?: string
          id?: string
          message?: string | null
          phone?: string | null
          sent_at?: string | null
          status?: string
          tipo: string
          zapi_response?: Json | null
        }
        Update: {
          company_id?: string
          cotacao_fornecedor_id?: string | null
          cotacao_id?: string
          created_at?: string
          created_by?: string
          id?: string
          message?: string | null
          phone?: string | null
          sent_at?: string | null
          status?: string
          tipo?: string
          zapi_response?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "cotacao_whatsapp_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cotacao_whatsapp_logs_cotacao_fornecedor_id_fkey"
            columns: ["cotacao_fornecedor_id"]
            isOneToOne: false
            referencedRelation: "cotacao_fornecedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cotacao_whatsapp_logs_cotacao_id_fkey"
            columns: ["cotacao_id"]
            isOneToOne: false
            referencedRelation: "cotacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      cotacao_zapi_config: {
        Row: {
          ativo: boolean
          base_url: string
          client_token: string | null
          company_id: string
          created_at: string
          default_phone: string | null
          id: string
          instance_id: string | null
          token: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          base_url?: string
          client_token?: string | null
          company_id: string
          created_at?: string
          default_phone?: string | null
          id?: string
          instance_id?: string | null
          token?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          base_url?: string
          client_token?: string | null
          company_id?: string
          created_at?: string
          default_phone?: string | null
          id?: string
          instance_id?: string | null
          token?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cotacao_zapi_config_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      cotacoes: {
        Row: {
          codigo: string
          codigo_unaccent: string | null
          company_id: string
          created_at: string
          created_by: string
          data_envio: string | null
          data_validade: string | null
          deleted_at: string | null
          deleted_by: string | null
          economia_estimada: number
          id: string
          observacao: string | null
          origin_ref: string | null
          origin_type: string | null
          status: string
          titulo: string
          titulo_unaccent: string | null
          total_estimado: number
          updated_at: string
        }
        Insert: {
          codigo: string
          codigo_unaccent?: string | null
          company_id: string
          created_at?: string
          created_by?: string
          data_envio?: string | null
          data_validade?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          economia_estimada?: number
          id?: string
          observacao?: string | null
          origin_ref?: string | null
          origin_type?: string | null
          status?: string
          titulo: string
          titulo_unaccent?: string | null
          total_estimado?: number
          updated_at?: string
        }
        Update: {
          codigo?: string
          codigo_unaccent?: string | null
          company_id?: string
          created_at?: string
          created_by?: string
          data_envio?: string | null
          data_validade?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          economia_estimada?: number
          id?: string
          observacao?: string | null
          origin_ref?: string | null
          origin_type?: string | null
          status?: string
          titulo?: string
          titulo_unaccent?: string | null
          total_estimado?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cotacoes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_cache: {
        Row: {
          created_at: string
          expires_at: string
          key: string
          payload: Json
        }
        Insert: {
          created_at?: string
          expires_at?: string
          key: string
          payload?: Json
        }
        Update: {
          created_at?: string
          expires_at?: string
          key?: string
          payload?: Json
        }
        Relationships: []
      }
      estoque_setor_produtos: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          produto_id: string
          setor_id: string
        }
        Insert: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          produto_id: string
          setor_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          produto_id?: string
          setor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "estoque_setor_produtos_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estoque_setor_produtos_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "mv_giro_estoque"
            referencedColumns: ["produto_id"]
          },
          {
            foreignKeyName: "estoque_setor_produtos_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estoque_setor_produtos_setor_id_fkey"
            columns: ["setor_id"]
            isOneToOne: false
            referencedRelation: "stock_sectors"
            referencedColumns: ["id"]
          },
        ]
      }
      estoque_usuario_setores: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          setor_id: string
          user_id: string
        }
        Insert: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          setor_id: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          setor_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "estoque_usuario_setores_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estoque_usuario_setores_setor_id_fkey"
            columns: ["setor_id"]
            isOneToOne: false
            referencedRelation: "stock_sectors"
            referencedColumns: ["id"]
          },
        ]
      }
      faturamento_periodos_legacy: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          data: string
          id: string
          observacao: string | null
          updated_at: string
          valor: number
        }
        Insert: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          data: string
          id?: string
          observacao?: string | null
          updated_at?: string
          valor?: number
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          data?: string
          id?: string
          observacao?: string | null
          updated_at?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "faturamento_periodos_legacy_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      faturamento_periodos_legacy_bkp_reset_20260301: {
        Row: {
          company_id: string | null
          created_at: string | null
          created_by: string | null
          data: string | null
          id: string | null
          observacao: string | null
          updated_at: string | null
          valor: number | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          data?: string | null
          id?: string | null
          observacao?: string | null
          updated_at?: string | null
          valor?: number | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          data?: string | null
          id?: string | null
          observacao?: string | null
          updated_at?: string | null
          valor?: number | null
        }
        Relationships: []
      }
      ficha_componente_itens: {
        Row: {
          company_id: string
          componente_filho_id: string | null
          componente_pai_id: string
          created_at: string
          custo_snapshot: number
          id: string
          ordem: number
          origem: string
          produto_id: string | null
          quantidade: number
          quantidade_original: number | null
          unidade: string
          unidade_original: string | null
        }
        Insert: {
          company_id?: string
          componente_filho_id?: string | null
          componente_pai_id: string
          created_at?: string
          custo_snapshot?: number
          id?: string
          ordem?: number
          origem?: string
          produto_id?: string | null
          quantidade?: number
          quantidade_original?: number | null
          unidade?: string
          unidade_original?: string | null
        }
        Update: {
          company_id?: string
          componente_filho_id?: string | null
          componente_pai_id?: string
          created_at?: string
          custo_snapshot?: number
          id?: string
          ordem?: number
          origem?: string
          produto_id?: string | null
          quantidade?: number
          quantidade_original?: number | null
          unidade?: string
          unidade_original?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ficha_componente_itens_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ficha_componente_itens_componente_pai_id_fkey"
            columns: ["componente_pai_id"]
            isOneToOne: false
            referencedRelation: "ficha_componentes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ficha_componente_itens_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "mv_giro_estoque"
            referencedColumns: ["produto_id"]
          },
          {
            foreignKeyName: "ficha_componente_itens_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "phase7_ficha_componente_itens_componente_filho_id_tenant_fk"
            columns: ["company_id", "componente_filho_id"]
            isOneToOne: false
            referencedRelation: "ficha_componentes"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "phase7_ficha_componente_itens_componente_pai_id_tenant_fk"
            columns: ["company_id", "componente_pai_id"]
            isOneToOne: false
            referencedRelation: "ficha_componentes"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "phase7_ficha_componente_itens_produto_id_tenant_fk"
            columns: ["company_id", "produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["company_id", "id"]
          },
        ]
      }
      ficha_componentes: {
        Row: {
          ativo: boolean
          categoria: string
          checklist: Json | null
          client_request_id: string | null
          company_id: string
          created_at: string
          created_by: string | null
          custo_indireto: number
          custo_total_calculado: number
          custo_unitario_calculado: number
          deleted_at: string | null
          deleted_by: string | null
          id: string
          modo_preparo: string | null
          nome: string
          nome_unaccent: string | null
          observacoes: string | null
          perda_estimada_percent: number
          peso_por_unidade: number | null
          rendimento: number
          tempo_preparo_min: number | null
          tipo: string
          unidade_rendimento: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          categoria?: string
          checklist?: Json | null
          client_request_id?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          custo_indireto?: number
          custo_total_calculado?: number
          custo_unitario_calculado?: number
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          modo_preparo?: string | null
          nome: string
          nome_unaccent?: string | null
          observacoes?: string | null
          perda_estimada_percent?: number
          peso_por_unidade?: number | null
          rendimento?: number
          tempo_preparo_min?: number | null
          tipo: string
          unidade_rendimento?: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          categoria?: string
          checklist?: Json | null
          client_request_id?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          custo_indireto?: number
          custo_total_calculado?: number
          custo_unitario_calculado?: number
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          modo_preparo?: string | null
          nome?: string
          nome_unaccent?: string | null
          observacoes?: string | null
          perda_estimada_percent?: number
          peso_por_unidade?: number | null
          rendimento?: number
          tempo_preparo_min?: number | null
          tipo?: string
          unidade_rendimento?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ficha_componentes_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_audit_logs: {
        Row: {
          acao: string
          antes: Json | null
          company_id: string
          created_at: string
          depois: Json | null
          entidade: string
          entidade_id: string | null
          id: string
          justificativa: string | null
          user_id: string
        }
        Insert: {
          acao: string
          antes?: Json | null
          company_id?: string
          created_at?: string
          depois?: Json | null
          entidade: string
          entidade_id?: string | null
          id?: string
          justificativa?: string | null
          user_id: string
        }
        Update: {
          acao?: string
          antes?: Json | null
          company_id?: string
          created_at?: string
          depois?: Json | null
          entidade?: string
          entidade_id?: string | null
          id?: string
          justificativa?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fin_audit_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_categorias: {
        Row: {
          ativo: boolean
          centro_custo_padrao_id: string | null
          codigo: string | null
          company_id: string
          created_at: string
          created_by: string | null
          excluir_dos_totais: boolean
          grupo: string | null
          id: string
          linha_dre: string | null
          nome_unaccent: string | null
          nome: string
          ordem: number | null
          parent_id: string | null
          plano_contas_id: string | null
          regra_sugestao: string | null
          system_key: string | null
          tipo: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          centro_custo_padrao_id?: string | null
          codigo?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          excluir_dos_totais?: boolean
          grupo?: string | null
          id?: string
          linha_dre?: string | null
          nome_unaccent?: never
          nome: string
          ordem?: number | null
          parent_id?: string | null
          plano_contas_id?: string | null
          regra_sugestao?: string | null
          system_key?: string | null
          tipo?: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          centro_custo_padrao_id?: string | null
          codigo?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          excluir_dos_totais?: boolean
          grupo?: string | null
          id?: string
          linha_dre?: string | null
          nome_unaccent?: never
          nome?: string
          ordem?: number | null
          parent_id?: string | null
          plano_contas_id?: string | null
          regra_sugestao?: string | null
          system_key?: string | null
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fin_categorias_centro_custo_padrao_id_fkey"
            columns: ["centro_custo_padrao_id"]
            isOneToOne: false
            referencedRelation: "fin_centros_custo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_categorias_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_categorias_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "fin_categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_categorias_plano_contas_id_fkey"
            columns: ["plano_contas_id"]
            isOneToOne: false
            referencedRelation: "fin_plano_contas"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_centros_custo: {
        Row: {
          ativo: boolean
          company_id: string
          created_at: string
          created_by: string | null
          descricao: string | null
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          company_id?: string
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          id?: string
          nome: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          company_id?: string
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fin_centros_custo_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_conciliacao_ignoradas: {
        Row: {
          company_id: string
          conta_id: string | null
          data: string
          descricao: string | null
          descricao_unaccent: string | null
          external_id: string | null
          id: string
          ignorado_em: string | null
          ignorado_por: string | null
          lancamento_origem_id: string | null
          occurrence_index: number | null
          tipo: string
          tratamento: string
          valor: number
        }
        Insert: {
          company_id: string
          conta_id?: string | null
          data: string
          descricao?: string | null
          descricao_unaccent?: string | null
          external_id?: string | null
          id?: string
          ignorado_em?: string | null
          ignorado_por?: string | null
          lancamento_origem_id?: string | null
          occurrence_index?: number | null
          tipo: string
          tratamento?: string
          valor: number
        }
        Update: {
          company_id?: string
          conta_id?: string | null
          data?: string
          descricao?: string | null
          descricao_unaccent?: string | null
          external_id?: string | null
          id?: string
          ignorado_em?: string | null
          ignorado_por?: string | null
          lancamento_origem_id?: string | null
          occurrence_index?: number | null
          tipo?: string
          tratamento?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "fin_conciliacao_ignoradas_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_conciliacao_ignoradas_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "fin_contas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_conciliacao_ignoradas_lancamento_origem_id_fkey"
            columns: ["lancamento_origem_id"]
            isOneToOne: false
            referencedRelation: "fin_lancamentos"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_conciliacao_vinculos: {
        Row: {
          company_id: string
          conta_id: string
          created_at: string
          created_by: string | null
          external_id: string
          id: string
          lancamento_id: string
          tipo: string
        }
        Insert: {
          company_id: string
          conta_id: string
          created_at?: string
          created_by?: string | null
          external_id: string
          id?: string
          lancamento_id: string
          tipo: string
        }
        Update: {
          company_id?: string
          conta_id?: string
          created_at?: string
          created_by?: string | null
          external_id?: string
          id?: string
          lancamento_id?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "fin_conciliacao_vinculos_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_conciliacao_vinculos_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "fin_contas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_conciliacao_vinculos_lancamento_id_fkey"
            columns: ["lancamento_id"]
            isOneToOne: false
            referencedRelation: "fin_lancamentos"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_config: {
        Row: {
          company_id: string
          key: string
          updated_at: string
          updated_by: string | null
          value: string
        }
        Insert: {
          company_id?: string
          key: string
          updated_at?: string
          updated_by?: string | null
          value: string
        }
        Update: {
          company_id?: string
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: string
        }
        Relationships: []
      }
      fin_contas: {
        Row: {
          agencia: string | null
          ativo: boolean
          banco: string | null
          company_id: string
          created_at: string
          created_by: string | null
          data_saldo_inicial: string
          id: string
          moeda: string
          nome: string
          numero_conta: string | null
          saldo_inicial: number
          tipo: string
          updated_at: string
        }
        Insert: {
          agencia?: string | null
          ativo?: boolean
          banco?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          data_saldo_inicial?: string
          id?: string
          moeda?: string
          nome: string
          numero_conta?: string | null
          saldo_inicial?: number
          tipo?: string
          updated_at?: string
        }
        Update: {
          agencia?: string | null
          ativo?: boolean
          banco?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          data_saldo_inicial?: string
          id?: string
          moeda?: string
          nome?: string
          numero_conta?: string | null
          saldo_inicial?: number
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fin_contas_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_contas_pagar: {
        Row: {
          aprovado_em: string | null
          aprovado_por: string | null
          categoria_id: string | null
          centro_custo_id: string | null
          tipo_codigo_pagamento: string | null
          codigo_pagamento: string | null
          codigo_pagamento_unaccent: string | null
          company_id: string
          conta_id: string | null
          created_at: string
          created_by: string | null
          data_competencia: string | null
          data_pagamento: string | null
          data_vencimento: string
          descricao: string
          descricao_unaccent: string | null
          excluir_dos_relatorios: boolean
          forma_pagamento: string | null
          fornecedor: string | null
          fornecedor_unaccent: string | null
          id: string
          idempotency_key: string | null
          justificativa: string | null
          lancamento_id: string | null
          lancamento_pai_id: string | null
          limite_aprovacao: number | null
          observacoes: string | null
          parcela_atual: number | null
          parcela_total: number | null
          plano_contas_id: string | null
          recorrencia_config: Json | null
          recorrente: boolean
          referencia_id: string | null
          referencia_modulo: string | null
          status: string
          supplier_id: string | null
          updated_at: string
          valor: number
          valor_pago: number | null
        }
        Insert: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          categoria_id?: string | null
          centro_custo_id?: string | null
          tipo_codigo_pagamento?: string | null
          codigo_pagamento?: string | null
          codigo_pagamento_unaccent?: never
          company_id?: string
          conta_id?: string | null
          created_at?: string
          created_by?: string | null
          data_competencia?: string | null
          data_pagamento?: string | null
          data_vencimento?: string
          descricao?: string
          descricao_unaccent?: string | null
          excluir_dos_relatorios?: boolean
          forma_pagamento?: string | null
          fornecedor?: string | null
          fornecedor_unaccent?: string | null
          id?: string
          idempotency_key?: string | null
          justificativa?: string | null
          lancamento_id?: string | null
          lancamento_pai_id?: string | null
          limite_aprovacao?: number | null
          observacoes?: string | null
          parcela_atual?: number | null
          parcela_total?: number | null
          plano_contas_id?: string | null
          recorrencia_config?: Json | null
          recorrente?: boolean
          referencia_id?: string | null
          referencia_modulo?: string | null
          status?: string
          supplier_id?: string | null
          updated_at?: string
          valor?: number
          valor_pago?: number | null
        }
        Update: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          categoria_id?: string | null
          centro_custo_id?: string | null
          tipo_codigo_pagamento?: string | null
          codigo_pagamento?: string | null
          codigo_pagamento_unaccent?: never
          company_id?: string
          conta_id?: string | null
          created_at?: string
          created_by?: string | null
          data_competencia?: string | null
          data_pagamento?: string | null
          data_vencimento?: string
          descricao?: string
          descricao_unaccent?: string | null
          excluir_dos_relatorios?: boolean
          forma_pagamento?: string | null
          fornecedor?: string | null
          fornecedor_unaccent?: string | null
          id?: string
          idempotency_key?: string | null
          justificativa?: string | null
          lancamento_id?: string | null
          lancamento_pai_id?: string | null
          limite_aprovacao?: number | null
          observacoes?: string | null
          parcela_atual?: number | null
          parcela_total?: number | null
          plano_contas_id?: string | null
          recorrencia_config?: Json | null
          recorrente?: boolean
          referencia_id?: string | null
          referencia_modulo?: string | null
          status?: string
          supplier_id?: string | null
          updated_at?: string
          valor?: number
          valor_pago?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fin_contas_pagar_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "fin_categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_contas_pagar_centro_custo_id_fkey"
            columns: ["centro_custo_id"]
            isOneToOne: false
            referencedRelation: "fin_centros_custo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_contas_pagar_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_contas_pagar_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "fin_contas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_contas_pagar_lancamento_id_fkey"
            columns: ["lancamento_id"]
            isOneToOne: false
            referencedRelation: "fin_lancamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_contas_pagar_lancamento_pai_id_fkey"
            columns: ["lancamento_pai_id"]
            isOneToOne: false
            referencedRelation: "fin_contas_pagar"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_contas_pagar_plano_contas_id_fkey"
            columns: ["plano_contas_id"]
            isOneToOne: false
            referencedRelation: "fin_plano_contas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_contas_pagar_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_contas_pagar_bkp_reset_20260301: {
        Row: {
          aprovado_em: string | null
          aprovado_por: string | null
          categoria_id: string | null
          centro_custo_id: string | null
          company_id: string | null
          conta_id: string | null
          created_at: string | null
          created_by: string | null
          data_pagamento: string | null
          data_vencimento: string | null
          descricao: string | null
          forma_pagamento: string | null
          fornecedor: string | null
          id: string | null
          justificativa: string | null
          lancamento_id: string | null
          lancamento_pai_id: string | null
          limite_aprovacao: number | null
          observacoes: string | null
          parcela_atual: number | null
          parcela_total: number | null
          plano_contas_id: string | null
          recorrencia_config: Json | null
          recorrente: boolean | null
          referencia_id: string | null
          referencia_modulo: string | null
          status: string | null
          updated_at: string | null
          valor: number | null
          valor_pago: number | null
        }
        Insert: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          categoria_id?: string | null
          centro_custo_id?: string | null
          company_id?: string | null
          conta_id?: string | null
          created_at?: string | null
          created_by?: string | null
          data_pagamento?: string | null
          data_vencimento?: string | null
          descricao?: string | null
          forma_pagamento?: string | null
          fornecedor?: string | null
          id?: string | null
          justificativa?: string | null
          lancamento_id?: string | null
          lancamento_pai_id?: string | null
          limite_aprovacao?: number | null
          observacoes?: string | null
          parcela_atual?: number | null
          parcela_total?: number | null
          plano_contas_id?: string | null
          recorrencia_config?: Json | null
          recorrente?: boolean | null
          referencia_id?: string | null
          referencia_modulo?: string | null
          status?: string | null
          updated_at?: string | null
          valor?: number | null
          valor_pago?: number | null
        }
        Update: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          categoria_id?: string | null
          centro_custo_id?: string | null
          company_id?: string | null
          conta_id?: string | null
          created_at?: string | null
          created_by?: string | null
          data_pagamento?: string | null
          data_vencimento?: string | null
          descricao?: string | null
          forma_pagamento?: string | null
          fornecedor?: string | null
          id?: string | null
          justificativa?: string | null
          lancamento_id?: string | null
          lancamento_pai_id?: string | null
          limite_aprovacao?: number | null
          observacoes?: string | null
          parcela_atual?: number | null
          parcela_total?: number | null
          plano_contas_id?: string | null
          recorrencia_config?: Json | null
          recorrente?: boolean | null
          referencia_id?: string | null
          referencia_modulo?: string | null
          status?: string | null
          updated_at?: string | null
          valor?: number | null
          valor_pago?: number | null
        }
        Relationships: []
      }
      fin_contas_receber: {
        Row: {
          categoria_id: string | null
          centro_custo_id: string | null
          cliente: string | null
          company_id: string
          conta_id: string | null
          created_at: string
          created_by: string | null
          data_competencia: string | null
          data_recebimento: string | null
          data_vencimento: string
          descricao: string
          descricao_unaccent: string | null
          excluir_dos_relatorios: boolean
          forma_pagamento: string | null
          id: string
          idempotency_key: string | null
          lancamento_id: string | null
          lancamento_pai_id: string | null
          observacoes: string | null
          parcela_atual: number | null
          parcela_total: number | null
          plano_contas_id: string | null
          recorrencia_config: Json | null
          recorrente: boolean
          status: string
          supplier_id: string | null
          updated_at: string
          valor: number
          valor_recebido: number | null
        }
        Insert: {
          categoria_id?: string | null
          centro_custo_id?: string | null
          cliente?: string | null
          company_id?: string
          conta_id?: string | null
          created_at?: string
          created_by?: string | null
          data_competencia?: string | null
          data_recebimento?: string | null
          data_vencimento?: string
          descricao?: string
          descricao_unaccent?: string | null
          excluir_dos_relatorios?: boolean
          forma_pagamento?: string | null
          id?: string
          idempotency_key?: string | null
          lancamento_id?: string | null
          lancamento_pai_id?: string | null
          observacoes?: string | null
          parcela_atual?: number | null
          parcela_total?: number | null
          plano_contas_id?: string | null
          recorrencia_config?: Json | null
          recorrente?: boolean
          status?: string
          supplier_id?: string | null
          updated_at?: string
          valor?: number
          valor_recebido?: number | null
        }
        Update: {
          categoria_id?: string | null
          centro_custo_id?: string | null
          cliente?: string | null
          company_id?: string
          conta_id?: string | null
          created_at?: string
          created_by?: string | null
          data_competencia?: string | null
          data_recebimento?: string | null
          data_vencimento?: string
          descricao?: string
          descricao_unaccent?: string | null
          excluir_dos_relatorios?: boolean
          forma_pagamento?: string | null
          id?: string
          idempotency_key?: string | null
          lancamento_id?: string | null
          lancamento_pai_id?: string | null
          observacoes?: string | null
          parcela_atual?: number | null
          parcela_total?: number | null
          plano_contas_id?: string | null
          recorrencia_config?: Json | null
          recorrente?: boolean
          status?: string
          supplier_id?: string | null
          updated_at?: string
          valor?: number
          valor_recebido?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fin_contas_receber_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "fin_categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_contas_receber_centro_custo_id_fkey"
            columns: ["centro_custo_id"]
            isOneToOne: false
            referencedRelation: "fin_centros_custo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_contas_receber_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_contas_receber_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "fin_contas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_contas_receber_lancamento_id_fkey"
            columns: ["lancamento_id"]
            isOneToOne: false
            referencedRelation: "fin_lancamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_contas_receber_lancamento_pai_id_fkey"
            columns: ["lancamento_pai_id"]
            isOneToOne: false
            referencedRelation: "fin_contas_receber"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_contas_receber_plano_contas_id_fkey"
            columns: ["plano_contas_id"]
            isOneToOne: false
            referencedRelation: "fin_plano_contas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_contas_receber_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_contas_receber_bkp_reset_20260301: {
        Row: {
          categoria_id: string | null
          centro_custo_id: string | null
          cliente: string | null
          company_id: string | null
          conta_id: string | null
          created_at: string | null
          created_by: string | null
          data_recebimento: string | null
          data_vencimento: string | null
          descricao: string | null
          forma_pagamento: string | null
          id: string | null
          lancamento_id: string | null
          lancamento_pai_id: string | null
          observacoes: string | null
          parcela_atual: number | null
          parcela_total: number | null
          plano_contas_id: string | null
          recorrencia_config: Json | null
          recorrente: boolean | null
          status: string | null
          updated_at: string | null
          valor: number | null
          valor_recebido: number | null
        }
        Insert: {
          categoria_id?: string | null
          centro_custo_id?: string | null
          cliente?: string | null
          company_id?: string | null
          conta_id?: string | null
          created_at?: string | null
          created_by?: string | null
          data_recebimento?: string | null
          data_vencimento?: string | null
          descricao?: string | null
          forma_pagamento?: string | null
          id?: string | null
          lancamento_id?: string | null
          lancamento_pai_id?: string | null
          observacoes?: string | null
          parcela_atual?: number | null
          parcela_total?: number | null
          plano_contas_id?: string | null
          recorrencia_config?: Json | null
          recorrente?: boolean | null
          status?: string | null
          updated_at?: string | null
          valor?: number | null
          valor_recebido?: number | null
        }
        Update: {
          categoria_id?: string | null
          centro_custo_id?: string | null
          cliente?: string | null
          company_id?: string | null
          conta_id?: string | null
          created_at?: string | null
          created_by?: string | null
          data_recebimento?: string | null
          data_vencimento?: string | null
          descricao?: string | null
          forma_pagamento?: string | null
          id?: string | null
          lancamento_id?: string | null
          lancamento_pai_id?: string | null
          observacoes?: string | null
          parcela_atual?: number | null
          parcela_total?: number | null
          plano_contas_id?: string | null
          recorrencia_config?: Json | null
          recorrente?: boolean | null
          status?: string | null
          updated_at?: string | null
          valor?: number | null
          valor_recebido?: number | null
        }
        Relationships: []
      }
      fin_contas_saldo_cache: {
        Row: {
          company_id: string
          conta_id: string
          saldo: number
          updated_at: string
        }
        Insert: {
          company_id: string
          conta_id: string
          saldo?: number
          updated_at?: string
        }
        Update: {
          company_id?: string
          conta_id?: string
          saldo?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fin_contas_saldo_cache_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_contas_saldo_cache_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: true
            referencedRelation: "fin_contas"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_dre_linhas: {
        Row: {
          ativo: boolean
          categorias_ids: string[] | null
          codigo: string
          company_id: string
          created_at: string
          formula: string | null
          id: string
          nivel: number
          nome: string
          ordem: number
          sinal: number
          tipo: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          categorias_ids?: string[] | null
          codigo: string
          company_id?: string
          created_at?: string
          formula?: string | null
          id?: string
          nivel?: number
          nome: string
          ordem?: number
          sinal?: number
          tipo?: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          categorias_ids?: string[] | null
          codigo?: string
          company_id?: string
          created_at?: string
          formula?: string | null
          id?: string
          nivel?: number
          nome?: string
          ordem?: number
          sinal?: number
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fin_dre_linhas_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_lancamento_rateios: {
        Row: {
          categoria_id: string | null
          centro_custo_id: string | null
          company_id: string
          created_at: string
          id: string
          lancamento_id: string
          observacao: string | null
          percentual: number | null
          valor: number
        }
        Insert: {
          categoria_id?: string | null
          centro_custo_id?: string | null
          company_id?: string
          created_at?: string
          id?: string
          lancamento_id: string
          observacao?: string | null
          percentual?: number | null
          valor?: number
        }
        Update: {
          categoria_id?: string | null
          centro_custo_id?: string | null
          company_id?: string
          created_at?: string
          id?: string
          lancamento_id?: string
          observacao?: string | null
          percentual?: number | null
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "fin_lancamento_rateios_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "fin_categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_lancamento_rateios_centro_custo_id_fkey"
            columns: ["centro_custo_id"]
            isOneToOne: false
            referencedRelation: "fin_centros_custo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_lancamento_rateios_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_lancamentos: {
        Row: {
          categoria_id: string | null
          centro_custo_id: string | null
          company_id: string
          conciliado: boolean | null
          conciliado_em: string | null
          conciliado_por: string | null
          conta_destino_id: string | null
          conta_id: string | null
          created_at: string
          created_by: string | null
          data_competencia: string
          data_pagamento: string | null
          data_vencimento: string | null
          descricao: string | null
          excluir_dos_relatorios: boolean
          forma_pagamento: string | null
          id: string
          idempotency_key: string | null
          justificativa_edicao: string | null
          lancamento_pai_id: string | null
          observacoes: string | null
          origem: string
          parcela_atual: number | null
          parcela_total: number | null
          plano_contas_id: string | null
          recorrencia_config: Json | null
          recorrente: boolean
          referencia_id: string | null
          referencia_modulo: string | null
          status: string
          tags: string[] | null
          tipo: string
          updated_at: string
          valor: number
        }
        Insert: {
          categoria_id?: string | null
          centro_custo_id?: string | null
          company_id?: string
          conciliado?: boolean | null
          conciliado_em?: string | null
          conciliado_por?: string | null
          conta_destino_id?: string | null
          conta_id?: string | null
          created_at?: string
          created_by?: string | null
          data_competencia?: string
          data_pagamento?: string | null
          data_vencimento?: string | null
          descricao?: string | null
          excluir_dos_relatorios?: boolean
          forma_pagamento?: string | null
          id?: string
          idempotency_key?: string | null
          justificativa_edicao?: string | null
          lancamento_pai_id?: string | null
          observacoes?: string | null
          origem?: string
          parcela_atual?: number | null
          parcela_total?: number | null
          plano_contas_id?: string | null
          recorrencia_config?: Json | null
          recorrente?: boolean
          referencia_id?: string | null
          referencia_modulo?: string | null
          status?: string
          tags?: string[] | null
          tipo?: string
          updated_at?: string
          valor?: number
        }
        Update: {
          categoria_id?: string | null
          centro_custo_id?: string | null
          company_id?: string
          conciliado?: boolean | null
          conciliado_em?: string | null
          conciliado_por?: string | null
          conta_destino_id?: string | null
          conta_id?: string | null
          created_at?: string
          created_by?: string | null
          data_competencia?: string
          data_pagamento?: string | null
          data_vencimento?: string | null
          descricao?: string | null
          excluir_dos_relatorios?: boolean
          forma_pagamento?: string | null
          id?: string
          idempotency_key?: string | null
          justificativa_edicao?: string | null
          lancamento_pai_id?: string | null
          observacoes?: string | null
          origem?: string
          parcela_atual?: number | null
          parcela_total?: number | null
          plano_contas_id?: string | null
          recorrencia_config?: Json | null
          recorrente?: boolean
          referencia_id?: string | null
          referencia_modulo?: string | null
          status?: string
          tags?: string[] | null
          tipo?: string
          updated_at?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "fin_lancamentos_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "fin_categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_lancamentos_centro_custo_id_fkey"
            columns: ["centro_custo_id"]
            isOneToOne: false
            referencedRelation: "fin_centros_custo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_lancamentos_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_lancamentos_conta_destino_id_fkey"
            columns: ["conta_destino_id"]
            isOneToOne: false
            referencedRelation: "fin_contas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_lancamentos_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "fin_contas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_lancamentos_lancamento_pai_id_fkey"
            columns: ["lancamento_pai_id"]
            isOneToOne: false
            referencedRelation: "fin_lancamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_lancamentos_plano_contas_id_fkey"
            columns: ["plano_contas_id"]
            isOneToOne: false
            referencedRelation: "fin_plano_contas"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_lancamentos_bkp_reset_20260301: {
        Row: {
          categoria_id: string | null
          centro_custo_id: string | null
          company_id: string | null
          conciliado: boolean | null
          conciliado_em: string | null
          conciliado_por: string | null
          conta_destino_id: string | null
          conta_id: string | null
          created_at: string | null
          created_by: string | null
          data_competencia: string | null
          data_pagamento: string | null
          descricao: string | null
          forma_pagamento: string | null
          id: string | null
          justificativa_edicao: string | null
          lancamento_pai_id: string | null
          observacoes: string | null
          parcela_atual: number | null
          parcela_total: number | null
          plano_contas_id: string | null
          recorrencia_config: Json | null
          recorrente: boolean | null
          referencia_id: string | null
          referencia_modulo: string | null
          status: string | null
          tags: string[] | null
          tipo: string | null
          updated_at: string | null
          valor: number | null
        }
        Insert: {
          categoria_id?: string | null
          centro_custo_id?: string | null
          company_id?: string | null
          conciliado?: boolean | null
          conciliado_em?: string | null
          conciliado_por?: string | null
          conta_destino_id?: string | null
          conta_id?: string | null
          created_at?: string | null
          created_by?: string | null
          data_competencia?: string | null
          data_pagamento?: string | null
          descricao?: string | null
          forma_pagamento?: string | null
          id?: string | null
          justificativa_edicao?: string | null
          lancamento_pai_id?: string | null
          observacoes?: string | null
          parcela_atual?: number | null
          parcela_total?: number | null
          plano_contas_id?: string | null
          recorrencia_config?: Json | null
          recorrente?: boolean | null
          referencia_id?: string | null
          referencia_modulo?: string | null
          status?: string | null
          tags?: string[] | null
          tipo?: string | null
          updated_at?: string | null
          valor?: number | null
        }
        Update: {
          categoria_id?: string | null
          centro_custo_id?: string | null
          company_id?: string | null
          conciliado?: boolean | null
          conciliado_em?: string | null
          conciliado_por?: string | null
          conta_destino_id?: string | null
          conta_id?: string | null
          created_at?: string | null
          created_by?: string | null
          data_competencia?: string | null
          data_pagamento?: string | null
          descricao?: string | null
          forma_pagamento?: string | null
          id?: string | null
          justificativa_edicao?: string | null
          lancamento_pai_id?: string | null
          observacoes?: string | null
          parcela_atual?: number | null
          parcela_total?: number | null
          plano_contas_id?: string | null
          recorrencia_config?: Json | null
          recorrente?: boolean | null
          referencia_id?: string | null
          referencia_modulo?: string | null
          status?: string | null
          tags?: string[] | null
          tipo?: string | null
          updated_at?: string | null
          valor?: number | null
        }
        Relationships: []
      }
      fin_orcamentos: {
        Row: {
          categoria_id: string | null
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          mes_ano: string
          updated_at: string
          valor_orcado: number
        }
        Insert: {
          categoria_id?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          mes_ano: string
          updated_at?: string
          valor_orcado?: number
        }
        Update: {
          categoria_id?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          mes_ano?: string
          updated_at?: string
          valor_orcado?: number
        }
        Relationships: [
          {
            foreignKeyName: "fin_orcamentos_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "fin_categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_orcamentos_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_plano_contas: {
        Row: {
          ativo: boolean
          codigo: string
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          linha_dre: string | null
          natureza: string
          nivel: number
          nome: string
          pai_id: string | null
          tipo: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          codigo: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          linha_dre?: string | null
          natureza?: string
          nivel?: number
          nome: string
          pai_id?: string | null
          tipo?: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          codigo?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          linha_dre?: string | null
          natureza?: string
          nivel?: number
          nome?: string
          pai_id?: string | null
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fin_plano_contas_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_plano_contas_pai_id_fkey"
            columns: ["pai_id"]
            isOneToOne: false
            referencedRelation: "fin_plano_contas"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_presentation_agenda_items: {
        Row: {
          company_id: string
          conclusion: string | null
          created_at: string
          created_by: string | null
          created_by_name_snapshot: string
          discussion_notes: string
          id: string
          item_type: string
          objective: string
          position: number
          reference_id: string | null
          reference_status: string | null
          reference_type: string | null
          reference_version: number | null
          review_state: string
          session_id: string
          title: string
          title_unaccent: string | null
          updated_at: string
          updated_by: string | null
          updated_by_name_snapshot: string
        }
        Insert: {
          company_id: string
          conclusion?: string | null
          created_at?: string
          created_by?: string | null
          created_by_name_snapshot: string
          discussion_notes?: string
          id?: string
          item_type: string
          objective?: string
          position: number
          reference_id?: string | null
          reference_status?: string | null
          reference_type?: string | null
          reference_version?: number | null
          review_state?: string
          session_id: string
          title: string
          title_unaccent?: string | null
          updated_at?: string
          updated_by?: string | null
          updated_by_name_snapshot: string
        }
        Update: {
          company_id?: string
          conclusion?: string | null
          created_at?: string
          created_by?: string | null
          created_by_name_snapshot?: string
          discussion_notes?: string
          id?: string
          item_type?: string
          objective?: string
          position?: number
          reference_id?: string | null
          reference_status?: string | null
          reference_type?: string | null
          reference_version?: number | null
          review_state?: string
          session_id?: string
          title?: string
          title_unaccent?: string | null
          updated_at?: string
          updated_by?: string | null
          updated_by_name_snapshot?: string
        }
        Relationships: [
          {
            foreignKeyName: "fin_presentation_agenda_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_presentation_agenda_items_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "fin_presentation_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_presentation_decision_actions: {
        Row: {
          cancelled_at: string | null
          company_id: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          created_by_name_snapshot: string
          decision_id: string
          description: string
          description_unaccent: string | null
          due_date: string | null
          id: string
          outcome_note: string | null
          priority: string | null
          responsible_name_snapshot: string
          responsible_user_id: string | null
          status: string
          updated_at: string
          updated_by: string | null
          updated_by_name_snapshot: string
          version: number
        }
        Insert: {
          cancelled_at?: string | null
          company_id: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          created_by_name_snapshot: string
          decision_id: string
          description: string
          description_unaccent?: string | null
          due_date?: string | null
          id?: string
          outcome_note?: string | null
          priority?: string | null
          responsible_name_snapshot: string
          responsible_user_id?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
          updated_by_name_snapshot: string
          version?: number
        }
        Update: {
          cancelled_at?: string | null
          company_id?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          created_by_name_snapshot?: string
          decision_id?: string
          description?: string
          description_unaccent?: string | null
          due_date?: string | null
          id?: string
          outcome_note?: string | null
          priority?: string | null
          responsible_name_snapshot?: string
          responsible_user_id?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
          updated_by_name_snapshot?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "fin_presentation_decision_actions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_presentation_decision_actions_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "fin_presentation_decisions"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_presentation_decision_revisions: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          approved_by_name_snapshot: string | null
          company_id: string
          created_at: string
          created_by: string | null
          created_by_name_snapshot: string
          decision_id: string
          id: string
          reference_type: string
          revision_number: number
          revision_reason: string
          snapshot: Json
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          approved_by_name_snapshot?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          created_by_name_snapshot: string
          decision_id: string
          id?: string
          reference_type: string
          revision_number: number
          revision_reason: string
          snapshot: Json
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          approved_by_name_snapshot?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          created_by_name_snapshot?: string
          decision_id?: string
          id?: string
          reference_type?: string
          revision_number?: number
          revision_reason?: string
          snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "fin_presentation_decision_revisions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_presentation_decision_revisions_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "fin_presentation_decisions"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_presentation_decisions: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          approved_by_name_snapshot: string | null
          cancelled_at: string | null
          company_id: string
          completed_at: string | null
          context: string
          created_at: string
          created_by: string | null
          created_by_name_snapshot: string
          current_revision_id: string | null
          ever_approved: boolean
          executive_responsible_name_snapshot: string | null
          executive_responsible_user_id: string | null
          granularity: string
          id: string
          idempotency_fingerprint: string | null
          idempotency_key: string | null
          latest_justification: string | null
          period_end_exclusive: string
          period_start: string
          reference_type: string
          status: string
          title: string
          title_unaccent: string | null
          updated_at: string
          updated_by: string | null
          updated_by_name_snapshot: string
          version: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          approved_by_name_snapshot?: string | null
          cancelled_at?: string | null
          company_id: string
          completed_at?: string | null
          context: string
          created_at?: string
          created_by?: string | null
          created_by_name_snapshot: string
          current_revision_id?: string | null
          ever_approved?: boolean
          executive_responsible_name_snapshot?: string | null
          executive_responsible_user_id?: string | null
          granularity: string
          id?: string
          idempotency_fingerprint?: string | null
          idempotency_key?: string | null
          latest_justification?: string | null
          period_end_exclusive: string
          period_start: string
          reference_type: string
          status?: string
          title: string
          title_unaccent?: string | null
          updated_at?: string
          updated_by?: string | null
          updated_by_name_snapshot: string
          version?: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          approved_by_name_snapshot?: string | null
          cancelled_at?: string | null
          company_id?: string
          completed_at?: string | null
          context?: string
          created_at?: string
          created_by?: string | null
          created_by_name_snapshot?: string
          current_revision_id?: string | null
          ever_approved?: boolean
          executive_responsible_name_snapshot?: string | null
          executive_responsible_user_id?: string | null
          granularity?: string
          id?: string
          idempotency_fingerprint?: string | null
          idempotency_key?: string | null
          latest_justification?: string | null
          period_end_exclusive?: string
          period_start?: string
          reference_type?: string
          status?: string
          title?: string
          title_unaccent?: string | null
          updated_at?: string
          updated_by?: string | null
          updated_by_name_snapshot?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "fin_presentation_decisions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_presentation_decisions_current_revision_fk"
            columns: ["current_revision_id"]
            isOneToOne: false
            referencedRelation: "fin_presentation_decision_revisions"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_presentation_minutes_revisions: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          approved_by_name_snapshot: string | null
          company_id: string
          content: Json
          created_at: string
          created_by: string | null
          created_by_name_snapshot: string
          id: string
          revision_number: number
          revision_reason: string
          session_id: string
          state: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          approved_by_name_snapshot?: string | null
          company_id: string
          content: Json
          created_at?: string
          created_by?: string | null
          created_by_name_snapshot: string
          id?: string
          revision_number: number
          revision_reason: string
          session_id: string
          state?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          approved_by_name_snapshot?: string | null
          company_id?: string
          content?: Json
          created_at?: string
          created_by?: string | null
          created_by_name_snapshot?: string
          id?: string
          revision_number?: number
          revision_reason?: string
          session_id?: string
          state?: string
        }
        Relationships: [
          {
            foreignKeyName: "fin_presentation_minutes_revisions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_presentation_minutes_revisions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "fin_presentation_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_presentation_session_participants: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          created_by_name_snapshot: string
          email_snapshot: string | null
          id: string
          name_snapshot: string
          position: number
          session_id: string
          user_id: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          created_by_name_snapshot: string
          email_snapshot?: string | null
          id?: string
          name_snapshot: string
          position: number
          session_id: string
          user_id?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          created_by_name_snapshot?: string
          email_snapshot?: string | null
          id?: string
          name_snapshot?: string
          position?: number
          session_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fin_presentation_session_participants_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_presentation_session_participants_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "fin_presentation_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_presentation_sessions: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          approved_by_name_snapshot: string | null
          cancelled_at: string | null
          company_id: string
          context: string
          created_at: string
          created_by: string | null
          created_by_name_snapshot: string
          current_revision_id: string | null
          granularity: string
          id: string
          idempotency_fingerprint: string | null
          idempotency_key: string | null
          latest_justification: string | null
          meeting_date: string
          meeting_snapshot: Json | null
          minutes_responsible_email_snapshot: string | null
          minutes_responsible_name_snapshot: string
          minutes_responsible_user_id: string | null
          period_end_exclusive: string
          period_start: string
          previous_session_id: string | null
          started_at: string | null
          status: string
          submitted_at: string | null
          title: string
          title_unaccent: string | null
          updated_at: string
          updated_by: string | null
          updated_by_name_snapshot: string
          version: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          approved_by_name_snapshot?: string | null
          cancelled_at?: string | null
          company_id: string
          context?: string
          created_at?: string
          created_by?: string | null
          created_by_name_snapshot: string
          current_revision_id?: string | null
          granularity: string
          id?: string
          idempotency_fingerprint?: string | null
          idempotency_key?: string | null
          latest_justification?: string | null
          meeting_date: string
          meeting_snapshot?: Json | null
          minutes_responsible_email_snapshot?: string | null
          minutes_responsible_name_snapshot: string
          minutes_responsible_user_id?: string | null
          period_end_exclusive: string
          period_start: string
          previous_session_id?: string | null
          started_at?: string | null
          status?: string
          submitted_at?: string | null
          title: string
          title_unaccent?: string | null
          updated_at?: string
          updated_by?: string | null
          updated_by_name_snapshot: string
          version?: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          approved_by_name_snapshot?: string | null
          cancelled_at?: string | null
          company_id?: string
          context?: string
          created_at?: string
          created_by?: string | null
          created_by_name_snapshot?: string
          current_revision_id?: string | null
          granularity?: string
          id?: string
          idempotency_fingerprint?: string | null
          idempotency_key?: string | null
          latest_justification?: string | null
          meeting_date?: string
          meeting_snapshot?: Json | null
          minutes_responsible_email_snapshot?: string | null
          minutes_responsible_name_snapshot?: string
          minutes_responsible_user_id?: string | null
          period_end_exclusive?: string
          period_start?: string
          previous_session_id?: string | null
          started_at?: string | null
          status?: string
          submitted_at?: string | null
          title?: string
          title_unaccent?: string | null
          updated_at?: string
          updated_by?: string | null
          updated_by_name_snapshot?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "fin_presentation_sessions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_presentation_sessions_current_revision_fk"
            columns: ["current_revision_id"]
            isOneToOne: false
            referencedRelation: "fin_presentation_minutes_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_presentation_sessions_previous_session_id_fkey"
            columns: ["previous_session_id"]
            isOneToOne: false
            referencedRelation: "fin_presentation_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_rateios: {
        Row: {
          centro_custo_id: string
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          lancamento_id: string | null
          percentual: number
          valor: number
        }
        Insert: {
          centro_custo_id: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          lancamento_id?: string | null
          percentual?: number
          valor?: number
        }
        Update: {
          centro_custo_id?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          lancamento_id?: string | null
          percentual?: number
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "fin_rateios_centro_custo_id_fkey"
            columns: ["centro_custo_id"]
            isOneToOne: false
            referencedRelation: "fin_centros_custo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_rateios_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_rateios_lancamento_id_fkey"
            columns: ["lancamento_id"]
            isOneToOne: false
            referencedRelation: "fin_lancamentos"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_regras_categorizacao: {
        Row: {
          ativo: boolean
          categoria_id: string | null
          centro_custo_id: string | null
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          padrao: string
          prioridade: number
          tipo_match: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          categoria_id?: string | null
          centro_custo_id?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          padrao: string
          prioridade?: number
          tipo_match?: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          categoria_id?: string | null
          centro_custo_id?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          padrao?: string
          prioridade?: number
          tipo_match?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fin_regras_categorizacao_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "fin_categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_regras_categorizacao_centro_custo_id_fkey"
            columns: ["centro_custo_id"]
            isOneToOne: false
            referencedRelation: "fin_centros_custo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_regras_categorizacao_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      financeiro_fechamento_caixa: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          data: string
          descontos: number | null
          faturamento_bruto: number
          faturamento_liquido: number | null
          id: string
          observacao: string | null
          taxas: number | null
          updated_at: string
        }
        Insert: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          data: string
          descontos?: number | null
          faturamento_bruto?: number
          faturamento_liquido?: number | null
          id?: string
          observacao?: string | null
          taxas?: number | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          data?: string
          descontos?: number | null
          faturamento_bruto?: number
          faturamento_liquido?: number | null
          id?: string
          observacao?: string | null
          taxas?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "financeiro_fechamento_caixa_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      financeiro_fechamento_caixa_bkp_reset_20260301: {
        Row: {
          company_id: string | null
          created_at: string | null
          created_by: string | null
          data: string | null
          descontos: number | null
          faturamento_bruto: number | null
          faturamento_liquido: number | null
          id: string | null
          observacao: string | null
          taxas: number | null
          updated_at: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          data?: string | null
          descontos?: number | null
          faturamento_bruto?: number | null
          faturamento_liquido?: number | null
          id?: string | null
          observacao?: string | null
          taxas?: number | null
          updated_at?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          data?: string | null
          descontos?: number | null
          faturamento_bruto?: number | null
          faturamento_liquido?: number | null
          id?: string | null
          observacao?: string | null
          taxas?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      financeiro_fechamento_marca_valores: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          fechamento_id: string
          forma_venda: string | null
          id: string
          marca_id: string
          quantidade: number | null
          updated_at: string
          valor_bruto: number
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          fechamento_id: string
          forma_venda?: string | null
          id?: string
          marca_id: string
          quantidade?: number | null
          updated_at?: string
          valor_bruto?: number
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          fechamento_id?: string
          forma_venda?: string | null
          id?: string
          marca_id?: string
          quantidade?: number | null
          updated_at?: string
          valor_bruto?: number
        }
        Relationships: [
          {
            foreignKeyName: "financeiro_fechamento_marca_valores_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_fechamento_marca_valores_fechamento_fk"
            columns: ["company_id", "fechamento_id"]
            isOneToOne: false
            referencedRelation: "financeiro_fechamento_caixa"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "financeiro_fechamento_marca_valores_marca_fk"
            columns: ["company_id", "marca_id"]
            isOneToOne: false
            referencedRelation: "financeiro_fechamento_marcas"
            referencedColumns: ["company_id", "id"]
          },
        ]
      }
      financeiro_fechamento_marcas: {
        Row: {
          ativo: boolean
          categoria_id: string | null
          company_id: string
          created_at: string
          created_by: string | null
          forma_venda: string | null
          id: string
          nome: string
          nome_unaccent: string | null
          ordem: number
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          categoria_id?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          forma_venda?: string | null
          id?: string
          nome: string
          nome_unaccent?: string | null
          ordem?: number
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          categoria_id?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          forma_venda?: string | null
          id?: string
          nome?: string
          nome_unaccent?: string | null
          ordem?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "financeiro_fechamento_marcas_categoria_fk"
            columns: ["company_id", "categoria_id"]
            isOneToOne: false
            referencedRelation: "fin_categorias"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "financeiro_fechamento_marcas_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_logs: {
        Row: {
          action: string
          actor_user_id: string | null
          company_id: string | null
          created_at: string
          error_message: string | null
          id: string
          log_scope: string
          module: string
          payload: Json | null
          reference_id: string | null
          scope_reason: string
          status: string
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          company_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          log_scope?: string
          module?: string
          payload?: Json | null
          reference_id?: string | null
          scope_reason?: string
          status?: string
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          company_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          log_scope?: string
          module?: string
          payload?: Json | null
          reference_id?: string | null
          scope_reason?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      inventario_conferentes: {
        Row: {
          added_by: string
          company_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          added_by: string
          company_id?: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          added_by?: string
          company_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventario_conferentes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      inventario_itens: {
        Row: {
          classificacao: string | null
          company_id: string
          contado_por: string | null
          contagem_fim: string | null
          contagem_fisica: number | null
          contagem_inicio: string | null
          created_at: string
          custo_snapshot: number
          deleted_at: string | null
          deleted_by: string | null
          diferenca_percent: number | null
          diferenca_qtd: number | null
          id: string
          impacto_financeiro: number | null
          inventario_id: string
          justificativa: string | null
          lote_id: string | null
          produto_id: string | null
          saldo_teorico: number
          tipo_item: string
          updated_at: string
        }
        Insert: {
          classificacao?: string | null
          company_id?: string
          contado_por?: string | null
          contagem_fim?: string | null
          contagem_fisica?: number | null
          contagem_inicio?: string | null
          created_at?: string
          custo_snapshot?: number
          deleted_at?: string | null
          deleted_by?: string | null
          diferenca_percent?: number | null
          diferenca_qtd?: number | null
          id?: string
          impacto_financeiro?: number | null
          inventario_id: string
          justificativa?: string | null
          lote_id?: string | null
          produto_id?: string | null
          saldo_teorico?: number
          tipo_item?: string
          updated_at?: string
        }
        Update: {
          classificacao?: string | null
          company_id?: string
          contado_por?: string | null
          contagem_fim?: string | null
          contagem_fisica?: number | null
          contagem_inicio?: string | null
          created_at?: string
          custo_snapshot?: number
          deleted_at?: string | null
          deleted_by?: string | null
          diferenca_percent?: number | null
          diferenca_qtd?: number | null
          id?: string
          impacto_financeiro?: number | null
          inventario_id?: string
          justificativa?: string | null
          lote_id?: string | null
          produto_id?: string | null
          saldo_teorico?: number
          tipo_item?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventario_itens_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventario_itens_inventario_id_fkey"
            columns: ["inventario_id"]
            isOneToOne: false
            referencedRelation: "inventarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventario_itens_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "mv_giro_estoque"
            referencedColumns: ["produto_id"]
          },
          {
            foreignKeyName: "inventario_itens_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "phase7_inventario_itens_inventario_id_tenant_fk"
            columns: ["company_id", "inventario_id"]
            isOneToOne: false
            referencedRelation: "inventarios"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "phase7_inventario_itens_produto_id_tenant_fk"
            columns: ["company_id", "produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["company_id", "id"]
          },
        ]
      }
      inventario_itens_bkp_reset_20260301: {
        Row: {
          classificacao: string | null
          company_id: string | null
          contado_por: string | null
          contagem_fim: string | null
          contagem_fisica: number | null
          contagem_inicio: string | null
          created_at: string | null
          custo_snapshot: number | null
          deleted_at: string | null
          diferenca_percent: number | null
          diferenca_qtd: number | null
          id: string | null
          impacto_financeiro: number | null
          inventario_id: string | null
          justificativa: string | null
          lote_id: string | null
          produto_id: string | null
          saldo_teorico: number | null
          tipo_item: string | null
          updated_at: string | null
        }
        Insert: {
          classificacao?: string | null
          company_id?: string | null
          contado_por?: string | null
          contagem_fim?: string | null
          contagem_fisica?: number | null
          contagem_inicio?: string | null
          created_at?: string | null
          custo_snapshot?: number | null
          deleted_at?: string | null
          diferenca_percent?: number | null
          diferenca_qtd?: number | null
          id?: string | null
          impacto_financeiro?: number | null
          inventario_id?: string | null
          justificativa?: string | null
          lote_id?: string | null
          produto_id?: string | null
          saldo_teorico?: number | null
          tipo_item?: string | null
          updated_at?: string | null
        }
        Update: {
          classificacao?: string | null
          company_id?: string | null
          contado_por?: string | null
          contagem_fim?: string | null
          contagem_fisica?: number | null
          contagem_inicio?: string | null
          created_at?: string | null
          custo_snapshot?: number | null
          deleted_at?: string | null
          diferenca_percent?: number | null
          diferenca_qtd?: number | null
          id?: string | null
          impacto_financeiro?: number | null
          inventario_id?: string | null
          justificativa?: string | null
          lote_id?: string | null
          produto_id?: string | null
          saldo_teorico?: number | null
          tipo_item?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      inventarios: {
        Row: {
          acuracia_percent: number | null
          aprovacao_admin_em: string | null
          aprovado_por: string | null
          categorias: string[] | null
          company_id: string
          conferente_atribuido_em: string | null
          conferente_atribuido_por: string | null
          conferente_user_id: string | null
          created_at: string
          data: string
          deleted_at: string | null
          deleted_by: string | null
          drift_total_valor: number | null
          finalizado_em: string | null
          finalizado_por: string | null
          flag_risco: string | null
          hora: string
          id: string
          idempotency_key: string | null
          justificativa_analise: string | null
          observacao: string | null
          responsavel_user_id: string
          score_risco: number | null
          sob_analise_motivo: string | null
          status: string
          tipo: string
          turno_id: string | null
          updated_at: string
        }
        Insert: {
          acuracia_percent?: number | null
          aprovacao_admin_em?: string | null
          aprovado_por?: string | null
          categorias?: string[] | null
          company_id?: string
          conferente_atribuido_em?: string | null
          conferente_atribuido_por?: string | null
          conferente_user_id?: string | null
          created_at?: string
          data?: string
          deleted_at?: string | null
          deleted_by?: string | null
          drift_total_valor?: number | null
          finalizado_em?: string | null
          finalizado_por?: string | null
          flag_risco?: string | null
          hora?: string
          id?: string
          idempotency_key?: string | null
          justificativa_analise?: string | null
          observacao?: string | null
          responsavel_user_id: string
          score_risco?: number | null
          sob_analise_motivo?: string | null
          status?: string
          tipo: string
          turno_id?: string | null
          updated_at?: string
        }
        Update: {
          acuracia_percent?: number | null
          aprovacao_admin_em?: string | null
          aprovado_por?: string | null
          categorias?: string[] | null
          company_id?: string
          conferente_atribuido_em?: string | null
          conferente_atribuido_por?: string | null
          conferente_user_id?: string | null
          created_at?: string
          data?: string
          deleted_at?: string | null
          deleted_by?: string | null
          drift_total_valor?: number | null
          finalizado_em?: string | null
          finalizado_por?: string | null
          flag_risco?: string | null
          hora?: string
          id?: string
          idempotency_key?: string | null
          justificativa_analise?: string | null
          observacao?: string | null
          responsavel_user_id?: string
          score_risco?: number | null
          sob_analise_motivo?: string | null
          status?: string
          tipo?: string
          turno_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventarios_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "phase7_inventarios_turno_id_tenant_fk"
            columns: ["company_id", "turno_id"]
            isOneToOne: false
            referencedRelation: "turnos"
            referencedColumns: ["company_id", "id"]
          },
        ]
      }
      inventarios_bkp_reset_20260301: {
        Row: {
          acuracia_percent: number | null
          aprovacao_admin_em: string | null
          aprovado_por: string | null
          categorias: string[] | null
          company_id: string | null
          created_at: string | null
          data: string | null
          deleted_at: string | null
          drift_total_valor: number | null
          finalizado_em: string | null
          finalizado_por: string | null
          flag_risco: string | null
          hora: string | null
          id: string | null
          justificativa_analise: string | null
          observacao: string | null
          responsavel_user_id: string | null
          score_risco: number | null
          sob_analise_motivo: string | null
          status: string | null
          tipo: string | null
          turno_id: string | null
          updated_at: string | null
        }
        Insert: {
          acuracia_percent?: number | null
          aprovacao_admin_em?: string | null
          aprovado_por?: string | null
          categorias?: string[] | null
          company_id?: string | null
          created_at?: string | null
          data?: string | null
          deleted_at?: string | null
          drift_total_valor?: number | null
          finalizado_em?: string | null
          finalizado_por?: string | null
          flag_risco?: string | null
          hora?: string | null
          id?: string | null
          justificativa_analise?: string | null
          observacao?: string | null
          responsavel_user_id?: string | null
          score_risco?: number | null
          sob_analise_motivo?: string | null
          status?: string | null
          tipo?: string | null
          turno_id?: string | null
          updated_at?: string | null
        }
        Update: {
          acuracia_percent?: number | null
          aprovacao_admin_em?: string | null
          aprovado_por?: string | null
          categorias?: string[] | null
          company_id?: string | null
          created_at?: string | null
          data?: string | null
          deleted_at?: string | null
          drift_total_valor?: number | null
          finalizado_em?: string | null
          finalizado_por?: string | null
          flag_risco?: string | null
          hora?: string | null
          id?: string | null
          justificativa_analise?: string | null
          observacao?: string | null
          responsavel_user_id?: string | null
          score_risco?: number | null
          sob_analise_motivo?: string | null
          status?: string | null
          tipo?: string | null
          turno_id?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      job_roles: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          descricao: string | null
          id: string
          is_active: boolean
          nome: string
        }
        Insert: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          id?: string
          is_active?: boolean
          nome: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          id?: string
          is_active?: boolean
          nome?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_roles_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      listas_fixas_setor: {
        Row: {
          ativo: boolean
          company_id: string
          created_at: string
          created_by: string
          id: string
          nome: string
          setor: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          ativo?: boolean
          company_id: string
          created_at?: string
          created_by: string
          id?: string
          nome?: string
          setor: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          ativo?: boolean
          company_id?: string
          created_at?: string
          created_by?: string
          id?: string
          nome?: string
          setor?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "listas_fixas_setor_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      listas_fixas_setor_itens: {
        Row: {
          company_id: string
          created_at: string
          id: string
          lista_fixa_id: string
          observacao: string | null
          ordem: number
          produto_id: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          lista_fixa_id: string
          observacao?: string | null
          ordem?: number
          produto_id: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          lista_fixa_id?: string
          observacao?: string | null
          ordem?: number
          produto_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "listas_fixas_setor_itens_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listas_fixas_setor_itens_lista_fixa_id_fkey"
            columns: ["lista_fixa_id"]
            isOneToOne: false
            referencedRelation: "listas_fixas_setor"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listas_fixas_setor_itens_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "mv_giro_estoque"
            referencedColumns: ["produto_id"]
          },
          {
            foreignKeyName: "listas_fixas_setor_itens_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      listas_fixas_setor_usuarios: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          lista_fixa_id: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          lista_fixa_id: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          lista_fixa_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "listas_fixas_setor_usuarios_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listas_fixas_setor_usuarios_lista_fk"
            columns: ["company_id", "lista_fixa_id"]
            isOneToOne: false
            referencedRelation: "listas_fixas_setor"
            referencedColumns: ["company_id", "id"]
          },
        ]
      }
      metas_cmv: {
        Row: {
          alerta_amarelo_percent: number
          alerta_vermelho_percent: number
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          mes_ano: string
          meta_cmv_geral: number
          meta_cmv_salmao: number
          meta_cmv_total: number
          updated_at: string
        }
        Insert: {
          alerta_amarelo_percent?: number
          alerta_vermelho_percent?: number
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          mes_ano: string
          meta_cmv_geral?: number
          meta_cmv_salmao?: number
          meta_cmv_total?: number
          updated_at?: string
        }
        Update: {
          alerta_amarelo_percent?: number
          alerta_vermelho_percent?: number
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          mes_ano?: string
          meta_cmv_geral?: number
          meta_cmv_salmao?: number
          meta_cmv_total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "metas_cmv_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      movimentacoes_estoque: {
        Row: {
          cancelado_em: string | null
          cancelado_por: string | null
          company_id: string
          created_at: string
          created_by: string | null
          custo_total: number
          custo_unitario: number
          data: string
          direction: string | null
          editado_em: string | null
          editado_por: string | null
          estorno_de_id: string | null
          id: string
          internal_transfer: boolean
          justificativa_cancelamento: string | null
          justificativa_edicao: string | null
          observacao: string | null
          origem: string | null
          produto_id: string
          quantidade: number
          reference_id: string | null
          reference_type: string | null
          referencia_id: string | null
          salmon_lot_id: string | null
          setor: string | null
          source_module: string | null
          status: string
          tipo: string
        }
        Insert: {
          cancelado_em?: string | null
          cancelado_por?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          custo_total?: number
          custo_unitario?: number
          data?: string
          direction?: string | null
          editado_em?: string | null
          editado_por?: string | null
          estorno_de_id?: string | null
          id?: string
          internal_transfer?: boolean
          justificativa_cancelamento?: string | null
          justificativa_edicao?: string | null
          observacao?: string | null
          origem?: string | null
          produto_id: string
          quantidade?: number
          reference_id?: string | null
          reference_type?: string | null
          referencia_id?: string | null
          salmon_lot_id?: string | null
          setor?: string | null
          source_module?: string | null
          status?: string
          tipo: string
        }
        Update: {
          cancelado_em?: string | null
          cancelado_por?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          custo_total?: number
          custo_unitario?: number
          data?: string
          direction?: string | null
          editado_em?: string | null
          editado_por?: string | null
          estorno_de_id?: string | null
          id?: string
          internal_transfer?: boolean
          justificativa_cancelamento?: string | null
          justificativa_edicao?: string | null
          observacao?: string | null
          origem?: string | null
          produto_id?: string
          quantidade?: number
          reference_id?: string | null
          reference_type?: string | null
          referencia_id?: string | null
          salmon_lot_id?: string | null
          setor?: string | null
          source_module?: string | null
          status?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_mov_estorno"
            columns: ["estorno_de_id"]
            isOneToOne: false
            referencedRelation: "movimentacoes_estoque"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_mov_produto"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "mv_giro_estoque"
            referencedColumns: ["produto_id"]
          },
          {
            foreignKeyName: "fk_mov_produto"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimentacoes_estoque_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      movimentacoes_estoque_bkp_reset_20260301: {
        Row: {
          cancelado_em: string | null
          cancelado_por: string | null
          company_id: string | null
          created_at: string | null
          created_by: string | null
          custo_total: number | null
          custo_unitario: number | null
          data: string | null
          direction: string | null
          editado_em: string | null
          editado_por: string | null
          estorno_de_id: string | null
          id: string | null
          internal_transfer: boolean | null
          justificativa_cancelamento: string | null
          justificativa_edicao: string | null
          observacao: string | null
          origem: string | null
          produto_id: string | null
          quantidade: number | null
          reference_id: string | null
          reference_type: string | null
          referencia_id: string | null
          salmon_lot_id: string | null
          setor: string | null
          source_module: string | null
          status: string | null
          tipo: string | null
        }
        Insert: {
          cancelado_em?: string | null
          cancelado_por?: string | null
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          custo_total?: number | null
          custo_unitario?: number | null
          data?: string | null
          direction?: string | null
          editado_em?: string | null
          editado_por?: string | null
          estorno_de_id?: string | null
          id?: string | null
          internal_transfer?: boolean | null
          justificativa_cancelamento?: string | null
          justificativa_edicao?: string | null
          observacao?: string | null
          origem?: string | null
          produto_id?: string | null
          quantidade?: number | null
          reference_id?: string | null
          reference_type?: string | null
          referencia_id?: string | null
          salmon_lot_id?: string | null
          setor?: string | null
          source_module?: string | null
          status?: string | null
          tipo?: string | null
        }
        Update: {
          cancelado_em?: string | null
          cancelado_por?: string | null
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          custo_total?: number | null
          custo_unitario?: number | null
          data?: string | null
          direction?: string | null
          editado_em?: string | null
          editado_por?: string | null
          estorno_de_id?: string | null
          id?: string | null
          internal_transfer?: boolean | null
          justificativa_cancelamento?: string | null
          justificativa_edicao?: string | null
          observacao?: string | null
          origem?: string | null
          produto_id?: string | null
          quantidade?: number | null
          reference_id?: string | null
          reference_type?: string | null
          referencia_id?: string | null
          salmon_lot_id?: string | null
          setor?: string | null
          source_module?: string | null
          status?: string | null
          tipo?: string | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          entity_id: string | null
          entity_type: string | null
          id: string
          link_path: string | null
          message: string
          metadata: Json | null
          module: string | null
          read_at: string | null
          recipient_user_id: string
          title: string
          type: string
        }
        Insert: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          link_path?: string | null
          message?: string
          metadata?: Json | null
          module?: string | null
          read_at?: string | null
          recipient_user_id: string
          title: string
          type?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          link_path?: string | null
          message?: string
          metadata?: Json | null
          module?: string | null
          read_at?: string | null
          recipient_user_id?: string
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          action: string
          description: string
          key: string
          module: string
          submodule: string | null
        }
        Insert: {
          action?: string
          description?: string
          key: string
          module: string
          submodule?: string | null
        }
        Update: {
          action?: string
          description?: string
          key?: string
          module?: string
          submodule?: string | null
        }
        Relationships: []
      }
      planning_metas_compra: {
        Row: {
          alerta_amarelo_percent: number
          alerta_vermelho_percent: number
          ativo: boolean
          categoria: string
          company_id: string
          created_at: string
          created_by: string
          id: string
          month: number
          notes: string | null
          target_value: number
          updated_at: string
          year: number
        }
        Insert: {
          alerta_amarelo_percent?: number
          alerta_vermelho_percent?: number
          ativo?: boolean
          categoria: string
          company_id?: string
          created_at?: string
          created_by?: string
          id?: string
          month: number
          notes?: string | null
          target_value: number
          updated_at?: string
          year: number
        }
        Update: {
          alerta_amarelo_percent?: number
          alerta_vermelho_percent?: number
          ativo?: boolean
          categoria?: string
          company_id?: string
          created_at?: string
          created_by?: string
          id?: string
          month?: number
          notes?: string | null
          target_value?: number
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "planning_metas_compra_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      precificacao_canal: {
        Row: {
          canal_id: string
          company_id: string
          componente_id: string
          created_at: string
          id: string
          preco_venda: number
          updated_at: string
        }
        Insert: {
          canal_id: string
          company_id?: string
          componente_id: string
          created_at?: string
          id?: string
          preco_venda?: number
          updated_at?: string
        }
        Update: {
          canal_id?: string
          company_id?: string
          componente_id?: string
          created_at?: string
          id?: string
          preco_venda?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "precificacao_canal_canal_id_fkey"
            columns: ["canal_id"]
            isOneToOne: false
            referencedRelation: "canais_venda"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "precificacao_canal_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "precificacao_canal_componente_id_fkey"
            columns: ["componente_id"]
            isOneToOne: false
            referencedRelation: "ficha_componentes"
            referencedColumns: ["id"]
          },
        ]
      }
      produto_codigos_barras: {
        Row: {
          codigo: string
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          produto_id: string
          rotulo: string | null
        }
        Insert: {
          codigo: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          produto_id: string
          rotulo?: string | null
        }
        Update: {
          codigo?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          produto_id?: string
          rotulo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "produto_codigos_barras_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "produto_codigos_barras_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "mv_giro_estoque"
            referencedColumns: ["produto_id"]
          },
          {
            foreignKeyName: "produto_codigos_barras_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      produtos: {
        Row: {
          ativo: boolean
          avg30_cost_base_unit: number
          avg30_cost_purchase_unit: number
          avg30_variation_percent: number
          barcode: string | null
          categoria: string
          client_request_id: string | null
          company_id: string
          conta_no_cmv: boolean
          conversion_mode: string
          conversoes: string | null
          created_at: string
          custo_medio_30d: number
          custo_padrao: number
          custo_ultima_compra: number
          default_cost_base_unit: number
          default_cost_purchase_unit: number
          estoque_ideal: number
          estoque_minimo: number
          fator_conversao_padrao: number
          fornecedores_preferenciais: string[] | null
          id: string
          inactivity_days_threshold: number | null
          is_salmon_raw_linked: boolean
          last_cost_base_unit: number
          last_cost_purchase_unit: number
          last_movement_at: string | null
          last_purchase_date: string | null
          last_supplier: string | null
          lead_time_dias: number
          local_estoque: string | null
          needs_cost_review: boolean
          nome_produto: string
          nome_produto_unaccent: string | null
          observacoes: string | null
          package_measure_unit: string | null
          package_quantity: number | null
          saldo_atual: number | null
          sku: string | null
          sku_unaccent: string | null
          unidade_compra: string
          unidade_medida: string
        }
        Insert: {
          ativo?: boolean
          avg30_cost_base_unit?: number
          avg30_cost_purchase_unit?: number
          avg30_variation_percent?: number
          barcode?: string | null
          categoria?: string
          client_request_id?: string | null
          company_id?: string
          conta_no_cmv?: boolean
          conversion_mode?: string
          conversoes?: string | null
          created_at?: string
          custo_medio_30d?: number
          custo_padrao?: number
          custo_ultima_compra?: number
          default_cost_base_unit?: number
          default_cost_purchase_unit?: number
          estoque_ideal?: number
          estoque_minimo?: number
          fator_conversao_padrao?: number
          fornecedores_preferenciais?: string[] | null
          id?: string
          inactivity_days_threshold?: number | null
          is_salmon_raw_linked?: boolean
          last_cost_base_unit?: number
          last_cost_purchase_unit?: number
          last_movement_at?: string | null
          last_purchase_date?: string | null
          last_supplier?: string | null
          lead_time_dias?: number
          local_estoque?: string | null
          needs_cost_review?: boolean
          nome_produto: string
          nome_produto_unaccent?: string | null
          observacoes?: string | null
          package_measure_unit?: string | null
          package_quantity?: number | null
          saldo_atual?: number | null
          sku?: string | null
          sku_unaccent?: string | null
          unidade_compra?: string
          unidade_medida?: string
        }
        Update: {
          ativo?: boolean
          avg30_cost_base_unit?: number
          avg30_cost_purchase_unit?: number
          avg30_variation_percent?: number
          barcode?: string | null
          categoria?: string
          client_request_id?: string | null
          company_id?: string
          conta_no_cmv?: boolean
          conversion_mode?: string
          conversoes?: string | null
          created_at?: string
          custo_medio_30d?: number
          custo_padrao?: number
          custo_ultima_compra?: number
          default_cost_base_unit?: number
          default_cost_purchase_unit?: number
          estoque_ideal?: number
          estoque_minimo?: number
          fator_conversao_padrao?: number
          fornecedores_preferenciais?: string[] | null
          id?: string
          inactivity_days_threshold?: number | null
          is_salmon_raw_linked?: boolean
          last_cost_base_unit?: number
          last_cost_purchase_unit?: number
          last_movement_at?: string | null
          last_purchase_date?: string | null
          last_supplier?: string | null
          lead_time_dias?: number
          local_estoque?: string | null
          needs_cost_review?: boolean
          nome_produto?: string
          nome_produto_unaccent?: string | null
          observacoes?: string | null
          package_measure_unit?: string | null
          package_quantity?: number | null
          saldo_atual?: number | null
          sku?: string | null
          sku_unaccent?: string | null
          unidade_compra?: string
          unidade_medida?: string
        }
        Relationships: [
          {
            foreignKeyName: "produtos_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      produtos_bkp_reset_20260301: {
        Row: {
          ativo: boolean | null
          avg30_cost_base_unit: number | null
          avg30_cost_purchase_unit: number | null
          avg30_variation_percent: number | null
          categoria: string | null
          company_id: string | null
          conta_no_cmv: boolean | null
          conversoes: string | null
          created_at: string | null
          custo_medio_30d: number | null
          custo_padrao: number | null
          custo_ultima_compra: number | null
          default_cost_base_unit: number | null
          default_cost_purchase_unit: number | null
          estoque_ideal: number | null
          estoque_minimo: number | null
          fator_conversao_padrao: number | null
          fornecedores_preferenciais: string[] | null
          id: string | null
          inactivity_days_threshold: number | null
          is_salmon_raw_linked: boolean | null
          last_cost_base_unit: number | null
          last_cost_purchase_unit: number | null
          last_movement_at: string | null
          last_purchase_date: string | null
          last_supplier: string | null
          lead_time_dias: number | null
          local_estoque: string | null
          needs_cost_review: boolean | null
          nome_produto: string | null
          observacoes: string | null
          sku: string | null
          unidade_compra: string | null
          unidade_medida: string | null
        }
        Insert: {
          ativo?: boolean | null
          avg30_cost_base_unit?: number | null
          avg30_cost_purchase_unit?: number | null
          avg30_variation_percent?: number | null
          categoria?: string | null
          company_id?: string | null
          conta_no_cmv?: boolean | null
          conversoes?: string | null
          created_at?: string | null
          custo_medio_30d?: number | null
          custo_padrao?: number | null
          custo_ultima_compra?: number | null
          default_cost_base_unit?: number | null
          default_cost_purchase_unit?: number | null
          estoque_ideal?: number | null
          estoque_minimo?: number | null
          fator_conversao_padrao?: number | null
          fornecedores_preferenciais?: string[] | null
          id?: string | null
          inactivity_days_threshold?: number | null
          is_salmon_raw_linked?: boolean | null
          last_cost_base_unit?: number | null
          last_cost_purchase_unit?: number | null
          last_movement_at?: string | null
          last_purchase_date?: string | null
          last_supplier?: string | null
          lead_time_dias?: number | null
          local_estoque?: string | null
          needs_cost_review?: boolean | null
          nome_produto?: string | null
          observacoes?: string | null
          sku?: string | null
          unidade_compra?: string | null
          unidade_medida?: string | null
        }
        Update: {
          ativo?: boolean | null
          avg30_cost_base_unit?: number | null
          avg30_cost_purchase_unit?: number | null
          avg30_variation_percent?: number | null
          categoria?: string | null
          company_id?: string | null
          conta_no_cmv?: boolean | null
          conversoes?: string | null
          created_at?: string | null
          custo_medio_30d?: number | null
          custo_padrao?: number | null
          custo_ultima_compra?: number | null
          default_cost_base_unit?: number | null
          default_cost_purchase_unit?: number | null
          estoque_ideal?: number | null
          estoque_minimo?: number | null
          fator_conversao_padrao?: number | null
          fornecedores_preferenciais?: string[] | null
          id?: string | null
          inactivity_days_threshold?: number | null
          is_salmon_raw_linked?: boolean | null
          last_cost_base_unit?: number | null
          last_cost_purchase_unit?: number | null
          last_movement_at?: string | null
          last_purchase_date?: string | null
          last_supplier?: string | null
          lead_time_dias?: number | null
          local_estoque?: string | null
          needs_cost_review?: boolean | null
          nome_produto?: string | null
          observacoes?: string | null
          sku?: string | null
          unidade_compra?: string | null
          unidade_medida?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          company_id: string
          created_at: string
          email: string
          id: string
          job_role_id: string | null
          nome: string
          sector: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          company_id?: string
          created_at?: string
          email?: string
          id: string
          job_role_id?: string | null
          nome?: string
          sector?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          company_id?: string
          created_at?: string
          email?: string
          id?: string
          job_role_id?: string | null
          nome?: string
          sector?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_job_role_id_fkey"
            columns: ["job_role_id"]
            isOneToOne: false
            referencedRelation: "job_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_ignored_rules: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          produto_id: string | null
          scope: string
        }
        Insert: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          produto_id?: string | null
          scope?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          produto_id?: string | null
          scope?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_ignored_rules_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_ignored_rules_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "mv_giro_estoque"
            referencedColumns: ["produto_id"]
          },
          {
            foreignKeyName: "purchase_ignored_rules_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_items: {
        Row: {
          company_id: string
          conversion_factor_snapshot: number | null
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          estimated_unit_value: number
          id: string
          name_snapshot: string
          not_delivered_reason: string | null
          order_id: string
          purchase_unit_cost_snapshot: number | null
          purchase_unit_snapshot: string | null
          qty_received: number
          qty_requested: number
          received_at: string | null
          received_by: string | null
          received_status: string
          shopping_note: string | null
          shopping_status: string
          stock_entry_skipped: boolean
          stock_item_id: string | null
          unit_snapshot: string
          updated_at: string
        }
        Insert: {
          company_id?: string
          conversion_factor_snapshot?: number | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          estimated_unit_value?: number
          id?: string
          name_snapshot: string
          not_delivered_reason?: string | null
          order_id: string
          purchase_unit_cost_snapshot?: number | null
          purchase_unit_snapshot?: string | null
          qty_received?: number
          qty_requested?: number
          received_at?: string | null
          received_by?: string | null
          received_status?: string
          shopping_note?: string | null
          shopping_status?: string
          stock_entry_skipped?: boolean
          stock_item_id?: string | null
          unit_snapshot?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          conversion_factor_snapshot?: number | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          estimated_unit_value?: number
          id?: string
          name_snapshot?: string
          not_delivered_reason?: string | null
          order_id?: string
          purchase_unit_cost_snapshot?: number | null
          purchase_unit_snapshot?: string | null
          qty_received?: number
          qty_requested?: number
          received_at?: string | null
          received_by?: string | null
          received_status?: string
          shopping_note?: string | null
          shopping_status?: string
          stock_entry_skipped?: boolean
          stock_item_id?: string | null
          unit_snapshot?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "phase7_purchase_order_items_order_id_tenant_fk"
            columns: ["company_id", "order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "phase7_purchase_order_items_stock_item_id_tenant_fk"
            columns: ["company_id", "stock_item_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "purchase_order_items_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_items_bkp_reset_20260301: {
        Row: {
          company_id: string | null
          conversion_factor_snapshot: number | null
          created_at: string | null
          estimated_unit_value: number | null
          id: string | null
          name_snapshot: string | null
          not_delivered_reason: string | null
          order_id: string | null
          purchase_unit_cost_snapshot: number | null
          purchase_unit_snapshot: string | null
          qty_received: number | null
          qty_requested: number | null
          received_at: string | null
          received_by: string | null
          received_status: string | null
          shopping_note: string | null
          shopping_status: string | null
          stock_item_id: string | null
          unit_snapshot: string | null
          updated_at: string | null
        }
        Insert: {
          company_id?: string | null
          conversion_factor_snapshot?: number | null
          created_at?: string | null
          estimated_unit_value?: number | null
          id?: string | null
          name_snapshot?: string | null
          not_delivered_reason?: string | null
          order_id?: string | null
          purchase_unit_cost_snapshot?: number | null
          purchase_unit_snapshot?: string | null
          qty_received?: number | null
          qty_requested?: number | null
          received_at?: string | null
          received_by?: string | null
          received_status?: string | null
          shopping_note?: string | null
          shopping_status?: string | null
          stock_item_id?: string | null
          unit_snapshot?: string | null
          updated_at?: string | null
        }
        Update: {
          company_id?: string | null
          conversion_factor_snapshot?: number | null
          created_at?: string | null
          estimated_unit_value?: number | null
          id?: string | null
          name_snapshot?: string | null
          not_delivered_reason?: string | null
          order_id?: string | null
          purchase_unit_cost_snapshot?: number | null
          purchase_unit_snapshot?: string | null
          qty_received?: number | null
          qty_requested?: number | null
          received_at?: string | null
          received_by?: string | null
          received_status?: string | null
          shopping_note?: string | null
          shopping_status?: string | null
          stock_item_id?: string | null
          unit_snapshot?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      purchase_orders: {
        Row: {
          category: string
          company_id: string
          concluded_at: string | null
          created_at: string
          created_by: string
          deleted_at: string | null
          deleted_by: string | null
          delivery_forecast_date: string | null
          id: string
          idempotency_key: string | null
          need_by_date: string | null
          not_delivered_ack_at: string | null
          not_delivered_ack_by: string | null
          notes: string | null
          origin: string | null
          origin_ref: string | null
          payment_type: string | null
          priority: string
          responsible_user_id: string | null
          shopping_done_at: string | null
          shopping_done_by: string | null
          status: string
          supplier_name: string | null
          title: string
          total_confirmed: number
          total_estimated: number
          type: string
          updated_at: string
        }
        Insert: {
          category?: string
          company_id?: string
          concluded_at?: string | null
          created_at?: string
          created_by: string
          deleted_at?: string | null
          deleted_by?: string | null
          delivery_forecast_date?: string | null
          id?: string
          idempotency_key?: string | null
          need_by_date?: string | null
          not_delivered_ack_at?: string | null
          not_delivered_ack_by?: string | null
          notes?: string | null
          origin?: string | null
          origin_ref?: string | null
          payment_type?: string | null
          priority?: string
          responsible_user_id?: string | null
          shopping_done_at?: string | null
          shopping_done_by?: string | null
          status?: string
          supplier_name?: string | null
          title: string
          total_confirmed?: number
          total_estimated?: number
          type?: string
          updated_at?: string
        }
        Update: {
          category?: string
          company_id?: string
          concluded_at?: string | null
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          deleted_by?: string | null
          delivery_forecast_date?: string | null
          id?: string
          idempotency_key?: string | null
          need_by_date?: string | null
          not_delivered_ack_at?: string | null
          not_delivered_ack_by?: string | null
          notes?: string | null
          origin?: string | null
          origin_ref?: string | null
          payment_type?: string | null
          priority?: string
          responsible_user_id?: string | null
          shopping_done_at?: string | null
          shopping_done_by?: string | null
          status?: string
          supplier_name?: string | null
          title?: string
          total_confirmed?: number
          total_estimated?: number
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders_bkp_reset_20260301: {
        Row: {
          category: string | null
          company_id: string | null
          concluded_at: string | null
          created_at: string | null
          created_by: string | null
          delivery_forecast_date: string | null
          id: string | null
          need_by_date: string | null
          not_delivered_ack_at: string | null
          not_delivered_ack_by: string | null
          notes: string | null
          payment_type: string | null
          priority: string | null
          responsible_user_id: string | null
          shopping_done_at: string | null
          shopping_done_by: string | null
          status: string | null
          supplier_name: string | null
          title: string | null
          total_confirmed: number | null
          total_estimated: number | null
          type: string | null
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          company_id?: string | null
          concluded_at?: string | null
          created_at?: string | null
          created_by?: string | null
          delivery_forecast_date?: string | null
          id?: string | null
          need_by_date?: string | null
          not_delivered_ack_at?: string | null
          not_delivered_ack_by?: string | null
          notes?: string | null
          payment_type?: string | null
          priority?: string | null
          responsible_user_id?: string | null
          shopping_done_at?: string | null
          shopping_done_by?: string | null
          status?: string | null
          supplier_name?: string | null
          title?: string | null
          total_confirmed?: number | null
          total_estimated?: number | null
          type?: string | null
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          company_id?: string | null
          concluded_at?: string | null
          created_at?: string | null
          created_by?: string | null
          delivery_forecast_date?: string | null
          id?: string | null
          need_by_date?: string | null
          not_delivered_ack_at?: string | null
          not_delivered_ack_by?: string | null
          notes?: string | null
          payment_type?: string | null
          priority?: string | null
          responsible_user_id?: string | null
          shopping_done_at?: string | null
          shopping_done_by?: string | null
          status?: string | null
          supplier_name?: string | null
          title?: string | null
          total_confirmed?: number | null
          total_estimated?: number | null
          type?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      purchase_receipt_batches: {
        Row: {
          company_id: string
          created_at: string
          created_by: string
          id: string
          idempotency_key: string
          order_id: string
          response: Json
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by: string
          id?: string
          idempotency_key: string
          order_id: string
          response: Json
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string
          id?: string
          idempotency_key?: string
          order_id?: string
          response?: Json
        }
        Relationships: [
          {
            foreignKeyName: "purchase_receipt_batches_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_receipt_batches_order_tenant_fk"
            columns: ["company_id", "order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["company_id", "id"]
          },
        ]
      }
      purchase_reminders: {
        Row: {
          active: boolean
          category_ids: string[] | null
          company_id: string
          created_at: string
          created_by: string
          day_of_week: number
          delivery_forecast_offset_days: number | null
          id: string
          item_ids: string[] | null
          need_by_offset_days: number | null
          notes_template: string | null
          payment_type: string | null
          recurrence: string
          responsible_user_ids: string[] | null
          supplier_id: string | null
          title: string
          type_default: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          category_ids?: string[] | null
          company_id?: string
          created_at?: string
          created_by: string
          day_of_week: number
          delivery_forecast_offset_days?: number | null
          id?: string
          item_ids?: string[] | null
          need_by_offset_days?: number | null
          notes_template?: string | null
          payment_type?: string | null
          recurrence?: string
          responsible_user_ids?: string[] | null
          supplier_id?: string | null
          title: string
          type_default?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          category_ids?: string[] | null
          company_id?: string
          created_at?: string
          created_by?: string
          day_of_week?: number
          delivery_forecast_offset_days?: number | null
          id?: string
          item_ids?: string[] | null
          need_by_offset_days?: number | null
          notes_template?: string | null
          payment_type?: string | null
          recurrence?: string
          responsible_user_ids?: string[] | null
          supplier_id?: string | null
          title?: string
          type_default?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_reminders_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_requisition_audit: {
        Row: {
          acao: string
          campo: string | null
          company_id: string
          created_at: string
          id: string
          requisition_id: string
          user_id: string | null
          valor_anterior: string | null
          valor_novo: string | null
        }
        Insert: {
          acao: string
          campo?: string | null
          company_id?: string
          created_at?: string
          id?: string
          requisition_id: string
          user_id?: string | null
          valor_anterior?: string | null
          valor_novo?: string | null
        }
        Update: {
          acao?: string
          campo?: string | null
          company_id?: string
          created_at?: string
          id?: string
          requisition_id?: string
          user_id?: string | null
          valor_anterior?: string | null
          valor_novo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_requisition_audit_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stabilization_purchase_requisition_audit_parent_tenant_fk"
            columns: ["company_id", "requisition_id"]
            isOneToOne: false
            referencedRelation: "purchase_requisitions"
            referencedColumns: ["company_id", "id"]
          },
        ]
      }
      purchase_requisition_items: {
        Row: {
          company_id: string
          created_at: string
          id: string
          ignored_at: string | null
          ignored_by: string | null
          ignored_reason: string | null
          is_ignored: boolean
          motivo: string | null
          preco_referencia: number | null
          prioridade: string | null
          produto_id: string | null
          produto_nome: string
          quantidade_escolhida: number | null
          quantidade_sugerida: number | null
          requisition_id: string
          subtotal: number | null
          unidade: string | null
          updated_at: string
        }
        Insert: {
          company_id?: string
          created_at?: string
          id?: string
          ignored_at?: string | null
          ignored_by?: string | null
          ignored_reason?: string | null
          is_ignored?: boolean
          motivo?: string | null
          preco_referencia?: number | null
          prioridade?: string | null
          produto_id?: string | null
          produto_nome?: string
          quantidade_escolhida?: number | null
          quantidade_sugerida?: number | null
          requisition_id: string
          subtotal?: number | null
          unidade?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          ignored_at?: string | null
          ignored_by?: string | null
          ignored_reason?: string | null
          is_ignored?: boolean
          motivo?: string | null
          preco_referencia?: number | null
          prioridade?: string | null
          produto_id?: string | null
          produto_nome?: string
          quantidade_escolhida?: number | null
          quantidade_sugerida?: number | null
          requisition_id?: string
          subtotal?: number | null
          unidade?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_requisition_items_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stabilization_purchase_requisition_items_parent_tenant_fk"
            columns: ["company_id", "requisition_id"]
            isOneToOne: false
            referencedRelation: "purchase_requisitions"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "stabilization_purchase_requisition_items_product_tenant_fk"
            columns: ["company_id", "produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["company_id", "id"]
          },
        ]
      }
      purchase_requisitions: {
        Row: {
          codigo: string
          company_id: string
          created_at: string
          created_by: string | null
          data: string
          id: string
          observacao: string | null
          status: string
          tipo: string
          total_estimado: number | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          codigo?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          data?: string
          id?: string
          observacao?: string | null
          status?: string
          tipo?: string
          total_estimado?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          codigo?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          data?: string
          id?: string
          observacao?: string | null
          status?: string
          tipo?: string
          total_estimado?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_requisitions_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      rbac_legacy_usage: {
        Row: {
          company_id: string
          context: string | null
          created_at: string
          id: string
          legacy_key: string
          resolved_to: Json
          user_id: string | null
        }
        Insert: {
          company_id: string
          context?: string | null
          created_at?: string
          id?: string
          legacy_key: string
          resolved_to?: Json
          user_id?: string | null
        }
        Update: {
          company_id?: string
          context?: string | null
          created_at?: string
          id?: string
          legacy_key?: string
          resolved_to?: Json
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_rbac_legacy_company"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      recebimento_itens: {
        Row: {
          company_id: string
          created_at: string
          divergencia_nota: string | null
          divergencia_tipo: string | null
          id: string
          item_id: string
          produto_id: string | null
          qtd_comprada: number
          qtd_recebida: number | null
          qtd_solicitada: number
          recebido: boolean
          recebimento_id: string
          status_item: string
        }
        Insert: {
          company_id?: string
          created_at?: string
          divergencia_nota?: string | null
          divergencia_tipo?: string | null
          id?: string
          item_id: string
          produto_id?: string | null
          qtd_comprada?: number
          qtd_recebida?: number | null
          qtd_solicitada?: number
          recebido?: boolean
          recebimento_id: string
          status_item?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          divergencia_nota?: string | null
          divergencia_tipo?: string | null
          id?: string
          item_id?: string
          produto_id?: string | null
          qtd_comprada?: number
          qtd_recebida?: number | null
          qtd_solicitada?: number
          recebido?: boolean
          recebimento_id?: string
          status_item?: string
        }
        Relationships: [
          {
            foreignKeyName: "recebimento_itens_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recebimento_itens_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "solic_compra_mercado_item"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recebimento_itens_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "mv_giro_estoque"
            referencedColumns: ["produto_id"]
          },
          {
            foreignKeyName: "recebimento_itens_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recebimento_itens_recebimento_id_fkey"
            columns: ["recebimento_id"]
            isOneToOne: false
            referencedRelation: "recebimentos"
            referencedColumns: ["id"]
          },
        ]
      }
      recebimento_itens_bkp_reset_20260301: {
        Row: {
          company_id: string | null
          created_at: string | null
          divergencia_nota: string | null
          divergencia_tipo: string | null
          id: string | null
          item_id: string | null
          produto_id: string | null
          qtd_comprada: number | null
          qtd_recebida: number | null
          qtd_solicitada: number | null
          recebido: boolean | null
          recebimento_id: string | null
          status_item: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          divergencia_nota?: string | null
          divergencia_tipo?: string | null
          id?: string | null
          item_id?: string | null
          produto_id?: string | null
          qtd_comprada?: number | null
          qtd_recebida?: number | null
          qtd_solicitada?: number | null
          recebido?: boolean | null
          recebimento_id?: string | null
          status_item?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          divergencia_nota?: string | null
          divergencia_tipo?: string | null
          id?: string | null
          item_id?: string | null
          produto_id?: string | null
          qtd_comprada?: number | null
          qtd_recebida?: number | null
          qtd_solicitada?: number | null
          recebido?: boolean | null
          recebimento_id?: string | null
          status_item?: string | null
        }
        Relationships: []
      }
      recebimentos: {
        Row: {
          company_id: string
          created_at: string
          enviar_ao_estoque: boolean | null
          estoque_atualizado_em: string | null
          estoque_atualizado_por: string | null
          id: string
          observacoes: string | null
          recebido_em: string | null
          recebido_por: string | null
          solicitacao_id: string
          status: string
          updated_at: string
        }
        Insert: {
          company_id?: string
          created_at?: string
          enviar_ao_estoque?: boolean | null
          estoque_atualizado_em?: string | null
          estoque_atualizado_por?: string | null
          id?: string
          observacoes?: string | null
          recebido_em?: string | null
          recebido_por?: string | null
          solicitacao_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          enviar_ao_estoque?: boolean | null
          estoque_atualizado_em?: string | null
          estoque_atualizado_por?: string | null
          id?: string
          observacoes?: string | null
          recebido_em?: string | null
          recebido_por?: string | null
          solicitacao_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recebimentos_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recebimentos_solicitacao_id_fkey"
            columns: ["solicitacao_id"]
            isOneToOne: false
            referencedRelation: "solic_compra_mercado"
            referencedColumns: ["id"]
          },
        ]
      }
      recebimentos_bkp_reset_20260301: {
        Row: {
          company_id: string | null
          created_at: string | null
          enviar_ao_estoque: boolean | null
          estoque_atualizado_em: string | null
          estoque_atualizado_por: string | null
          id: string | null
          observacoes: string | null
          recebido_em: string | null
          recebido_por: string | null
          solicitacao_id: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          enviar_ao_estoque?: boolean | null
          estoque_atualizado_em?: string | null
          estoque_atualizado_por?: string | null
          id?: string | null
          observacoes?: string | null
          recebido_em?: string | null
          recebido_por?: string | null
          solicitacao_id?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          enviar_ao_estoque?: boolean | null
          estoque_atualizado_em?: string | null
          estoque_atualizado_por?: string | null
          id?: string | null
          observacoes?: string | null
          recebido_em?: string | null
          recebido_por?: string | null
          solicitacao_id?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      requisicao_estoque_itens: {
        Row: {
          atendido_em: string | null
          atendido_por: string | null
          company_id: string
          created_at: string
          id: string
          motivo_recusa: string | null
          produto_id: string
          quantidade_atendida: number
          quantidade_solicitada: number
          recusado_em: string | null
          recusado_por: string | null
          requisicao_id: string
          saldo_snapshot: number
          status: string
          unidade: string
        }
        Insert: {
          atendido_em?: string | null
          atendido_por?: string | null
          company_id?: string
          created_at?: string
          id?: string
          motivo_recusa?: string | null
          produto_id: string
          quantidade_atendida?: number
          quantidade_solicitada?: number
          recusado_em?: string | null
          recusado_por?: string | null
          requisicao_id: string
          saldo_snapshot?: number
          status?: string
          unidade?: string
        }
        Update: {
          atendido_em?: string | null
          atendido_por?: string | null
          company_id?: string
          created_at?: string
          id?: string
          motivo_recusa?: string | null
          produto_id?: string
          quantidade_atendida?: number
          quantidade_solicitada?: number
          recusado_em?: string | null
          recusado_por?: string | null
          requisicao_id?: string
          saldo_snapshot?: number
          status?: string
          unidade?: string
        }
        Relationships: [
          {
            foreignKeyName: "requisicao_estoque_itens_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stabilization_requisicao_itens_produto_tenant_fk"
            columns: ["company_id", "produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "stabilization_requisicao_itens_requisicao_tenant_fk"
            columns: ["company_id", "requisicao_id"]
            isOneToOne: false
            referencedRelation: "requisicoes_estoque"
            referencedColumns: ["company_id", "id"]
          },
        ]
      }
      requisicoes_estoque: {
        Row: {
          atendido_em: string | null
          atendido_por: string | null
          ativo: boolean
          company_id: string
          confirmado_pelo_solicitante_em: string | null
          confirmado_pelo_solicitante_por: string | null
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          id: string
          observacao: string | null
          setor: string
          solicitante_user_id: string
          status: string
          updated_at: string
        }
        Insert: {
          atendido_em?: string | null
          atendido_por?: string | null
          ativo?: boolean
          company_id?: string
          confirmado_pelo_solicitante_em?: string | null
          confirmado_pelo_solicitante_por?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          observacao?: string | null
          setor: string
          solicitante_user_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          atendido_em?: string | null
          atendido_por?: string | null
          ativo?: boolean
          company_id?: string
          confirmado_pelo_solicitante_em?: string | null
          confirmado_pelo_solicitante_por?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          observacao?: string | null
          setor?: string
          solicitante_user_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "requisicoes_estoque_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      rh_audit_log: {
        Row: {
          acao: string
          antes: Json | null
          company_id: string
          created_at: string
          depois: Json | null
          entidade: string
          entidade_id: string | null
          id: string
          motivo: string | null
          user_id: string
        }
        Insert: {
          acao: string
          antes?: Json | null
          company_id?: string
          created_at?: string
          depois?: Json | null
          entidade: string
          entidade_id?: string | null
          id?: string
          motivo?: string | null
          user_id: string
        }
        Update: {
          acao?: string
          antes?: Json | null
          company_id?: string
          created_at?: string
          depois?: Json | null
          entidade?: string
          entidade_id?: string | null
          id?: string
          motivo?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rh_audit_log_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      rh_banco_horas: {
        Row: {
          atrasos_min: number
          banco_horas_saldo: number
          calculado_em: string
          calculado_por: string | null
          colaborador_id: string
          company_id: string
          created_at: string
          dias_trabalhados: number
          faltas: number
          horas_escaladas: number
          horas_extras: number
          horas_trabalhadas: number
          id: string
          observacoes: string | null
          periodo: string
          updated_at: string
        }
        Insert: {
          atrasos_min?: number
          banco_horas_saldo?: number
          calculado_em?: string
          calculado_por?: string | null
          colaborador_id: string
          company_id?: string
          created_at?: string
          dias_trabalhados?: number
          faltas?: number
          horas_escaladas?: number
          horas_extras?: number
          horas_trabalhadas?: number
          id?: string
          observacoes?: string | null
          periodo: string
          updated_at?: string
        }
        Update: {
          atrasos_min?: number
          banco_horas_saldo?: number
          calculado_em?: string
          calculado_por?: string | null
          colaborador_id?: string
          company_id?: string
          created_at?: string
          dias_trabalhados?: number
          faltas?: number
          horas_escaladas?: number
          horas_extras?: number
          horas_trabalhadas?: number
          id?: string
          observacoes?: string | null
          periodo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rh_banco_horas_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "rh_colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_banco_horas_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      rh_beneficios: {
        Row: {
          colaborador_id: string
          company_id: string
          created_at: string
          created_by: string | null
          data_fim: string | null
          data_inicio: string
          descricao: string | null
          elegivel: boolean
          id: string
          nome: string
          numero_cartao: string | null
          numero_cartao_last4: string | null
          observacoes: string | null
          operadora: string | null
          percentual_desconto: number
          status: string
          tipo: string
          updated_at: string
          valor_colaborador: number
          valor_empresa: number
        }
        Insert: {
          colaborador_id: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          data_fim?: string | null
          data_inicio?: string
          descricao?: string | null
          elegivel?: boolean
          id?: string
          nome?: string
          numero_cartao?: string | null
          numero_cartao_last4?: string | null
          observacoes?: string | null
          operadora?: string | null
          percentual_desconto?: number
          status?: string
          tipo?: string
          updated_at?: string
          valor_colaborador?: number
          valor_empresa?: number
        }
        Update: {
          colaborador_id?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          data_fim?: string | null
          data_inicio?: string
          descricao?: string | null
          elegivel?: boolean
          id?: string
          nome?: string
          numero_cartao?: string | null
          numero_cartao_last4?: string | null
          observacoes?: string | null
          operadora?: string | null
          percentual_desconto?: number
          status?: string
          tipo?: string
          updated_at?: string
          valor_colaborador?: number
          valor_empresa?: number
        }
        Relationships: [
          {
            foreignKeyName: "rh_beneficios_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "rh_colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_beneficios_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      rh_colaboradores: {
        Row: {
          adicional_noturno_percent: number | null
          carga_horaria_semanal: number
          cargo: string
          company_id: string
          cpf: string | null
          created_at: string
          created_by: string | null
          data_admissao: string
          email: string | null
          foto_url: string | null
          funcao: string
          funcoes_habilitadas: string[] | null
          id: string
          nome: string
          observacoes: string | null
          salario: number | null
          setor: string
          status: string
          telefone: string | null
          tipo_contrato: string
          unidade: string | null
          updated_at: string
          user_id: string | null
          valor_hora: number | null
        }
        Insert: {
          adicional_noturno_percent?: number | null
          carga_horaria_semanal?: number
          cargo?: string
          company_id?: string
          cpf?: string | null
          created_at?: string
          created_by?: string | null
          data_admissao?: string
          email?: string | null
          foto_url?: string | null
          funcao?: string
          funcoes_habilitadas?: string[] | null
          id?: string
          nome: string
          observacoes?: string | null
          salario?: number | null
          setor?: string
          status?: string
          telefone?: string | null
          tipo_contrato?: string
          unidade?: string | null
          updated_at?: string
          user_id?: string | null
          valor_hora?: number | null
        }
        Update: {
          adicional_noturno_percent?: number | null
          carga_horaria_semanal?: number
          cargo?: string
          company_id?: string
          cpf?: string | null
          created_at?: string
          created_by?: string | null
          data_admissao?: string
          email?: string | null
          foto_url?: string | null
          funcao?: string
          funcoes_habilitadas?: string[] | null
          id?: string
          nome?: string
          observacoes?: string | null
          salario?: number | null
          setor?: string
          status?: string
          telefone?: string | null
          tipo_contrato?: string
          unidade?: string | null
          updated_at?: string
          user_id?: string | null
          valor_hora?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "rh_colaboradores_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      rh_comunicados: {
        Row: {
          ativo: boolean
          autor_id: string | null
          autor_nome: string | null
          company_id: string
          conteudo: string
          created_at: string
          data_expiracao: string | null
          fixado: boolean
          id: string
          prioridade: string
          setores_alvo: string[] | null
          tipo: string
          titulo: string
          updated_at: string
          visualizacoes: number
        }
        Insert: {
          ativo?: boolean
          autor_id?: string | null
          autor_nome?: string | null
          company_id?: string
          conteudo?: string
          created_at?: string
          data_expiracao?: string | null
          fixado?: boolean
          id?: string
          prioridade?: string
          setores_alvo?: string[] | null
          tipo?: string
          titulo?: string
          updated_at?: string
          visualizacoes?: number
        }
        Update: {
          ativo?: boolean
          autor_id?: string | null
          autor_nome?: string | null
          company_id?: string
          conteudo?: string
          created_at?: string
          data_expiracao?: string | null
          fixado?: boolean
          id?: string
          prioridade?: string
          setores_alvo?: string[] | null
          tipo?: string
          titulo?: string
          updated_at?: string
          visualizacoes?: number
        }
        Relationships: [
          {
            foreignKeyName: "rh_comunicados_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      rh_custos_mensais: {
        Row: {
          calculado_em: string
          calculado_por: string | null
          company_id: string
          created_at: string
          custo_medio_colaborador: number
          detalhamento: Json | null
          id: string
          observacoes: string | null
          periodo: string
          qtd_colaboradores: number
          total_beneficios: number
          total_encargos: number
          total_geral: number
          total_horas_extras: number
          total_insalubridade: number
          total_noturno: number
          total_salarios: number
          updated_at: string
        }
        Insert: {
          calculado_em?: string
          calculado_por?: string | null
          company_id?: string
          created_at?: string
          custo_medio_colaborador?: number
          detalhamento?: Json | null
          id?: string
          observacoes?: string | null
          periodo: string
          qtd_colaboradores?: number
          total_beneficios?: number
          total_encargos?: number
          total_geral?: number
          total_horas_extras?: number
          total_insalubridade?: number
          total_noturno?: number
          total_salarios?: number
          updated_at?: string
        }
        Update: {
          calculado_em?: string
          calculado_por?: string | null
          company_id?: string
          created_at?: string
          custo_medio_colaborador?: number
          detalhamento?: Json | null
          id?: string
          observacoes?: string | null
          periodo?: string
          qtd_colaboradores?: number
          total_beneficios?: number
          total_encargos?: number
          total_geral?: number
          total_horas_extras?: number
          total_insalubridade?: number
          total_noturno?: number
          total_salarios?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rh_custos_mensais_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      rh_disponibilidade: {
        Row: {
          colaborador_id: string
          company_id: string
          created_at: string
          dia_semana: number
          disponivel: boolean
          hora_fim: string | null
          hora_inicio: string | null
          id: string
          observacao: string | null
        }
        Insert: {
          colaborador_id: string
          company_id?: string
          created_at?: string
          dia_semana: number
          disponivel?: boolean
          hora_fim?: string | null
          hora_inicio?: string | null
          id?: string
          observacao?: string | null
        }
        Update: {
          colaborador_id?: string
          company_id?: string
          created_at?: string
          dia_semana?: number
          disponivel?: boolean
          hora_fim?: string | null
          hora_inicio?: string | null
          id?: string
          observacao?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rh_disponibilidade_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "rh_colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_disponibilidade_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      rh_documentos: {
        Row: {
          alertar_vencimento: boolean
          arquivo_nome: string | null
          arquivo_path: string | null
          arquivo_tamanho: number | null
          colaborador_id: string
          company_id: string
          created_at: string
          data_emissao: string | null
          data_vencimento: string | null
          descricao: string | null
          dias_alerta_antes: number
          id: string
          nome: string
          obrigatorio: boolean
          status: string
          storage_state: string
          tipo: string
          updated_at: string
          uploaded_by: string
        }
        Insert: {
          alertar_vencimento?: boolean
          arquivo_nome?: string | null
          arquivo_path?: string | null
          arquivo_tamanho?: number | null
          colaborador_id: string
          company_id?: string
          created_at?: string
          data_emissao?: string | null
          data_vencimento?: string | null
          descricao?: string | null
          dias_alerta_antes?: number
          id?: string
          nome: string
          obrigatorio?: boolean
          status?: string
          storage_state?: string
          tipo?: string
          updated_at?: string
          uploaded_by: string
        }
        Update: {
          alertar_vencimento?: boolean
          arquivo_nome?: string | null
          arquivo_path?: string | null
          arquivo_tamanho?: number | null
          colaborador_id?: string
          company_id?: string
          created_at?: string
          data_emissao?: string | null
          data_vencimento?: string | null
          descricao?: string | null
          dias_alerta_antes?: number
          id?: string
          nome?: string
          obrigatorio?: boolean
          status?: string
          storage_state?: string
          tipo?: string
          updated_at?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "rh_documentos_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "rh_colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_documentos_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      rh_epis: {
        Row: {
          assinatura_colaborador: boolean
          ca_numero: string | null
          colaborador_id: string
          company_id: string
          created_at: string
          created_by: string | null
          data_entrega: string
          data_validade: string | null
          id: string
          nome: string
          observacoes: string | null
          quantidade: number
          status: string
          tipo: string
          updated_at: string
        }
        Insert: {
          assinatura_colaborador?: boolean
          ca_numero?: string | null
          colaborador_id: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          data_entrega?: string
          data_validade?: string | null
          id?: string
          nome?: string
          observacoes?: string | null
          quantidade?: number
          status?: string
          tipo?: string
          updated_at?: string
        }
        Update: {
          assinatura_colaborador?: boolean
          ca_numero?: string | null
          colaborador_id?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          data_entrega?: string
          data_validade?: string | null
          id?: string
          nome?: string
          observacoes?: string | null
          quantidade?: number
          status?: string
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rh_epis_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "rh_colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_epis_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      rh_escala_slots: {
        Row: {
          colaborador_id: string
          company_id: string
          created_at: string
          dia: string
          escala_id: string
          funcao: string | null
          hora_fim: string
          hora_inicio: string
          id: string
          observacao: string | null
          tipo: string
        }
        Insert: {
          colaborador_id: string
          company_id?: string
          created_at?: string
          dia: string
          escala_id: string
          funcao?: string | null
          hora_fim: string
          hora_inicio: string
          id?: string
          observacao?: string | null
          tipo?: string
        }
        Update: {
          colaborador_id?: string
          company_id?: string
          created_at?: string
          dia?: string
          escala_id?: string
          funcao?: string | null
          hora_fim?: string
          hora_inicio?: string
          id?: string
          observacao?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "rh_escala_slots_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "rh_colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_escala_slots_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_escala_slots_escala_id_fkey"
            columns: ["escala_id"]
            isOneToOne: false
            referencedRelation: "rh_escalas"
            referencedColumns: ["id"]
          },
        ]
      }
      rh_escalas: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          custo_projetado: number | null
          id: string
          observacoes: string | null
          publicada_em: string | null
          publicada_por: string | null
          semana_inicio: string
          setor: string
          status: string
          updated_at: string
        }
        Insert: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          custo_projetado?: number | null
          id?: string
          observacoes?: string | null
          publicada_em?: string | null
          publicada_por?: string | null
          semana_inicio: string
          setor?: string
          status?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          custo_projetado?: number | null
          id?: string
          observacoes?: string | null
          publicada_em?: string | null
          publicada_por?: string | null
          semana_inicio?: string
          setor?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rh_escalas_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      rh_exames: {
        Row: {
          arquivo_path: string | null
          clinica: string | null
          colaborador_id: string
          company_id: string
          created_at: string
          created_by: string | null
          crm: string | null
          data_realizacao: string | null
          data_vencimento: string | null
          descricao: string | null
          id: string
          medico: string | null
          observacoes: string | null
          resultado: string | null
          status: string
          tipo: string
          updated_at: string
        }
        Insert: {
          arquivo_path?: string | null
          clinica?: string | null
          colaborador_id: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          crm?: string | null
          data_realizacao?: string | null
          data_vencimento?: string | null
          descricao?: string | null
          id?: string
          medico?: string | null
          observacoes?: string | null
          resultado?: string | null
          status?: string
          tipo?: string
          updated_at?: string
        }
        Update: {
          arquivo_path?: string | null
          clinica?: string | null
          colaborador_id?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          crm?: string | null
          data_realizacao?: string | null
          data_vencimento?: string | null
          descricao?: string | null
          id?: string
          medico?: string | null
          observacoes?: string | null
          resultado?: string | null
          status?: string
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rh_exames_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "rh_colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_exames_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      rh_ferias_afastamentos: {
        Row: {
          aprovado_em: string | null
          aprovado_por: string | null
          colaborador_id: string
          company_id: string
          created_at: string
          data_fim: string
          data_inicio: string
          dias_uteis: number
          documento_url: string | null
          id: string
          motivo: string | null
          observacoes: string | null
          solicitado_por: string
          status: string
          tipo: string
          updated_at: string
        }
        Insert: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          colaborador_id: string
          company_id?: string
          created_at?: string
          data_fim: string
          data_inicio: string
          dias_uteis?: number
          documento_url?: string | null
          id?: string
          motivo?: string | null
          observacoes?: string | null
          solicitado_por: string
          status?: string
          tipo?: string
          updated_at?: string
        }
        Update: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          colaborador_id?: string
          company_id?: string
          created_at?: string
          data_fim?: string
          data_inicio?: string
          dias_uteis?: number
          documento_url?: string | null
          id?: string
          motivo?: string | null
          observacoes?: string | null
          solicitado_por?: string
          status?: string
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rh_ferias_afastamentos_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "rh_colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_ferias_afastamentos_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      rh_ferias_saldo: {
        Row: {
          colaborador_id: string
          company_id: string
          created_at: string
          dias_direito: number
          dias_gozados: number
          dias_restantes: number
          dias_vendidos: number
          id: string
          periodo_aquisitivo: string
          updated_at: string
          vencimento: string
        }
        Insert: {
          colaborador_id: string
          company_id?: string
          created_at?: string
          dias_direito?: number
          dias_gozados?: number
          dias_restantes?: number
          dias_vendidos?: number
          id?: string
          periodo_aquisitivo: string
          updated_at?: string
          vencimento: string
        }
        Update: {
          colaborador_id?: string
          company_id?: string
          created_at?: string
          dias_direito?: number
          dias_gozados?: number
          dias_restantes?: number
          dias_vendidos?: number
          id?: string
          periodo_aquisitivo?: string
          updated_at?: string
          vencimento?: string
        }
        Relationships: [
          {
            foreignKeyName: "rh_ferias_saldo_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "rh_colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_ferias_saldo_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      rh_folha_pagamento: {
        Row: {
          adicional_insalubridade: number
          adicional_noturno: number
          adicional_periculosidade: number
          aprovado_em: string | null
          aprovado_por: string | null
          atrasos_min: number
          calculado_em: string | null
          calculado_por: string | null
          colaborador_id: string
          company_id: string
          created_at: string
          desconto_atrasos: number
          desconto_faltas: number
          desconto_inss: number
          desconto_irrf: number
          desconto_vale_refeicao: number
          desconto_vale_transporte: number
          dias_trabalhados: number
          faltas: number
          gratificacoes: number
          horas_extras_100: number
          horas_extras_50: number
          horas_normais: number
          id: string
          observacoes: string | null
          outros_descontos: number
          periodo: string
          salario_base: number
          salario_liquido: number
          status: string
          total_descontos: number
          total_proventos: number
          updated_at: string
          valor_hora: number
        }
        Insert: {
          adicional_insalubridade?: number
          adicional_noturno?: number
          adicional_periculosidade?: number
          aprovado_em?: string | null
          aprovado_por?: string | null
          atrasos_min?: number
          calculado_em?: string | null
          calculado_por?: string | null
          colaborador_id: string
          company_id?: string
          created_at?: string
          desconto_atrasos?: number
          desconto_faltas?: number
          desconto_inss?: number
          desconto_irrf?: number
          desconto_vale_refeicao?: number
          desconto_vale_transporte?: number
          dias_trabalhados?: number
          faltas?: number
          gratificacoes?: number
          horas_extras_100?: number
          horas_extras_50?: number
          horas_normais?: number
          id?: string
          observacoes?: string | null
          outros_descontos?: number
          periodo: string
          salario_base?: number
          salario_liquido?: number
          status?: string
          total_descontos?: number
          total_proventos?: number
          updated_at?: string
          valor_hora?: number
        }
        Update: {
          adicional_insalubridade?: number
          adicional_noturno?: number
          adicional_periculosidade?: number
          aprovado_em?: string | null
          aprovado_por?: string | null
          atrasos_min?: number
          calculado_em?: string | null
          calculado_por?: string | null
          colaborador_id?: string
          company_id?: string
          created_at?: string
          desconto_atrasos?: number
          desconto_faltas?: number
          desconto_inss?: number
          desconto_irrf?: number
          desconto_vale_refeicao?: number
          desconto_vale_transporte?: number
          dias_trabalhados?: number
          faltas?: number
          gratificacoes?: number
          horas_extras_100?: number
          horas_extras_50?: number
          horas_normais?: number
          id?: string
          observacoes?: string | null
          outros_descontos?: number
          periodo?: string
          salario_base?: number
          salario_liquido?: number
          status?: string
          total_descontos?: number
          total_proventos?: number
          updated_at?: string
          valor_hora?: number
        }
        Relationships: [
          {
            foreignKeyName: "rh_folha_pagamento_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "rh_colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_folha_pagamento_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      rh_incidentes: {
        Row: {
          acao_corretiva: string | null
          acao_imediata: string | null
          afastamento_dias: number
          cat_emitida: boolean
          cat_numero: string | null
          causa_provavel: string | null
          colaborador_id: string | null
          company_id: string
          created_at: string
          created_by: string | null
          data_ocorrencia: string
          descricao: string
          encerrado_em: string | null
          encerrado_por: string | null
          gravidade: string
          hora_ocorrencia: string | null
          id: string
          local: string | null
          observacoes: string | null
          status: string
          testemunhas: string | null
          tipo: string
          updated_at: string
        }
        Insert: {
          acao_corretiva?: string | null
          acao_imediata?: string | null
          afastamento_dias?: number
          cat_emitida?: boolean
          cat_numero?: string | null
          causa_provavel?: string | null
          colaborador_id?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          data_ocorrencia?: string
          descricao?: string
          encerrado_em?: string | null
          encerrado_por?: string | null
          gravidade?: string
          hora_ocorrencia?: string | null
          id?: string
          local?: string | null
          observacoes?: string | null
          status?: string
          testemunhas?: string | null
          tipo?: string
          updated_at?: string
        }
        Update: {
          acao_corretiva?: string | null
          acao_imediata?: string | null
          afastamento_dias?: number
          cat_emitida?: boolean
          cat_numero?: string | null
          causa_provavel?: string | null
          colaborador_id?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          data_ocorrencia?: string
          descricao?: string
          encerrado_em?: string | null
          encerrado_por?: string | null
          gravidade?: string
          hora_ocorrencia?: string | null
          id?: string
          local?: string | null
          observacoes?: string | null
          status?: string
          testemunhas?: string | null
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rh_incidentes_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "rh_colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_incidentes_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      rh_ocorrencias_disciplinares: {
        Row: {
          aplicado_por: string
          aplicado_por_nome: string | null
          assinatura_colaborador: boolean
          assinatura_gestor: boolean
          colaborador_id: string
          company_id: string
          created_at: string
          data_ocorrencia: string
          descricao: string
          documento_path: string | null
          gravidade: string
          id: string
          motivo: string
          observacoes: string | null
          revogado_em: string | null
          revogado_motivo: string | null
          revogado_por: string | null
          status: string
          testemunhas: string | null
          tipo: string
          updated_at: string
        }
        Insert: {
          aplicado_por: string
          aplicado_por_nome?: string | null
          assinatura_colaborador?: boolean
          assinatura_gestor?: boolean
          colaborador_id: string
          company_id?: string
          created_at?: string
          data_ocorrencia?: string
          descricao?: string
          documento_path?: string | null
          gravidade?: string
          id?: string
          motivo?: string
          observacoes?: string | null
          revogado_em?: string | null
          revogado_motivo?: string | null
          revogado_por?: string | null
          status?: string
          testemunhas?: string | null
          tipo?: string
          updated_at?: string
        }
        Update: {
          aplicado_por?: string
          aplicado_por_nome?: string | null
          assinatura_colaborador?: boolean
          assinatura_gestor?: boolean
          colaborador_id?: string
          company_id?: string
          created_at?: string
          data_ocorrencia?: string
          descricao?: string
          documento_path?: string | null
          gravidade?: string
          id?: string
          motivo?: string
          observacoes?: string | null
          revogado_em?: string | null
          revogado_motivo?: string | null
          revogado_por?: string | null
          status?: string
          testemunhas?: string | null
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rh_ocorrencias_disciplinares_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "rh_colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_ocorrencias_disciplinares_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      rh_onboarding: {
        Row: {
          avaliacao_30: Json | null
          avaliacao_60: Json | null
          avaliacao_90: Json | null
          checklist_30dias: Json | null
          checklist_60dias: Json | null
          checklist_90dias: Json | null
          checklist_admissao: Json | null
          colaborador_id: string
          company_id: string
          concluido_em: string | null
          created_at: string
          criado_por: string
          fase_atual: string
          id: string
          mentor_id: string | null
          observacoes: string | null
          status: string
          titulo: string
          updated_at: string
        }
        Insert: {
          avaliacao_30?: Json | null
          avaliacao_60?: Json | null
          avaliacao_90?: Json | null
          checklist_30dias?: Json | null
          checklist_60dias?: Json | null
          checklist_90dias?: Json | null
          checklist_admissao?: Json | null
          colaborador_id: string
          company_id?: string
          concluido_em?: string | null
          created_at?: string
          criado_por: string
          fase_atual?: string
          id?: string
          mentor_id?: string | null
          observacoes?: string | null
          status?: string
          titulo?: string
          updated_at?: string
        }
        Update: {
          avaliacao_30?: Json | null
          avaliacao_60?: Json | null
          avaliacao_90?: Json | null
          checklist_30dias?: Json | null
          checklist_60dias?: Json | null
          checklist_90dias?: Json | null
          checklist_admissao?: Json | null
          colaborador_id?: string
          company_id?: string
          concluido_em?: string | null
          created_at?: string
          criado_por?: string
          fase_atual?: string
          id?: string
          mentor_id?: string | null
          observacoes?: string | null
          status?: string
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rh_onboarding_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "rh_colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_onboarding_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_onboarding_mentor_id_fkey"
            columns: ["mentor_id"]
            isOneToOne: false
            referencedRelation: "rh_colaboradores"
            referencedColumns: ["id"]
          },
        ]
      }
      rh_ponto_ajustes: {
        Row: {
          ajustado_por: string
          campo_alterado: string
          company_id: string
          created_at: string
          id: string
          motivo: string
          ponto_id: string
          valor_anterior: string | null
          valor_novo: string | null
        }
        Insert: {
          ajustado_por: string
          campo_alterado: string
          company_id?: string
          created_at?: string
          id?: string
          motivo: string
          ponto_id: string
          valor_anterior?: string | null
          valor_novo?: string | null
        }
        Update: {
          ajustado_por?: string
          campo_alterado?: string
          company_id?: string
          created_at?: string
          id?: string
          motivo?: string
          ponto_id?: string
          valor_anterior?: string | null
          valor_novo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rh_ponto_ajustes_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_ponto_ajustes_ponto_id_fkey"
            columns: ["ponto_id"]
            isOneToOne: false
            referencedRelation: "rh_ponto_registros"
            referencedColumns: ["id"]
          },
        ]
      }
      rh_ponto_registros: {
        Row: {
          aprovado: boolean | null
          aprovado_em: string | null
          aprovado_por: string | null
          client_request_id: string | null
          colaborador_id: string
          company_id: string
          created_at: string
          created_by: string | null
          data: string
          foto_url: string | null
          geo_lat: number | null
          geo_lng: number | null
          hora: string
          id: string
          justificativa: string | null
          metodo: string
          motivo_rejeicao: string | null
          rejeitado_em: string | null
          rejeitado_por: string | null
          status: string
          tipo: string
          updated_at: string
        }
        Insert: {
          aprovado?: boolean | null
          aprovado_em?: string | null
          aprovado_por?: string | null
          client_request_id?: string | null
          colaborador_id: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          data?: string
          foto_url?: string | null
          geo_lat?: number | null
          geo_lng?: number | null
          hora?: string
          id?: string
          justificativa?: string | null
          metodo?: string
          motivo_rejeicao?: string | null
          rejeitado_em?: string | null
          rejeitado_por?: string | null
          status?: string
          tipo: string
          updated_at?: string
        }
        Update: {
          aprovado?: boolean | null
          aprovado_em?: string | null
          aprovado_por?: string | null
          client_request_id?: string | null
          colaborador_id?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          data?: string
          foto_url?: string | null
          geo_lat?: number | null
          geo_lng?: number | null
          hora?: string
          id?: string
          justificativa?: string | null
          metodo?: string
          motivo_rejeicao?: string | null
          rejeitado_em?: string | null
          rejeitado_por?: string | null
          status?: string
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rh_ponto_registros_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "rh_colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_ponto_registros_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      rh_progresso_treinamento: {
        Row: {
          certificado_emitido: boolean | null
          colaborador_id: string
          company_id: string
          concluido_em: string | null
          created_at: string
          id: string
          modulos_concluidos: Json | null
          nota_final: number | null
          status: string
          trilha_id: string
          updated_at: string
        }
        Insert: {
          certificado_emitido?: boolean | null
          colaborador_id: string
          company_id?: string
          concluido_em?: string | null
          created_at?: string
          id?: string
          modulos_concluidos?: Json | null
          nota_final?: number | null
          status?: string
          trilha_id: string
          updated_at?: string
        }
        Update: {
          certificado_emitido?: boolean | null
          colaborador_id?: string
          company_id?: string
          concluido_em?: string | null
          created_at?: string
          id?: string
          modulos_concluidos?: Json | null
          nota_final?: number | null
          status?: string
          trilha_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rh_progresso_treinamento_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "rh_colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_progresso_treinamento_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_progresso_treinamento_trilha_id_fkey"
            columns: ["trilha_id"]
            isOneToOne: false
            referencedRelation: "rh_trilhas_treinamento"
            referencedColumns: ["id"]
          },
        ]
      }
      rh_tarefas: {
        Row: {
          checklist: Json | null
          company_id: string
          concluida_em: string | null
          concluida_por: string | null
          created_at: string
          criado_por: string
          descricao: string | null
          evidencia_url: string | null
          id: string
          observacoes: string | null
          prazo: string | null
          prioridade: string
          recorrencia: string | null
          responsavel_id: string | null
          setor: string
          status: string
          titulo: string
          updated_at: string
        }
        Insert: {
          checklist?: Json | null
          company_id?: string
          concluida_em?: string | null
          concluida_por?: string | null
          created_at?: string
          criado_por: string
          descricao?: string | null
          evidencia_url?: string | null
          id?: string
          observacoes?: string | null
          prazo?: string | null
          prioridade?: string
          recorrencia?: string | null
          responsavel_id?: string | null
          setor?: string
          status?: string
          titulo: string
          updated_at?: string
        }
        Update: {
          checklist?: Json | null
          company_id?: string
          concluida_em?: string | null
          concluida_por?: string | null
          created_at?: string
          criado_por?: string
          descricao?: string | null
          evidencia_url?: string | null
          id?: string
          observacoes?: string | null
          prazo?: string | null
          prioridade?: string
          recorrencia?: string | null
          responsavel_id?: string | null
          setor?: string
          status?: string
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rh_tarefas_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_tarefas_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "rh_colaboradores"
            referencedColumns: ["id"]
          },
        ]
      }
      rh_trilhas_treinamento: {
        Row: {
          ativo: boolean
          carga_horaria_min: number | null
          company_id: string
          created_at: string
          criado_por: string
          descricao: string | null
          id: string
          modulos: Json | null
          obrigatoria: boolean
          setor: string
          titulo: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          carga_horaria_min?: number | null
          company_id?: string
          created_at?: string
          criado_por: string
          descricao?: string | null
          id?: string
          modulos?: Json | null
          obrigatoria?: boolean
          setor?: string
          titulo: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          carga_horaria_min?: number | null
          company_id?: string
          created_at?: string
          criado_por?: string
          descricao?: string | null
          id?: string
          modulos?: Json | null
          obrigatoria?: boolean
          setor?: string
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rh_trilhas_treinamento_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      rh_trocas_turno: {
        Row: {
          aprovado_em: string | null
          aprovado_por: string | null
          company_id: string
          created_at: string
          id: string
          motivo: string
          slot_original_id: string
          solicitante_id: string
          status: string
          substituto_id: string | null
        }
        Insert: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          company_id?: string
          created_at?: string
          id?: string
          motivo: string
          slot_original_id: string
          solicitante_id: string
          status?: string
          substituto_id?: string | null
        }
        Update: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          company_id?: string
          created_at?: string
          id?: string
          motivo?: string
          slot_original_id?: string
          solicitante_id?: string
          status?: string
          substituto_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rh_trocas_turno_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_trocas_turno_slot_original_id_fkey"
            columns: ["slot_original_id"]
            isOneToOne: false
            referencedRelation: "rh_escala_slots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_trocas_turno_solicitante_id_fkey"
            columns: ["solicitante_id"]
            isOneToOne: false
            referencedRelation: "rh_colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_trocas_turno_substituto_id_fkey"
            columns: ["substituto_id"]
            isOneToOne: false
            referencedRelation: "rh_colaboradores"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          id: string
          permission_key: string
          role: string
        }
        Insert: {
          id?: string
          permission_key: string
          role: string
        }
        Update: {
          id?: string
          permission_key?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_key_fkey"
            columns: ["permission_key"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["key"]
          },
        ]
      }
      salmon_auditorias_compra: {
        Row: {
          company_id: string
          created_at: string
          created_by: string
          data_entrada: string
          entrada_id: string
          fornecedor: string
          id: string
          mes_ano: string
          override_alerta: boolean
          override_at: string | null
          override_motivo: string
          override_tipo: string[]
          override_user: string
          status_meta_no_momento: string
          status_projecao_no_momento: string
          status_semana_no_momento: string
          valor_total: number
        }
        Insert: {
          company_id?: string
          created_at?: string
          created_by?: string
          data_entrada: string
          entrada_id: string
          fornecedor?: string
          id?: string
          mes_ano: string
          override_alerta?: boolean
          override_at?: string | null
          override_motivo?: string
          override_tipo?: string[]
          override_user?: string
          status_meta_no_momento?: string
          status_projecao_no_momento?: string
          status_semana_no_momento?: string
          valor_total?: number
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string
          data_entrada?: string
          entrada_id?: string
          fornecedor?: string
          id?: string
          mes_ano?: string
          override_alerta?: boolean
          override_at?: string | null
          override_motivo?: string
          override_tipo?: string[]
          override_user?: string
          status_meta_no_momento?: string
          status_projecao_no_momento?: string
          status_semana_no_momento?: string
          valor_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "salmon_auditorias_compra_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      salmon_config: {
        Row: {
          company_id: string
          created_at: string
          expiration_alert_days: number
          expiration_days: number
          fifo_enabled: boolean
          id: string
          loss_percent_alert: number
          loss_value_alert: number
          min_clean_kg: number
          min_gross_kg: number
          stale_days_limit: number
          target_g_per_client: number
          updated_at: string
        }
        Insert: {
          company_id?: string
          created_at?: string
          expiration_alert_days?: number
          expiration_days?: number
          fifo_enabled?: boolean
          id?: string
          loss_percent_alert?: number
          loss_value_alert?: number
          min_clean_kg?: number
          min_gross_kg?: number
          stale_days_limit?: number
          target_g_per_client?: number
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          expiration_alert_days?: number
          expiration_days?: number
          fifo_enabled?: boolean
          id?: string
          loss_percent_alert?: number
          loss_value_alert?: number
          min_clean_kg?: number
          min_gross_kg?: number
          stale_days_limit?: number
          target_g_per_client?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "salmon_config_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      salmon_daily_records: {
        Row: {
          clients_count: number
          company_id: string
          created_at: string
          created_by: string
          id: string
          leftover_kg: number
          leftover_note: string | null
          notes: string | null
          record_date: string
          revenue: number
          updated_at: string
        }
        Insert: {
          clients_count?: number
          company_id?: string
          created_at?: string
          created_by?: string
          id?: string
          leftover_kg?: number
          leftover_note?: string | null
          notes?: string | null
          record_date: string
          revenue?: number
          updated_at?: string
        }
        Update: {
          clients_count?: number
          company_id?: string
          created_at?: string
          created_by?: string
          id?: string
          leftover_kg?: number
          leftover_note?: string | null
          notes?: string | null
          record_date?: string
          revenue?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "salmon_daily_records_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      salmon_daily_records_bkp_reset_20260301: {
        Row: {
          clients_count: number | null
          company_id: string | null
          created_at: string | null
          created_by: string | null
          id: string | null
          notes: string | null
          record_date: string | null
          revenue: number | null
          updated_at: string | null
        }
        Insert: {
          clients_count?: number | null
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string | null
          notes?: string | null
          record_date?: string | null
          revenue?: number | null
          updated_at?: string | null
        }
        Update: {
          clients_count?: number | null
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string | null
          notes?: string | null
          record_date?: string | null
          revenue?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      salmon_entries: {
        Row: {
          boxes: number
          company_id: string
          created_at: string
          created_by: string
          entry_date: string
          expiration_date: string | null
          gross_kg: number
          id: string
          lot: string
          notes: string | null
          sif: string
          status: string
          supplier_id: string | null
          supplier_name: string
          total_value: number
          unit_cost: number | null
          units: number
          updated_at: string
        }
        Insert: {
          boxes?: number
          company_id?: string
          created_at?: string
          created_by?: string
          entry_date?: string
          expiration_date?: string | null
          gross_kg: number
          id?: string
          lot?: string
          notes?: string | null
          sif?: string
          status?: string
          supplier_id?: string | null
          supplier_name?: string
          total_value?: number
          unit_cost?: number | null
          units?: number
          updated_at?: string
        }
        Update: {
          boxes?: number
          company_id?: string
          created_at?: string
          created_by?: string
          entry_date?: string
          expiration_date?: string | null
          gross_kg?: number
          id?: string
          lot?: string
          notes?: string | null
          sif?: string
          status?: string
          supplier_id?: string | null
          supplier_name?: string
          total_value?: number
          unit_cost?: number | null
          units?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "salmon_entries_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salmon_entries_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      salmon_entries_bkp_reset_20260301: {
        Row: {
          boxes: number | null
          company_id: string | null
          created_at: string | null
          created_by: string | null
          entry_date: string | null
          gross_kg: number | null
          id: string | null
          lot: string | null
          notes: string | null
          sif: string | null
          status: string | null
          supplier_id: string | null
          supplier_name: string | null
          total_value: number | null
          unit_cost: number | null
          units: number | null
          updated_at: string | null
        }
        Insert: {
          boxes?: number | null
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          entry_date?: string | null
          gross_kg?: number | null
          id?: string | null
          lot?: string | null
          notes?: string | null
          sif?: string | null
          status?: string | null
          supplier_id?: string | null
          supplier_name?: string | null
          total_value?: number | null
          unit_cost?: number | null
          units?: number | null
          updated_at?: string | null
        }
        Update: {
          boxes?: number | null
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          entry_date?: string | null
          gross_kg?: number | null
          id?: string | null
          lot?: string | null
          notes?: string | null
          sif?: string | null
          status?: string | null
          supplier_id?: string | null
          supplier_name?: string | null
          total_value?: number | null
          unit_cost?: number | null
          units?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      salmon_manipulations: {
        Row: {
          clean_in_kg: number
          company_id: string
          cost_per_kg_gross: number
          created_at: string
          created_by: string
          entry_id: string
          fish_count: number
          gross_out_kg: number
          id: string
          leftover_kg: number
          leftover_recorded: boolean
          loss_percent: number | null
          lot: string
          manipulation_date: string
          notes: string | null
          sif: string
          status: string
          supplier_name: string
          updated_at: string
          waste_kg: number | null
          yield_percent: number | null
        }
        Insert: {
          clean_in_kg?: number
          company_id?: string
          cost_per_kg_gross?: number
          created_at?: string
          created_by?: string
          entry_id: string
          fish_count?: number
          gross_out_kg: number
          id?: string
          leftover_kg?: number
          leftover_recorded?: boolean
          loss_percent?: number | null
          lot?: string
          manipulation_date?: string
          notes?: string | null
          sif?: string
          status?: string
          supplier_name?: string
          updated_at?: string
          waste_kg?: number | null
          yield_percent?: number | null
        }
        Update: {
          clean_in_kg?: number
          company_id?: string
          cost_per_kg_gross?: number
          created_at?: string
          created_by?: string
          entry_id?: string
          fish_count?: number
          gross_out_kg?: number
          id?: string
          leftover_kg?: number
          leftover_recorded?: boolean
          loss_percent?: number | null
          lot?: string
          manipulation_date?: string
          notes?: string | null
          sif?: string
          status?: string
          supplier_name?: string
          updated_at?: string
          waste_kg?: number | null
          yield_percent?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "salmon_manipulations_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salmon_manipulations_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "salmon_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      salmon_manipulations_bkp_reset_20260301: {
        Row: {
          clean_in_kg: number | null
          company_id: string | null
          cost_per_kg_gross: number | null
          created_at: string | null
          created_by: string | null
          entry_id: string | null
          fish_count: number | null
          gross_out_kg: number | null
          id: string | null
          leftover_kg: number | null
          leftover_recorded: boolean | null
          loss_percent: number | null
          lot: string | null
          manipulation_date: string | null
          notes: string | null
          sif: string | null
          status: string | null
          supplier_name: string | null
          updated_at: string | null
          waste_kg: number | null
          yield_percent: number | null
        }
        Insert: {
          clean_in_kg?: number | null
          company_id?: string | null
          cost_per_kg_gross?: number | null
          created_at?: string | null
          created_by?: string | null
          entry_id?: string | null
          fish_count?: number | null
          gross_out_kg?: number | null
          id?: string | null
          leftover_kg?: number | null
          leftover_recorded?: boolean | null
          loss_percent?: number | null
          lot?: string | null
          manipulation_date?: string | null
          notes?: string | null
          sif?: string | null
          status?: string | null
          supplier_name?: string | null
          updated_at?: string | null
          waste_kg?: number | null
          yield_percent?: number | null
        }
        Update: {
          clean_in_kg?: number | null
          company_id?: string | null
          cost_per_kg_gross?: number | null
          created_at?: string | null
          created_by?: string | null
          entry_id?: string | null
          fish_count?: number | null
          gross_out_kg?: number | null
          id?: string | null
          leftover_kg?: number | null
          leftover_recorded?: boolean | null
          loss_percent?: number | null
          lot?: string | null
          manipulation_date?: string | null
          notes?: string | null
          sif?: string | null
          status?: string | null
          supplier_name?: string | null
          updated_at?: string | null
          waste_kg?: number | null
          yield_percent?: number | null
        }
        Relationships: []
      }
      salmon_metas_provisionadas: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          mes_ano: string
          meta_gramas_por_cliente: number
          updated_at: string
        }
        Insert: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          mes_ano: string
          meta_gramas_por_cliente?: number
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          mes_ano?: string
          meta_gramas_por_cliente?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "salmon_metas_provisionadas_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      salmon_purchase_targets: {
        Row: {
          alert_red_pct: number
          alert_yellow_pct: number
          category: string
          company_id: string
          created_at: string
          created_by: string
          id: string
          month_num: number
          target_kg: number
          target_value: number
          updated_at: string
          year_num: number
        }
        Insert: {
          alert_red_pct?: number
          alert_yellow_pct?: number
          category?: string
          company_id?: string
          created_at?: string
          created_by?: string
          id?: string
          month_num: number
          target_kg?: number
          target_value?: number
          updated_at?: string
          year_num: number
        }
        Update: {
          alert_red_pct?: number
          alert_yellow_pct?: number
          category?: string
          company_id?: string
          created_at?: string
          created_by?: string
          id?: string
          month_num?: number
          target_kg?: number
          target_value?: number
          updated_at?: string
          year_num?: number
        }
        Relationships: [
          {
            foreignKeyName: "salmon_purchase_targets_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      security_risk_register: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          description: string
          id: string
          mitigation: string
          title: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          description: string
          id?: string
          mitigation: string
          title: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          description?: string
          id?: string
          mitigation?: string
          title?: string
        }
        Relationships: []
      }
      solic_compra_mercado: {
        Row: {
          company_id: string
          created_at: string
          data_necessidade: string | null
          id: string
          observacoes: string | null
          prioridade: string
          responsavel_user_id: string | null
          solicitante_user_id: string | null
          status: string
          tipo: string
          titulo: string
          total_estimado: number
          total_real: number
          updated_at: string
        }
        Insert: {
          company_id?: string
          created_at?: string
          data_necessidade?: string | null
          id?: string
          observacoes?: string | null
          prioridade?: string
          responsavel_user_id?: string | null
          solicitante_user_id?: string | null
          status?: string
          tipo: string
          titulo: string
          total_estimado?: number
          total_real?: number
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          data_necessidade?: string | null
          id?: string
          observacoes?: string | null
          prioridade?: string
          responsavel_user_id?: string | null
          solicitante_user_id?: string | null
          status?: string
          tipo?: string
          titulo?: string
          total_estimado?: number
          total_real?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "solic_compra_mercado_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      solic_compra_mercado_bkp_reset_20260301: {
        Row: {
          company_id: string | null
          created_at: string | null
          data_necessidade: string | null
          id: string | null
          observacoes: string | null
          prioridade: string | null
          responsavel_user_id: string | null
          solicitante_user_id: string | null
          status: string | null
          tipo: string | null
          titulo: string | null
          total_estimado: number | null
          total_real: number | null
          updated_at: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          data_necessidade?: string | null
          id?: string | null
          observacoes?: string | null
          prioridade?: string | null
          responsavel_user_id?: string | null
          solicitante_user_id?: string | null
          status?: string | null
          tipo?: string | null
          titulo?: string | null
          total_estimado?: number | null
          total_real?: number | null
          updated_at?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          data_necessidade?: string | null
          id?: string | null
          observacoes?: string | null
          prioridade?: string | null
          responsavel_user_id?: string | null
          solicitante_user_id?: string | null
          status?: string | null
          tipo?: string | null
          titulo?: string | null
          total_estimado?: number | null
          total_real?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      solic_compra_mercado_item: {
        Row: {
          categoria: string | null
          company_id: string
          comprado: boolean
          comprado_em: string | null
          comprado_por: string | null
          created_at: string
          custo_nao_informado: boolean
          detalhes: string | null
          id: string
          preco_unitario: number | null
          produto_id: string | null
          produto_texto: string | null
          quantidade_comprada: number
          quantidade_solicitada: number
          solicitacao_id: string
          unidade_medida: string
        }
        Insert: {
          categoria?: string | null
          company_id?: string
          comprado?: boolean
          comprado_em?: string | null
          comprado_por?: string | null
          created_at?: string
          custo_nao_informado?: boolean
          detalhes?: string | null
          id?: string
          preco_unitario?: number | null
          produto_id?: string | null
          produto_texto?: string | null
          quantidade_comprada?: number
          quantidade_solicitada?: number
          solicitacao_id: string
          unidade_medida?: string
        }
        Update: {
          categoria?: string | null
          company_id?: string
          comprado?: boolean
          comprado_em?: string | null
          comprado_por?: string | null
          created_at?: string
          custo_nao_informado?: boolean
          detalhes?: string | null
          id?: string
          preco_unitario?: number | null
          produto_id?: string | null
          produto_texto?: string | null
          quantidade_comprada?: number
          quantidade_solicitada?: number
          solicitacao_id?: string
          unidade_medida?: string
        }
        Relationships: [
          {
            foreignKeyName: "solic_compra_mercado_item_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solic_compra_mercado_item_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "mv_giro_estoque"
            referencedColumns: ["produto_id"]
          },
          {
            foreignKeyName: "solic_compra_mercado_item_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solic_compra_mercado_item_solicitacao_id_fkey"
            columns: ["solicitacao_id"]
            isOneToOne: false
            referencedRelation: "solic_compra_mercado"
            referencedColumns: ["id"]
          },
        ]
      }
      solicitacoes_compra: {
        Row: {
          company_id: string
          created_at: string
          id: string
          motivo: string | null
          produto_id: string
          quantidade_solicitada: number
          requisicao_ref: string | null
          saldo_no_momento: number
          setor_solicitante: string
          solicitante_user_id: string
          status: string
          unidade: string
          updated_at: string
        }
        Insert: {
          company_id?: string
          created_at?: string
          id?: string
          motivo?: string | null
          produto_id: string
          quantidade_solicitada?: number
          requisicao_ref?: string | null
          saldo_no_momento?: number
          setor_solicitante: string
          solicitante_user_id: string
          status?: string
          unidade?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          motivo?: string | null
          produto_id?: string
          quantidade_solicitada?: number
          requisicao_ref?: string | null
          saldo_no_momento?: number
          setor_solicitante?: string
          solicitante_user_id?: string
          status?: string
          unidade?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "solicitacoes_compra_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitacoes_compra_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "mv_giro_estoque"
            referencedColumns: ["produto_id"]
          },
          {
            foreignKeyName: "solicitacoes_compra_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_categories: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_categories_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_locations: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          type: string | null
          updated_at: string
        }
        Insert: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          type?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_locations_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_sectors: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_sectors_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_sku_counter: {
        Row: {
          company_id: string
          id: string
          next_value: number
          pad_length: number
          prefix: string
          updated_at: string
        }
        Insert: {
          company_id?: string
          id?: string
          next_value?: number
          pad_length?: number
          prefix?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          id?: string
          next_value?: number
          pad_length?: number
          prefix?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_sku_counter_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_item_prices: {
        Row: {
          company_id: string
          id: string
          last_updated_at: string
          purchase_unit: string
          source: string
          stock_item_id: string
          supplier_id: string
          supplier_uuid: string | null
          unit_cost: number
        }
        Insert: {
          company_id?: string
          id?: string
          last_updated_at?: string
          purchase_unit?: string
          source?: string
          stock_item_id: string
          supplier_id: string
          supplier_uuid?: string | null
          unit_cost?: number
        }
        Update: {
          company_id?: string
          id?: string
          last_updated_at?: string
          purchase_unit?: string
          source?: string
          stock_item_id?: string
          supplier_id?: string
          supplier_uuid?: string | null
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "supplier_item_prices_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_item_prices_stock_item_id_fkey"
            columns: ["stock_item_id"]
            isOneToOne: false
            referencedRelation: "mv_giro_estoque"
            referencedColumns: ["produto_id"]
          },
          {
            foreignKeyName: "supplier_item_prices_stock_item_id_fkey"
            columns: ["stock_item_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_prices_product_tenant_fk"
            columns: ["stock_item_id", "company_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id", "company_id"]
          },
          {
            foreignKeyName: "supplier_prices_supplier_tenant_fk"
            columns: ["supplier_uuid", "company_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id", "company_id"]
          },
        ]
      }
      suppliers: {
        Row: {
          categories_served: string[]
          company_id: string
          contact_info: Json | null
          cotacao_notes: string | null
          created_at: string
          delivery_days: number | null
          id: string
          is_active: boolean
          minimum_order_quantity: number
          minimum_order_value: number
          name: string
          payment_terms: string | null
          updated_at: string
          whatsapp_number: string | null
        }
        Insert: {
          categories_served?: string[]
          company_id?: string
          contact_info?: Json | null
          cotacao_notes?: string | null
          created_at?: string
          delivery_days?: number | null
          id?: string
          is_active?: boolean
          minimum_order_quantity?: number
          minimum_order_value?: number
          name: string
          payment_terms?: string | null
          updated_at?: string
          whatsapp_number?: string | null
        }
        Update: {
          categories_served?: string[]
          company_id?: string
          contact_info?: Json | null
          cotacao_notes?: string | null
          created_at?: string
          delivery_days?: number | null
          id?: string
          is_active?: boolean
          minimum_order_quantity?: number
          minimum_order_value?: number
          name?: string
          payment_terms?: string | null
          updated_at?: string
          whatsapp_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers_bkp_reset_20260301: {
        Row: {
          company_id: string | null
          contact_info: Json | null
          created_at: string | null
          id: string | null
          is_active: boolean | null
          name: string | null
          updated_at: string | null
        }
        Insert: {
          company_id?: string | null
          contact_info?: Json | null
          created_at?: string | null
          id?: string | null
          is_active?: boolean | null
          name?: string | null
          updated_at?: string | null
        }
        Update: {
          company_id?: string | null
          contact_info?: Json | null
          created_at?: string | null
          id?: string | null
          is_active?: boolean | null
          name?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      system_bugs: {
        Row: {
          company_id: string
          created_at: string
          created_by: string
          description: string
          fixed_at: string | null
          id: string
          module: string
          notes: string | null
          severity: string
          status: string
          title: string
          updated_at: string
          validated_at: string | null
          validated_by: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by: string
          description?: string
          fixed_at?: string | null
          id?: string
          module: string
          notes?: string | null
          severity?: string
          status?: string
          title: string
          updated_at?: string
          validated_at?: string | null
          validated_by?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string
          description?: string
          fixed_at?: string | null
          id?: string
          module?: string
          notes?: string | null
          severity?: string
          status?: string
          title?: string
          updated_at?: string
          validated_at?: string | null
          validated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "system_bugs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      turnos: {
        Row: {
          ativo: boolean
          company_id: string
          created_at: string
          hora_fim: string
          hora_inicio: string
          id: string
          nome: string
        }
        Insert: {
          ativo?: boolean
          company_id?: string
          created_at?: string
          hora_fim: string
          hora_inicio: string
          id?: string
          nome: string
        }
        Update: {
          ativo?: boolean
          company_id?: string
          created_at?: string
          hora_fim?: string
          hora_inicio?: string
          id?: string
          nome?: string
        }
        Relationships: [
          {
            foreignKeyName: "turnos_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      unidades_medida: {
        Row: {
          ativo: boolean
          base_unit: string
          created_at: string
          fator_para_base: number
          id: string
          is_manual: boolean
          nome: string
          simbolo: string
          tipo: string
        }
        Insert: {
          ativo?: boolean
          base_unit: string
          created_at?: string
          fator_para_base?: number
          id?: string
          is_manual?: boolean
          nome: string
          simbolo: string
          tipo: string
        }
        Update: {
          ativo?: boolean
          base_unit?: string
          created_at?: string
          fator_para_base?: number
          id?: string
          is_manual?: boolean
          nome?: string
          simbolo?: string
          tipo?: string
        }
        Relationships: []
      }
      user_permissions: {
        Row: {
          company_id: string
          created_at: string
          effect: string
          granted_by: string | null
          id: string
          permission_key: string
          user_id: string
        }
        Insert: {
          company_id?: string
          created_at?: string
          effect?: string
          granted_by?: string | null
          id?: string
          permission_key: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          effect?: string
          granted_by?: string | null
          id?: string
          permission_key?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_permissions_membership_fk"
            columns: ["user_id", "company_id"]
            isOneToOne: false
            referencedRelation: "company_memberships"
            referencedColumns: ["user_id", "company_id"]
          },
          {
            foreignKeyName: "user_permissions_permission_key_fkey"
            columns: ["permission_key"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["key"]
          },
        ]
      }
      user_roles: {
        Row: {
          company_id: string
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          company_id?: string
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_membership_fk"
            columns: ["user_id", "company_id"]
            isOneToOne: false
            referencedRelation: "company_memberships"
            referencedColumns: ["user_id", "company_id"]
          },
        ]
      }
      z_canary_test: {
        Row: {
          checked_at: string | null
          id: number
        }
        Insert: {
          checked_at?: string | null
          id?: number
        }
        Update: {
          checked_at?: string | null
          id?: number
        }
        Relationships: []
      }
    }
    Views: {
      mv_consumo_itens_semana: {
        Row: {
          custo_total: number | null
          produto_id: string | null
          semana: string | null
          total_saida: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_mov_produto"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "mv_giro_estoque"
            referencedColumns: ["produto_id"]
          },
          {
            foreignKeyName: "fk_mov_produto"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      mv_fin_dre_mensal: {
        Row: {
          categoria_id: string | null
          mes: string | null
          qtd: number | null
          tipo: string | null
          total: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fin_lancamentos_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "fin_categorias"
            referencedColumns: ["id"]
          },
        ]
      }
      mv_fin_fluxo_caixa_diario: {
        Row: {
          conta_id: string | null
          dia: string | null
          tipo: string | null
          total: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fin_lancamentos_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "fin_contas"
            referencedColumns: ["id"]
          },
        ]
      }
      mv_giro_estoque: {
        Row: {
          categoria: string | null
          entradas: number | null
          nome_produto: string | null
          produto_id: string | null
          saidas: number | null
          saldo_atual: number | null
        }
        Relationships: []
      }
      mv_pedidos_status_resumo: {
        Row: {
          mes: string | null
          qtd: number | null
          status: string | null
          valor_total: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      _fin_bordero_payload: {
        Args: { p_company_id: string; p_end_inclusive: string; p_start: string }
        Returns: Json
      }
      _fin_dfc_effective_allocations: {
        Args: { p_company_id: string; p_end_inclusive: string; p_start: string }
        Returns: {
          allocation_id: string
          allocation_source: string
          categoria_id: string
          descricao: string
          effective_date: string
          entry_excluded_from_reports: boolean
          lancamento_id: string
          origem: string
          status: string
          tipo: string
          valor: number
        }[]
      }
      _guarded_add_presentation_decision_revision: {
        Args: {
          p_decision_id: string
          p_expected_status: string
          p_expected_updated_at: string
          p_reason: string
          p_reference_type: string
          p_snapshot: Json
        }
        Returns: Json
      }
      _guarded_aprovar_conta_pagar: {
        Args: { p_expected_updated_at: string; p_id: string }
        Returns: Json
      }
      _guarded_bulk_upsert_orcamento: {
        Args: { p_items: Json; p_mes_ano: string }
        Returns: Json
      }
      _guarded_create_conta_pagar: {
        Args: {
          p_dados_pagamento?: Json
          p_categoria_id?: string
          p_centro_custo_id?: string
          p_conta_id?: string
          p_data_competencia?: string
          p_data_vencimento?: string
          p_descricao: string
          p_forma_pagamento?: string
          p_fornecedor?: string
          p_idempotency_key?: string
          p_observacoes?: string
          p_rateios?: Json
          p_recorrencia?: Json
          p_supplier_id?: string
          p_valor: number
        }
        Returns: Json
      }
      _guarded_create_conta_receber: {
        Args: {
          p_categoria_id?: string
          p_centro_custo_id?: string
          p_cliente?: string
          p_conta_id?: string
          p_data_competencia?: string
          p_data_vencimento?: string
          p_descricao: string
          p_forma_pagamento?: string
          p_idempotency_key?: string
          p_observacoes?: string
          p_rateios?: Json
          p_recorrencia?: Json
          p_supplier_id?: string
          p_valor?: number
        }
        Returns: Json
      }
      _guarded_create_presentation_decision: {
        Args: {
          p_context: string
          p_executive_responsible_user_id?: string
          p_granularity: string
          p_idempotency_key?: string
          p_period_end_exclusive: string
          p_period_start: string
          p_reference_type: string
          p_snapshot: Json
          p_title: string
        }
        Returns: Json
      }
      _guarded_create_presentation_decision_action: {
        Args: {
          p_decision_id: string
          p_description: string
          p_due_date: string
          p_expected_decision_status: string
          p_expected_decision_updated_at: string
          p_priority: string
          p_responsible_user_id: string
        }
        Returns: Json
      }
      _guarded_create_presentation_session: {
        Args: {
          p_agenda_items: Json
          p_context: string
          p_granularity: string
          p_idempotency_key?: string
          p_meeting_date: string
          p_minutes_responsible_user_id: string
          p_participant_user_ids: string[]
          p_period_end_exclusive: string
          p_period_start: string
          p_previous_session_id: string
          p_title: string
        }
        Returns: Json
      }
      _guarded_delete_categoria: { Args: { p_id: string }; Returns: Json }
      _guarded_delete_centro_custo: { Args: { p_id: string }; Returns: Json }
      _guarded_delete_conta: { Args: { p_id: string }; Returns: Json }
      _guarded_delete_conta_pagar: {
        Args: { p_expected_updated_at?: string; p_id: string }
        Returns: Json
      }
      _guarded_delete_conta_receber: {
        Args: { p_expected_updated_at?: string; p_id: string }
        Returns: Json
      }
      _guarded_delete_lancamento: {
        Args: { p_expected_updated_at?: string; p_id: string }
        Returns: Json
      }
      _guarded_delete_orcamento: {
        Args: { p_expected_updated_at: string; p_id: string }
        Returns: undefined
      }
      _guarded_delete_plano_contas: { Args: { p_id: string }; Returns: Json }
      _guarded_estornar_conta_pagar: {
        Args: { p_id: string; p_justificativa?: string }
        Returns: Json
      }
      _guarded_estornar_conta_receber: {
        Args: { p_id: string; p_justificativa?: string }
        Returns: Json
      }
      _guarded_list_fin_audit_logs: {
        Args: {
          p_acao?: string
          p_cursor_created_at?: string
          p_cursor_id?: string
          p_dias?: number
          p_entidade?: string
          p_limit?: number
          p_search?: string
        }
        Returns: Json
      }
      _guarded_list_recorrencias: {
        Args: {
          p_cursor_data?: string
          p_cursor_id?: string
          p_limit?: number
          p_mes?: string
        }
        Returns: Json
      }
      _guarded_save_presentation_session: {
        Args: {
          p_agenda_items: Json
          p_context: string
          p_expected_status: string
          p_expected_updated_at: string
          p_meeting_date: string
          p_minutes_responsible_user_id: string
          p_participant_user_ids: string[]
          p_previous_session_id: string
          p_session_id: string
          p_title: string
        }
        Returns: Json
      }
      _guarded_start_presentation_session: {
        Args: {
          p_expected_status: string
          p_expected_updated_at: string
          p_session_id: string
          p_snapshot: Json
        }
        Returns: Json
      }
      _guarded_submit_presentation_minutes: {
        Args: {
          p_expected_status: string
          p_expected_updated_at: string
          p_revision_reason: string
          p_session_id: string
        }
        Returns: Json
      }
      _guarded_transition_presentation_decision: {
        Args: {
          p_decision_id: string
          p_expected_status: string
          p_expected_updated_at: string
          p_justification: string
          p_target_status: string
        }
        Returns: Json
      }
      _guarded_transition_presentation_decision_action: {
        Args: {
          p_action_id: string
          p_expected_status: string
          p_expected_updated_at: string
          p_outcome_note: string
          p_target_status: string
        }
        Returns: Json
      }
      _guarded_transition_presentation_session: {
        Args: {
          p_expected_status: string
          p_expected_updated_at: string
          p_justification: string
          p_session_id: string
          p_target_status: string
        }
        Returns: Json
      }
      _guarded_update_categoria: {
        Args: {
          p_centro_custo_padrao_id?: string
          p_expected_updated_at?: string
          p_grupo?: string
          p_id: string
          p_linha_dre?: string
          p_nome: string
          p_tipo: string
        }
        Returns: Json
      }
      _guarded_update_centro_custo: {
        Args: {
          p_descricao?: string
          p_expected_updated_at?: string
          p_id: string
          p_nome: string
        }
        Returns: Json
      }
      _guarded_update_conta: {
        Args: {
          p_agencia?: string
          p_banco?: string
          p_expected_updated_at?: string
          p_id: string
          p_nome: string
          p_numero_conta?: string
          p_saldo_inicial?: number
          p_tipo: string
        }
        Returns: Json
      }
      _guarded_update_conta_pagar: {
        Args: {
          p_dados_pagamento?: Json
          p_categoria_id?: string
          p_centro_custo_id?: string
          p_conta_id?: string
          p_data_competencia?: string
          p_data_vencimento?: string
          p_descricao: string
          p_expected_updated_at?: string
          p_forma_pagamento?: string
          p_fornecedor?: string
          p_id: string
          p_observacoes?: string
          p_rateios?: Json
          p_recorrencia?: Json
          p_supplier_id?: string
          p_valor: number
        }
        Returns: Json
      }
      _guarded_update_conta_receber: {
        Args: {
          p_categoria_id?: string
          p_centro_custo_id?: string
          p_cliente?: string
          p_conta_id?: string
          p_data_competencia?: string
          p_data_vencimento?: string
          p_descricao: string
          p_expected_updated_at?: string
          p_forma_pagamento?: string
          p_id: string
          p_observacoes?: string
          p_rateios?: Json
          p_recorrencia?: Json
          p_supplier_id?: string
          p_valor?: number
        }
        Returns: Json
      }
      _guarded_update_plano_contas: {
        Args: {
          p_codigo: string
          p_expected_updated_at?: string
          p_id: string
          p_linha_dre?: string
          p_natureza: string
          p_nome: string
          p_tipo: string
        }
        Returns: Json
      }
      _guarded_update_presentation_decision_action: {
        Args: {
          p_action_id: string
          p_description: string
          p_due_date: string
          p_expected_status: string
          p_expected_updated_at: string
          p_priority: string
          p_responsible_user_id: string
        }
        Returns: Json
      }
      _guarded_update_presentation_decision_draft: {
        Args: {
          p_context: string
          p_decision_id: string
          p_executive_responsible_user_id: string
          p_expected_updated_at: string
          p_title: string
        }
        Returns: Json
      }
      _guarded_update_reconciled_classification: {
        Args: {
          p_categoria_id?: string
          p_centro_custo_id?: string
          p_expected_updated_at?: string
          p_id: string
          p_justificativa_edicao?: string
          p_observacoes?: string
          p_rateios?: Json
        }
        Returns: {
          id: string
          updated_at: string
        }[]
      }
      _guarded_upsert_lancamento: {
        Args: {
          p_categoria_id?: string
          p_centro_custo_id?: string
          p_conta_id?: string
          p_data_competencia?: string
          p_data_pagamento?: string
          p_data_vencimento?: string
          p_descricao?: string
          p_forma_pagamento?: string
          p_id?: string
          p_idempotency_key?: string
          p_justificativa_edicao?: string
          p_observacoes?: string
          p_origem?: string
          p_rateios?: Json
          p_recorrencia_config?: Json
          p_recorrente?: boolean
          p_status?: string
          p_tipo?: string
          p_updated_at?: string
          p_valor?: number
        }
        Returns: {
          id: string
          idempotente: boolean
          updated_at: string
        }[]
      }
      _guarded_upsert_orcamento: {
        Args: {
          p_categoria_id: string
          p_expected_updated_at?: string
          p_mes_ano: string
          p_valor: number
        }
        Returns: Json
      }
      _planning_delete_meta_guarded: { Args: { p_id: string }; Returns: Json }
      _planning_spend_summary_guarded: {
        Args: {
          p_categoria?: string
          p_month: number
          p_source?: string
          p_year: number
        }
        Returns: Json
      }
      _planning_spend_summary_inner: {
        Args: {
          p_categoria?: string
          p_company_id: string
          p_month: number
          p_source?: string
          p_year: number
        }
        Returns: Json
      }
      _planning_upsert_meta_guarded: {
        Args: {
          p_alerta_amarelo?: number
          p_alerta_vermelho?: number
          p_categoria: string
          p_month: number
          p_target_value: number
          p_year: number
        }
        Returns: Json
      }
      _relatorios_compras_guarded: {
        Args: { p_end: string; p_start: string }
        Returns: Json
      }
      _relatorios_kpis_guarded: {
        Args: { p_end: string; p_start: string }
        Returns: Json
      }
      _relatorios_score_guarded: {
        Args: { p_end: string; p_start: string }
        Returns: Json
      }
      _relatorios_tendencia_guarded: {
        Args: { p_end: string; p_start: string }
        Returns: Json
      }
      _replace_fin_presentation_session_content: {
        Args: {
          p_actor_name: string
          p_actor_user_id: string
          p_agenda_items: Json
          p_company_id: string
          p_participant_user_ids: string[]
          p_session_id: string
        }
        Returns: Json
      }
      _salmon_cancel_entry_guarded: {
        Args: { p_entry_id: string; p_reason?: string }
        Returns: Json
      }
      _salmon_cancel_manipulation_guarded: {
        Args: { p_manip_id: string; p_reason?: string }
        Returns: Json
      }
      _salmon_create_entry_guarded: {
        Args: {
          p_boxes: number
          p_client_request_id?: string
          p_entry_date: string
          p_expiration_date?: string
          p_gross_kg: number
          p_lot: string
          p_notes?: string
          p_sif: string
          p_supplier_name: string
          p_total_value: number
          p_units: number
        }
        Returns: Json
      }
      _salmon_create_manipulation_guarded: {
        Args: {
          p_clean_in_kg: number
          p_client_request_id?: string
          p_entry_id: string
          p_fish_count: number
          p_gross_out_kg: number
          p_leftover_kg: number
          p_manipulation_date: string
          p_notes?: string
        }
        Returns: Json
      }
      _salmon_dashboard_guarded: {
        Args: { p_end: string; p_start: string }
        Returns: Json
      }
      _salmon_replace_entry_guarded: {
        Args: {
          p_boxes: number
          p_entry_date: string
          p_entry_id: string
          p_expiration_date?: string
          p_gross_kg: number
          p_lot: string
          p_notes?: string
          p_sif: string
          p_supplier_name: string
          p_total_value: number
          p_units: number
        }
        Returns: Json
      }
      _salmon_replace_manipulation_guarded: {
        Args: {
          p_clean_in_kg: number
          p_entry_id: string
          p_fish_count: number
          p_gross_out_kg: number
          p_leftover_kg: number
          p_manip_id: string
          p_manipulation_date: string
          p_notes?: string
        }
        Returns: Json
      }
      _simulate_relatorios_guarded: {
        Args: { p_end: string; p_params?: Json; p_start: string }
        Returns: Json
      }
      _stabilization_stock_consumption_history_inner: {
        Args: {
          p_category?: string
          p_end_date: string
          p_group_by?: string
          p_product_id?: string
          p_start_date: string
        }
        Returns: Json
      }
      _stabilization_stock_predictive_analysis_inner: {
        Args: {
          p_base_window_days?: number
          p_category_id?: string
          p_only_critical?: boolean
          p_product_id?: string
          p_target_coverage_days?: number
        }
        Returns: Json
      }
      _validate_fin_presentation_decision_snapshot: {
        Args: {
          p_granularity: string
          p_period_end_exclusive: string
          p_period_start: string
          p_reference_type: string
          p_snapshot: Json
        }
        Returns: undefined
      }
      _validate_fin_presentation_meeting_snapshot: {
        Args: {
          p_company_id: string
          p_granularity: string
          p_period_end_exclusive: string
          p_period_start: string
          p_snapshot: Json
        }
        Returns: undefined
      }
      admin_checkup_suite: { Args: never; Returns: Json }
      admin_has_permission: {
        Args: { p_permission: string; p_user_id: string }
        Returns: boolean
      }
      admin_health_counts: { Args: never; Returns: Json }
      admin_list_users: { Args: never; Returns: Json }
      admin_set_super_admin: {
        Args: {
          p_confirmation_email: string
          p_confirmation_phrase: string
          p_enable: boolean
          p_target_user_id: string
        }
        Returns: Json
      }
      admin_upsert_company_membership: {
        Args: {
          p_actor_user_id: string
          p_company_id: string
          p_if_not_exists?: boolean
          p_job_role_id?: string
          p_permissions?: string[]
          p_role?: Database["public"]["Enums"]["app_role"]
          p_sector?: string
          p_status?: string
          p_user_id: string
        }
        Returns: Json
      }
      aplicar_regras_categorizacao: { Args: never; Returns: Json }
      aprovar_ferias: {
        Args: { p_aprovado_por: string; p_registro_id: string }
        Returns: undefined
      }
      assert_tenant: { Args: never; Returns: string }
      attend_requisicao_item_atomic: {
        Args: {
          p_item_id: string
          p_quantidade_aprovada?: number
          p_requisicao_id: string
        }
        Returns: Json
      }
      audit_log_write: {
        Args: {
          _action: string
          _after?: Json
          _before?: Json
          _entity_id?: string
          _entity_type: string
          _metadata?: Json
          _module: string
          _severity?: string
        }
        Returns: undefined
      }
      backfill_log_scope: {
        Args: { p_batch_size?: number; p_dry_run?: boolean; p_table: string }
        Returns: Json
      }
      batch_reorder_fin_categorias: { Args: { p_items: Json }; Returns: Json }
      can_access_company_document: {
        Args: { p_action: string; p_path: string }
        Returns: boolean
      }
      can_receive_company_change: {
        Args: { p_company_id: string; p_permissions: string[] }
        Returns: boolean
      }
      cancel_salmon_entry_atomic: {
        Args: { p_entry_id: string; p_reason?: string }
        Returns: Json
      }
      cancel_salmon_manipulation_atomic: {
        Args: { p_manip_id: string; p_reason?: string }
        Returns: Json
      }
      cancel_stock_movement_atomic: {
        Args: { p_movement_id: string; p_reason: string }
        Returns: Json
      }
      cleanup_old_audit_logs: { Args: { p_months?: number }; Returns: number }
      comparativo_periodos: {
        Args: { p_mes_a: string; p_mes_b: string }
        Returns: Json
      }
      compute_requisicao_status_agregado: {
        Args: { p_requisicao_id: string }
        Returns: string
      }
      confirm_purchase_shopping_atomic: {
        Args: { p_items: Json; p_order_id: string }
        Returns: Json
      }
      contar_lancamentos_sem_categoria: { Args: never; Returns: number }
      copiar_orcamento_mes: {
        Args: { p_destino: string; p_origem: string }
        Returns: number
      }
      count_requisicoes_with_pending_items: { Args: never; Returns: number }
      create_cotacao_atomic: {
        Args: {
          p_data_validade?: string
          p_fornecedores?: Json
          p_idempotency_key?: string
          p_itens?: Json
          p_observacao?: string
          p_origin_ref?: string
          p_origin_type?: string
          p_titulo: string
        }
        Returns: Json
      }
      create_inventory_atomic: {
        Args: {
          p_categorias?: string[]
          p_data: string
          p_hora: string
          p_idempotency_key?: string
          p_metodo_contagem?: string
          p_observacao?: string
          p_tipo: string
          p_turno_id: string
        }
        Returns: Json
      }
      create_purchase_order_atomic: {
        Args: { p_idempotency_key: string; p_payload: Json }
        Returns: Json
      }
      create_purchase_orders_from_cotacao_atomic: {
        Args: { p_cotacao_id: string; p_expected_updated_at?: string }
        Returns: Json
      }
      create_quick_inventory_atomic: {
        Args: {
          p_idempotency_key?: string
          p_items: Json
          p_observacao?: string
        }
        Returns: Json
      }
      create_salmon_entry_atomic: {
        Args: {
          p_boxes: number
          p_client_request_id?: string
          p_entry_date: string
          p_expiration_date?: string
          p_gross_kg: number
          p_lot: string
          p_notes?: string
          p_sif: string
          p_supplier_name: string
          p_total_value: number
          p_units: number
        }
        Returns: Json
      }
      create_salmon_manipulation_atomic: {
        Args: {
          p_clean_in_kg: number
          p_client_request_id?: string
          p_entry_id: string
          p_fish_count: number
          p_gross_out_kg: number
          p_leftover_kg?: number
          p_manipulation_date: string
          p_notes?: string
        }
        Returns: Json
      }
      create_transfer: {
        Args: {
          p_conta_destino: string
          p_conta_origem: string
          p_created_by?: string
          p_data: string
          p_descricao: string
          p_idempotency_key?: string
          p_valor: number
        }
        Returns: Json
      }
      criar_requisicao_estoque: {
        Args: {
          p_client_request_id?: string
          p_itens: Json
          p_observacao: string
          p_setor: string
        }
        Returns: Json
      }
      deactivate_produto: { Args: { p_produto_id: string }; Returns: string }
      debug_company_inventory: { Args: never; Returns: Json }
      debug_stock_last_movements: { Args: { p_limit?: number }; Returns: Json }
      debug_tenant: { Args: never; Returns: Json }
      delete_purchase_order_atomic: {
        Args: { p_order_id: string }
        Returns: Json
      }
      delete_transfer: { Args: { p_lancamento_id: string }; Returns: Json }
      edit_purchase_order_atomic: {
        Args: { p_order_id: string; p_payload: Json }
        Returns: Json
      }
      ensure_salmon_raw_product: { Args: never; Returns: string }
      estoque_criar_produto: {
        Args: { p_client_request_id?: string; p_produto: Json }
        Returns: Json
      }
      estoque_registrar_movimentacoes_lote: {
        Args: { p_client_request_id?: string; p_itens: Json }
        Returns: Json
      }
      ficha_criar_componente_atomic: {
        Args: {
          _client_request_id?: string
          _componente: Json
          _itens: Json
        }
        Returns: Json
      }
      ficha_salvar_componente_itens_atomic: {
        Args: { _componente_pai_id: string; _itens: Json }
        Returns: Json
      }
      fin_audit_integrity_check: {
        Args: never
        Returns: {
          descricao: string
          entidade_id: string
          lancamento_id: string
          problema: string
          status: string
          tipo: string
          valor: number
        }[]
      }
      fin_categoria_fora_do_resultado: {
        Args: { p_categoria_id: string; p_company_id: string }
        Returns: boolean
      }
      fin_category_is_excluded: {
        Args: { p_category_id: string; p_company_id: string }
        Returns: boolean
      }
      fin_ensure_non_operational_categories: {
        Args: { p_company_id: string }
        Returns: undefined
      }
      fin_entity_has_category: {
        Args: {
          p_company_id: string
          p_direct_category_id: string
          p_entity_id: string
        }
        Returns: boolean
      }
      fin_get_categoria_desconto_baixa: {
        Args: { p_company_id: string }
        Returns: string
      }
      fin_get_categoria_desconto_concedido: {
        Args: { p_company_id: string }
        Returns: string
      }
      fin_get_limite_aprovacao: {
        Args: { p_company_id: string }
        Returns: number
      }
      fin_get_limite_aprovacao_atual: { Args: never; Returns: number }
      fin_recompute_entity_report_exclusion: {
        Args: { p_company_id: string; p_entity_id: string }
        Returns: undefined
      }
      fin_recorrencia_config_valida: {
        Args: { p_config: Json }
        Returns: boolean
      }
      fin_set_limite_aprovacao: { Args: { p_valor: number }; Returns: Json }
      fin_validate_recorrencia_config: {
        Args: { p_config: Json }
        Returns: Json
      }
      finalize_inventory_atomic: {
        Args: { p_id: string; p_justificativa: string }
        Returns: Json
      }
      find_auth_user_by_email: { Args: { p_email: string }; Returns: string }
      fn_recompute_product_saldo: {
        Args: { p_company: string; p_id: string }
        Returns: undefined
      }
      generate_next_sku: { Args: { p_prefix?: string }; Returns: string }
      gerar_parcela_recorrente: {
        Args: { p_lancamento_pai_id: string; p_parcela_esperada?: number }
        Returns: Json
      }
      get_all_saldos_contas: {
        Args: never
        Returns: {
          conta_id: string
          saldo: number
        }[]
      }
      get_beneficios_masked: {
        Args: { p_colaborador_id?: string }
        Returns: {
          colaborador_id: string
          created_at: string
          data_fim: string
          data_inicio: string
          descricao: string
          elegivel: boolean
          id: string
          nome: string
          numero_cartao: string
          numero_cartao_last4: string
          observacoes: string
          operadora: string
          percentual_desconto: number
          status: string
          tipo: string
          valor_colaborador: number
          valor_empresa: number
        }[]
      }
      get_catalog_counts: { Args: never; Returns: Json }
      get_company_permissions: {
        Args: { p_company_id: string; p_user_id: string }
        Returns: string[]
      }
      get_consumo_por_produto: {
        Args: {
          p_company_id: string
          p_produtos: string[]
          p_since: string
          p_tipos: string[]
        }
        Returns: {
          consumo_total: number
          dias_com_mov: number
          media_diaria: number
          produto_id: string
          ultima_mov: string
        }[]
      }
      get_cotacao_ia_config: { Args: never; Returns: Json }
      get_cotacao_zapi_config: { Args: never; Returns: Json }
      get_current_company_id: { Args: never; Returns: string }
      get_current_company_id_strict: { Args: never; Returns: string }
      get_effective_permissions: {
        Args: { _user_id: string }
        Returns: string[]
      }
      get_fin_alertas: { Args: never; Returns: Json }
      get_fin_bordero: {
        Args: { p_fim: string; p_inicio: string }
        Returns: Json
      }
      get_fin_cashflow: {
        Args: { p_fim: string; p_inicio: string }
        Returns: Json
      }
      get_fin_counts_by_status: {
        Args: { p_end?: string; p_start?: string }
        Returns: Json
      }
      get_fin_dashboard_charts: {
        Args: { p_end: string; p_start: string }
        Returns: Json
      }
      get_fin_dashboard_summary: {
        Args: { p_end: string; p_start: string }
        Returns: Json
      }
      get_fin_dfc_summary: {
        Args: { p_fim: string; p_inicio: string }
        Returns: Json
      }
      get_fin_dre_summary: {
        Args: { p_fim: string; p_inicio: string }
        Returns: Json
      }
      get_fin_fluxo_projecao: {
        Args: { p_dias?: number; p_saldo_manual?: number }
        Returns: Json
      }
      get_fin_kpis:
        | { Args: { p_meses?: number }; Returns: Json }
        | { Args: { p_end: string; p_start: string }; Returns: Json }
      get_fin_lancamentos_totais: {
        Args: {
          p_categoria_id?: string
          p_conta_id?: string
          p_end?: string
          p_origem?: string
          p_sem_categoria?: boolean
          p_start?: string
          p_tipo?: string
        }
        Returns: Json
      }
      get_fin_orcamento_arvore: { Args: { p_mes: string }; Returns: Json }
      get_fin_presentation_category_metadata: { Args: never; Returns: Json }
      get_fin_presentation_decision: {
        Args: { p_decision_id: string }
        Returns: Json
      }
      get_fin_presentation_detail_rows: {
        Args: {
          p_category_id?: string
          p_end_exclusive: string
          p_group?: string
          p_kind?: string
          p_nature?: string
          p_page?: number
          p_page_size?: number
          p_start: string
        }
        Returns: Json
      }
      get_fin_presentation_detail_series: {
        Args: {
          p_category_id?: string
          p_end_exclusive: string
          p_granularity?: string
          p_group?: string
          p_nature?: string
          p_start: string
        }
        Returns: Json
      }
      get_fin_presentation_expense_details: {
        Args: {
          p_category_id?: string
          p_cursor?: Json
          p_limit?: number
          p_month: string
        }
        Returns: Json
      }
      get_fin_presentation_expenses: {
        Args: { p_history_years: number[]; p_month: string }
        Returns: Json
      }
      get_fin_presentation_minutes_export: {
        Args: { p_session_id: string }
        Returns: Json
      }
      get_fin_presentation_plan: {
        Args: {
          p_category_group?: string
          p_category_id?: string
          p_category_nature?: string
          p_end_exclusive: string
          p_granularity?: string
          p_page?: number
          p_page_size?: number
          p_start: string
        }
        Returns: Json
      }
      get_fin_presentation_revenue: {
        Args: { p_history_years: number[]; p_month: string }
        Returns: Json
      }
      get_fin_presentation_session: {
        Args: { p_session_id: string }
        Returns: Json
      }
      get_fin_presentation_socios: {
        Args: {
          p_end_exclusive: string
          p_granularity?: string
          p_previous_end_exclusive: string
          p_previous_start: string
          p_previous_year_end_exclusive: string
          p_previous_year_start: string
          p_ranking_limit?: number
          p_start: string
        }
        Returns: Json
      }
      get_fin_saldo_atual: {
        Args: { p_conta_id?: string; p_data?: string }
        Returns: number
      }
      get_fin_saldo_conta_em: {
        Args: { p_conta_id: string; p_data: string }
        Returns: number
      }
      get_inactive_stock_items: { Args: never; Returns: Json }
      get_movimentacoes_kpis: {
        Args: {
          p_date_from?: string
          p_date_to?: string
          p_produto_id?: string
          p_setor?: string
          p_show_cancelled?: boolean
        }
        Returns: Json
      }
      get_my_company_context: { Args: never; Returns: Json }
      get_or_set_cache: {
        Args: { p_key: string; p_ttl_seconds?: number }
        Returns: Json
      }
      get_relatorios_compras:
        | { Args: { p_end: string; p_start: string }; Returns: Json }
        | { Args: { p_end: string; p_start: string }; Returns: Json }
      get_relatorios_kpis: {
        Args: { p_end: string; p_start: string }
        Returns: Json
      }
      get_relatorios_score: {
        Args: { p_end: string; p_start: string }
        Returns: Json
      }
      get_relatorios_tendencia: {
        Args: { p_end: string; p_start: string }
        Returns: Json
      }
      get_report_item_detail: {
        Args: { p_end: string; p_produto_id: string; p_start: string }
        Returns: Json
      }
      get_report_items_summary: {
        Args: { p_end: string; p_start: string }
        Returns: Json
      }
      get_rh_beneficios_total: { Args: never; Returns: Json }
      get_saldo_conta: { Args: { p_conta_id: string }; Returns: number }
      get_saldo_produto: { Args: { p_produto_id: string }; Returns: number }
      get_saldo_produtos: {
        Args: { p_produto_ids: string[] }
        Returns: {
          produto_id: string
          saldo: number
        }[]
      }
      get_salmon_dashboard_summary: {
        Args: { p_end: string; p_start: string }
        Returns: Json
      }
      get_salmon_inventory_adjustment_kg: { Args: never; Returns: Json }
      get_salmon_reconciliation_kpis: { Args: never; Returns: Json }
      get_spend_by_sector: {
        Args: {
          p_end_date: string
          p_include_losses?: boolean
          p_start_date: string
        }
        Returns: Json
      }
      get_stock_consumption_history: {
        Args: {
          p_category?: string
          p_end: string
          p_product_id?: string
          p_search?: string
          p_start: string
        }
        Returns: Json
      }
      get_stock_dashboard: { Args: { p_days?: number }; Returns: Json }
      get_stock_losses_report: {
        Args: {
          p_category?: string
          p_end_date?: string
          p_group_by?: string
          p_loss_type?: string
          p_order_by?: string
          p_product_id?: string
          p_start_date?: string
        }
        Returns: Json
      }
      get_stock_predictive_analysis: {
        Args: {
          p_category?: string
          p_horizon_days?: number
          p_only_active?: boolean
          p_product_id?: string
          p_window_days?: number
        }
        Returns: Json
      }
      get_stock_predictive_analysis_v2: {
        Args: {
          p_category_id?: string
          p_only_critical?: boolean
          p_product_id?: string
          p_target_coverage_days?: number
          p_use_weekday_pattern?: boolean
        }
        Returns: Json
      }
      get_stock_summary: {
        Args: never
        Returns: {
          items_count: number
          missing_cost_items_count: number
          total_stock_value: number
          updated_at: string
        }[]
      }
      get_stock_top_consumed: {
        Args: {
          p_category?: string
          p_end_date: string
          p_limit?: number
          p_rank_by?: string
          p_start_date: string
        }
        Returns: Json
      }
      get_supplier_ranking: {
        Args: {
          p_category?: string
          p_limit?: number
          p_offset?: number
          p_sort?: string
          p_stock_item_id?: string
        }
        Returns: {
          avg_unit_cost: number
          has_more: boolean
          items_count: number
          last_price: number
          last_updated_at: string
          max_unit_cost: number
          min_unit_cost: number
          rank_position: number
          supplier_id: string
          supplier_name: string
          supplier_uuid: string
        }[]
      }
      has_any_permission: {
        Args: { _permissions: string[]; _user_id: string }
        Returns: boolean
      }
      has_compras_view: { Args: { p_user_id: string }; Returns: boolean }
      has_permission:
        | { Args: { _permission: string }; Returns: boolean }
        | { Args: { _permission: string; _user_id: string }; Returns: boolean }
      has_permission_quick: {
        Args: { _permission: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      immutable_unaccent: { Args: { "": string }; Returns: string }
      is_company_member: {
        Args: { p_company_id: string; p_user_id: string }
        Returns: boolean
      }
      list_companies: { Args: never; Returns: Json }
      list_fin_contas_pagar_abertas: {
        Args: {
          p_data?: string
          p_limit?: number
          p_search?: string
          p_valor?: number
        }
        Returns: Json
      }
      list_fin_codigos_pagamento: {
        Args: {
          p_status?: string
          p_tipo?: string
          p_search?: string
          p_data_de?: string
          p_data_ate?: string
          p_categoria_id?: string
          p_sem_categoria?: boolean
          p_limit?: number
          p_cursor_date?: string
          p_cursor_id?: string
        }
        Returns: Json
      }
      list_fin_contas_pagar_cursor: {
        Args: {
          p_categoria_id?: string
          p_conta_id?: string
          p_cursor_date?: string
          p_cursor_id?: string
          p_data_ate?: string
          p_data_de?: string
          p_fornecedor?: string
          p_limit?: number
          p_search?: string
          p_sem_categoria?: boolean
          p_status?: string
        }
        Returns: Json
      }
      list_fin_contas_receber_cursor: {
        Args: {
          p_categoria_id?: string
          p_cliente?: string
          p_conta_id?: string
          p_cursor_date?: string
          p_cursor_id?: string
          p_data_ate?: string
          p_data_de?: string
          p_limit?: number
          p_search?: string
          p_sem_categoria?: boolean
          p_status?: string
        }
        Returns: Json
      }
      list_fin_lancamentos_cursor:
        | {
            Args: {
              p_conta_id?: string
              p_cursor_date?: string
              p_cursor_id?: string
              p_end?: string
              p_limit?: number
              p_search?: string
              p_start?: string
              p_status?: string
              p_tipo?: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_categoria_id?: string
              p_conta_id?: string
              p_cursor_date?: string
              p_cursor_id?: string
              p_end?: string
              p_limit?: number
              p_origem?: string
              p_search?: string
              p_sem_categoria?: boolean
              p_start?: string
              p_status?: string
              p_tipo?: string
            }
            Returns: Json
          }
      list_fin_presentation_decisions: {
        Args: {
          p_due_filter?: string
          p_page?: number
          p_page_size?: number
          p_period_end_exclusive?: string
          p_period_start?: string
          p_responsible_user_id?: string
          p_search?: string
          p_status?: string
        }
        Returns: Json
      }
      list_fin_presentation_sessions: {
        Args: {
          p_page?: number
          p_page_size?: number
          p_participant_user_id?: string
          p_period_end_exclusive?: string
          p_period_start?: string
          p_responsible_user_id?: string
          p_search?: string
          p_status?: string
        }
        Returns: Json
      }
      list_movimentacoes_cursor: {
        Args: {
          p_categoria?: string
          p_cursor_created_at?: string
          p_cursor_id?: string
          p_date_from?: string
          p_date_to?: string
          p_direction?: string
          p_limit?: number
          p_produto_id?: string
          p_setor?: string
          p_show_cancelled?: boolean
        }
        Returns: {
          created_at: string
          created_by: string
          custo_total: number
          custo_unitario: number
          data: string
          direction: string
          estorno_de_id: string
          has_more: boolean
          id: string
          internal_transfer: boolean
          justificativa_cancelamento: string
          justificativa_edicao: string
          observacao: string
          origem: string
          produto_id: string
          quantidade: number
          reference_id: string
          reference_type: string
          referencia_id: string
          salmon_lot_id: string
          setor: string
          source_module: string
          status: string
          tipo: string
        }[]
      }
      list_my_companies: {
        Args: never
        Returns: {
          id: string
          nome: string
        }[]
      }
      list_profiles_minimal: {
        Args: { p_limit?: number; p_search?: string }
        Returns: {
          avatar_url: string
          email: string
          id: string
          nome: string
        }[]
      }
      list_purchase_orders_cursor: {
        Args: {
          p_cursor_created_at?: string
          p_cursor_id?: string
          p_limit?: number
          p_priority?: string
          p_responsible?: string
          p_search?: string
          p_status?: string
          p_type?: string
        }
        Returns: {
          category: string
          concluded_at: string
          created_at: string
          created_by: string
          delivery_forecast_date: string
          has_more: boolean
          id: string
          need_by_date: string
          not_delivered_ack_at: string
          not_delivered_ack_by: string
          notes: string
          origin: string
          origin_ref: string
          payment_type: string
          priority: string
          responsible_user_id: string
          shopping_done_at: string
          shopping_done_by: string
          status: string
          supplier_name: string
          title: string
          total_confirmed: number
          total_estimated: number
          type: string
          updated_at: string
        }[]
      }
      list_report_items_cursor: {
        Args: {
          p_categoria?: string
          p_cursor_created_at?: string
          p_cursor_id?: string
          p_end: string
          p_limit?: number
          p_search?: string
          p_sort_asc?: boolean
          p_sort_key?: string
          p_start: string
        }
        Returns: Json
      }
      list_report_items_page: {
        Args: {
          p_categoria?: string
          p_end: string
          p_limit?: number
          p_offset?: number
          p_search?: string
          p_sort_asc?: boolean
          p_sort_key?: string
          p_start: string
        }
        Returns: Json
      }
      list_restricted_logs: {
        Args: {
          p_action?: string
          p_cursor_at?: string
          p_cursor_id?: string
          p_entity?: string
          p_limit?: number
          p_module?: string
          p_scope?: string
          p_table: string
        }
        Returns: Json[]
      }
      list_solic_compra_mercado_cursor: {
        Args: {
          p_cursor_created_at?: string
          p_cursor_id?: string
          p_date_from?: string
          p_date_to?: string
          p_limit?: number
          p_prioridade?: string
          p_search?: string
          p_solicitante?: string
          p_status?: string
        }
        Returns: {
          created_at: string
          data_necessidade: string
          has_more: boolean
          id: string
          observacoes: string
          prioridade: string
          responsavel_user_id: string
          solicitante_user_id: string
          status: string
          tipo: string
          titulo: string
          total_estimado: number
          total_real: number
          updated_at: string
        }[]
      }
      list_stock_transfers: {
        Args: {
          p_end_date?: string
          p_limit?: number
          p_location?: string
          p_offset?: number
          p_product_id?: string
          p_start_date?: string
        }
        Returns: Json
      }
      log_audit:
        | {
            Args: {
              p_action: string
              p_after?: Json
              p_before?: Json
              p_entity: string
              p_entity_id: string
              p_metadata?: Json
              p_module: string
              p_source: string
            }
            Returns: undefined
          }
        | {
            Args: {
              p_action: string
              p_after?: Json
              p_before?: Json
              p_entity: string
              p_entity_id: string
              p_metadata?: Json
              p_module: string
              p_source: string
            }
            Returns: undefined
          }
      log_integration_error: {
        Args: {
          p_action: string
          p_error_message: string
          p_module: string
          p_payload?: Json
          p_reference_id: string
        }
        Returns: undefined
      }
      mark_all_notifications_read: { Args: never; Returns: number }
      mutate_purchase_requisition_atomic: {
        Args: { p_action: string; p_payload: Json }
        Returns: Json
      }
      onboard_new_company: {
        Args: {
          p_admin_user_id?: string
          p_cnpj?: string
          p_company_name: string
          p_onboarding_request_id?: string
        }
        Returns: Json
      }
      catalogo_salvar_codigos_barras: {
        Args: {
          p_adicionar?: Json
          p_produto_id: string
          p_remover?: string[]
        }
        Returns: {
          codigo: string
          id: string
          rotulo: string
        }[]
      }
      op_barcode_existe: { Args: { p_barcode: string }; Returns: boolean }
      op_find_produto_por_barcode: {
        Args: { p_barcode: string }
        Returns: {
          barcode: string
          nome: string
          produto_id: string
          saldo: number
          setor_id: string
          setor_nome: string
          sku: string
          unidade_medida: string
        }[]
      }
      op_list_historico: {
        Args: { p_limit?: number }
        Returns: {
          criado_em: string
          id: string
          produto_nome: string
          quantidade: number
          responsavel: string
          setor: string
          tipo: string
          unidade_medida: string
        }[]
      }
      op_list_produtos: {
        Args: { p_limit?: number; p_search?: string; p_setor_id: string }
        Returns: {
          nome: string
          produto_id: string
          saldo: number
          sku: string
          unidade_medida: string
          vinculado: boolean
        }[]
      }
      op_list_setores: {
        Args: never
        Returns: {
          nome: string
          setor_id: string
        }[]
      }
      op_pode_todos_setores: { Args: { p_user_id: string }; Returns: boolean }
      op_registrar_movimentacao: {
        Args: {
          p_client_request_id?: string
          p_observacao?: string
          p_produto_id: string
          p_quantidade: number
          p_setor_id: string
          p_tipo: string
        }
        Returns: Json
      }
      op_registrar_saidas_lote: {
        Args: { p_itens: Json; p_observacao?: string }
        Returns: Json
      }
      op_setor_autorizado: {
        Args: { p_company: string; p_setor_id: string; p_user_id: string }
        Returns: boolean
      }
      orcamento_execucao_mensal: { Args: { p_mes: string }; Returns: Json }
      pay_conta_pagar: {
        Args: {
          p_conta_id?: string
          p_data_pagamento?: string
          p_expected_updated_at: string
          p_id: string
        }
        Returns: Json
      }
      preview_regra_categorizacao: {
        Args: { p_padrao: string; p_tipo_match?: string }
        Returns: Json
      }
      rbac_permissions_diff: { Args: { _registry_keys: Json }; Returns: Json }
      rbac_sql_lint_report: { Args: never; Returns: Json }
      rbac_sql_lint_report_admin: {
        Args: { p_actor_user_id: string }
        Returns: Json
      }
      rbac_sql_lint_report_internal: { Args: never; Returns: Json }
      rbac_sql_lint_report_quick: {
        Args: { p_actor_user_id: string }
        Returns: Json
      }
      rbac_top_legacy_usage: {
        Args: { _days?: number; _limit?: number }
        Returns: {
          first_seen: string
          last_seen: string
          legacy_key: string
          usage_count: number
        }[]
      }
      recalc_product_costs: {
        Args: { p_produto_id: string }
        Returns: undefined
      }
      receive_conta_receber: {
        Args: {
          p_data_recebimento?: string
          p_expected_updated_at: string
          p_id: string
        }
        Returns: Json
      }
      receive_market_order_atomic: {
        Args: {
          p_items: Json
          p_observacoes?: string
          p_recebimento_id: string
        }
        Returns: Json
      }
      receive_purchase_order_atomic: {
        Args: { p_items: Json; p_metadata?: Json; p_order_id: string }
        Returns: Json
      }
      reconcile_auto_bind_transfer_counterparts: {
        Args: { p_conta_id: string; p_lines: Json }
        Returns: Json
      }
      reconcile_batch_lancamentos: {
        Args: { p_lancamento_ids: string[] }
        Returns: Json
      }
      reconcile_bind_extrato: {
        Args: {
          p_conta_id: string
          p_external_id: string
          p_lancamento_id: string
          p_tipo: string
        }
        Returns: Json
      }
      reconcile_create_titulo_from_extrato: {
        Args: {
          p_categoria_id?: string
          p_cliente?: string
          p_data_baixa?: string
          p_data_competencia?: string
          p_data_vencimento?: string
          p_descricao: string
          p_destino: string
          p_lancamento_id: string
          p_observacoes?: string
          p_supplier_id?: string
        }
        Returns: Json
      }
      reconcile_create_transfer: {
        Args: {
          p_conta_destino_id: string
          p_conta_origem_id: string
          p_data: string
          p_descricao: string
          p_user_id: string
          p_valor: number
        }
        Returns: Json
      }
      reconcile_create_transfer_from_extrato: {
        Args: {
          p_conta_destino_id: string
          p_conta_origem_id: string
          p_data: string
          p_descricao: string
          p_external_id: string
          p_external_tipo: string
          p_valor: number
        }
        Returns: Json
      }
      reconcile_ignorar_lancamento: {
        Args: {
          p_conta_id: string
          p_data: string
          p_descricao: string
          p_tipo: string
          p_user_id: string
          p_valor: number
        }
        Returns: Json
      }
      reconcile_import_lancamento: {
        Args: {
          p_conta_id: string
          p_data: string
          p_descricao: string
          p_external_id?: string
          p_force_duplicate?: boolean
          p_occurrence_index?: number
          p_rateio_linhas?: Json
          p_tipo: string
          p_user_id: string
          p_valor: number
        }
        Returns: Json
      }
      reconcile_link_existing_lancamento: {
        Args: {
          p_conta_id: string
          p_data_extrato?: string
          p_external_id?: string
          p_lancamento_id: string
          p_tipo?: string
        }
        Returns: Json
      }
      reconcile_neutralize_contamax: {
        Args: { p_conta_id: string; p_linhas: Json }
        Returns: Json
      }
      reconcile_pay_conta_pagar: {
        Args: {
          p_ajuste_categoria_id?: string
          p_ajuste_tipo?: string
          p_conta_bancaria_id: string
          p_conta_pagar_id: string
          p_data_pagamento: string
          p_user_id: string
          p_valor_extrato?: number
        }
        Returns: Json
      }
      reconcile_receive_conta_receber: {
        Args: {
          p_ajuste_categoria_id?: string
          p_ajuste_tipo?: string
          p_conta_bancaria_id: string
          p_conta_receber_id: string
          p_data_recebimento: string
          p_user_id: string
          p_valor_extrato?: number
        }
        Returns: Json
      }
      reconcile_reconsiderar_ignorada: {
        Args: { p_ignorada_id: string }
        Returns: Json
      }
      refresh_materialized_views: { Args: never; Returns: Json }
      refresh_saldo_cache: { Args: { p_conta_id: string }; Returns: undefined }
      reject_ponto_record: {
        Args: { p_id: string; p_reason?: string }
        Returns: Json
      }
      relatorio_socios_resumo: { Args: { p_mes: string }; Returns: Json }
      reopen_inventory: {
        Args: { p_id: string; p_justificativa: string }
        Returns: Json
      }
      reorder_fin_categoria: {
        Args: { p_category_id: string; p_direction: string }
        Returns: Json
      }
      replace_rh_banco_horas_period_atomic: {
        Args: { p_periodo: string; p_rows: Json }
        Returns: Json
      }
      reserve_company_invitation: {
        Args: { p_actor_user_id: string; p_company_id: string; p_email: string }
        Returns: undefined
      }
      rh_folha_mudar_status: {
        Args: { p_id: string; p_status: string }
        Returns: Json
      }
      rh_folha_salvar_calculo: {
        Args: { p_linhas: Json; p_periodo: string }
        Returns: Json
      }
      rh_registrar_ponto: {
        Args: {
          p_client_request_id?: string
          p_colaborador_id: string
          p_tipo: string
        }
        Returns: Json
      }
      rpc_confirmacoes_approve: {
        Args: { p_confirmacao_id: string }
        Returns: Json
      }
      rpc_create_company: {
        Args: { p_cnpj?: string; p_nome: string }
        Returns: Json
      }
      rpc_delete_fechamento_caixa: { Args: { p_id: string }; Returns: Json }
      rpc_recebimentos_close: {
        Args: {
          p_enviar_ao_estoque?: boolean
          p_observacoes?: string
          p_recebimento_id: string
        }
        Returns: Json
      }
      rpc_set_user_company: {
        Args: { p_company_id: string; p_user_id: string }
        Returns: Json
      }
      rpc_upsert_fechamento_caixa:
        | {
            Args: {
              p_data: string
              p_descontos?: number
              p_faturamento_bruto: number
              p_observacao?: string
              p_taxas?: number
            }
            Returns: Json
          }
        | {
            Args: {
              p_data: string
              p_descontos?: number
              p_expected_updated_at?: string
              p_faturamento_bruto: number
              p_observacao?: string
              p_taxas?: number
            }
            Returns: Json
          }
      rpc_upsert_fechamento_caixa_com_marcas: {
        Args: {
          p_data: string
          p_descontos?: number
          p_expected_updated_at?: string
          p_faturamento_bruto: number
          p_marcas?: Json
          p_observacao?: string
          p_taxas?: number
        }
        Returns: Json
      }
      save_cotacao_ia_config: {
        Args: {
          p_api_key?: string
          p_ativo?: boolean
          p_model?: string
          p_provider?: string
        }
        Returns: Json
      }
      save_cotacao_respostas_atomic: {
        Args: {
          p_cotacao_id: string
          p_fornecedores_meta?: Json
          p_respostas?: Json
        }
        Returns: Json
      }
      save_cotacao_sugestao: {
        Args: {
          p_cotacao_id: string
          p_dados_json?: Json
          p_economia_estimada?: number
          p_selecoes?: Json
          p_tipo: string
          p_total_estimado?: number
        }
        Returns: Json
      }
      save_cotacao_zapi_config: {
        Args: {
          p_ativo?: boolean
          p_base_url?: string
          p_client_token?: string
          p_default_phone?: string
          p_instance_id?: string
          p_token?: string
        }
        Returns: Json
      }
      seed_default_categories: { Args: never; Returns: Json }
      service_write_audit: {
        Args: {
          p_action: string
          p_actor_id: string
          p_after?: Json
          p_before?: Json
          p_company_id: string
          p_entity: string
          p_entity_id?: string
          p_metadata?: Json
          p_module: string
        }
        Returns: undefined
      }
      set_cache: {
        Args: { p_key: string; p_payload: Json; p_ttl_seconds?: number }
        Returns: undefined
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      simulate_relatorios_score: {
        Args: { p_end: string; p_params?: Json; p_start: string }
        Returns: Json
      }
      soft_delete_cotacao: {
        Args: { p_expected_updated_at?: string; p_id: string }
        Returns: Json
      }
      soft_delete_inventory: {
        Args: { p_id: string; p_justificativa: string }
        Returns: Json
      }
      stock_insert_movement_atomic: {
        Args: {
          p_direction: string
          p_metadata?: Json
          p_note?: string
          p_origem?: string
          p_produto_id: string
          p_qty: number
          p_ref_id?: string
          p_ref_type?: string
          p_setor?: string
          p_tipo: string
        }
        Returns: Json
      }
      stock_transfer_between_locations: {
        Args: {
          p_client_request_id?: string
          p_from_location: string
          p_product_id: string
          p_quantity: number
          p_reason?: string
          p_to_location: string
        }
        Returns: Json
      }
      storno_purchase_order_stock: {
        Args: { p_order_id: string }
        Returns: undefined
      }
      strip_html: { Args: { p_text: string }; Returns: string }
      sync_permissions_from_registry: {
        Args: { _entries: Json }
        Returns: Json
      }
      unaccent: { Args: { "": string }; Returns: string }
      unreconcile_lancamento: { Args: { p_id: string }; Returns: Json }
      update_company: {
        Args: {
          p_ativo?: boolean
          p_cnpj?: string
          p_company_id: string
          p_nome?: string
        }
        Returns: Json
      }
      update_cotacao_atomic: {
        Args: {
          p_data_validade?: string
          p_expected_updated_at?: string
          p_fornecedores?: Json
          p_id: string
          p_itens?: Json
          p_observacao?: string
          p_titulo: string
        }
        Returns: Json
      }
      update_transfer: {
        Args: {
          p_conta_destino_id: string
          p_conta_origem_id: string
          p_data_competencia: string
          p_descricao: string
          p_lancamento_id: string
          p_valor: number
        }
        Returns: undefined
      }
      upsert_salmon_leftover_atomic: {
        Args: { p_leftover_kg: number; p_note?: string; p_record_date: string }
        Returns: Json
      }
      upsert_supplier: { Args: { p_name: string }; Returns: string }
      upsert_supplier_price: {
        Args: {
          p_name: string
          p_purchase_unit?: string
          p_stock_item_id: string
          p_unit_cost: number
        }
        Returns: string
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "compras"
        | "compras_assistente"
        | "operador"
        | "viewer"
        | "diretor"
        | "gerente_geral"
        | "gerente"
        | "colaborador"
        | "financeiro"
        | "chefe_setor"
        | "estoquista"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      app_role: [
        "admin",
        "compras",
        "compras_assistente",
        "operador",
        "viewer",
        "diretor",
        "gerente_geral",
        "gerente",
        "colaborador",
        "financeiro",
        "chefe_setor",
        "estoquista",
      ],
    },
  },
} as const
