import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

export type RhDocumentStorageState = 'PENDING_UPLOAD' | 'ACTIVE' | 'DELETING';

type RhDocumentInsert = Database['public']['Tables']['rh_documentos']['Insert'];

export interface RhDocumentStorageRecord {
  id: string;
  arquivo_path: string | null;
  storage_state: RhDocumentStorageState;
}

export interface RhDocumentStorageOps {
  /** `false` quando a PK já existe: um envio anterior com o mesmo id. */
  insertMetadata: (record: RhDocumentInsert) => Promise<boolean>;
  /** Estado atual do registro (`null` se não existe ou não é visível). */
  state: (id: string) => Promise<RhDocumentStorageState | null>;
  upload: (path: string, file: File) => Promise<void>;
  remove: (path: string) => Promise<void>;
  transition: (
    id: string,
    from: RhDocumentStorageState,
    to: RhDocumentStorageState,
  ) => Promise<void>;
  deleteMetadata: (id: string, state: RhDocumentStorageState) => Promise<void>;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function combinedError(prefix: string, primary: unknown, recovery: unknown): Error {
  return new Error(`${prefix}: ${message(primary)}; recuperação: ${message(recovery)}`);
}

/** Storage recusou o upload porque já existe um objeto no caminho. */
export function isDuplicateObjectError(error: unknown): boolean {
  const e = error as { statusCode?: unknown; status?: unknown; message?: unknown } | null;
  return String(e?.statusCode) === '409'
    || e?.status === 409
    || /already exists|duplicate/i.test(String(e?.message ?? ''));
}

export function createRhDocumentStorageOps(
  client: SupabaseClient<Database>,
): RhDocumentStorageOps {
  return {
    async insertMetadata(record) {
      const { error } = await client.from('rh_documentos').insert(record);
      if (!error) return true;
      if (error.code === '23505' && error.message.includes('rh_documentos_pkey')) return false;
      throw error;
    },

    async state(id) {
      const { data, error } = await client
        .from('rh_documentos')
        .select('storage_state')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      return (data?.storage_state as RhDocumentStorageState | undefined) ?? null;
    },

    async upload(path, file) {
      const { error } = await client.storage.from('rh-documentos').upload(path, file);
      // O caminho é derivado do id do documento, que é derivado do envio: o
      // objeto que já está lá é o desta operação, subido por uma tentativa
      // anterior cuja resposta se perdeu.
      if (error && !isDuplicateObjectError(error)) throw error;
    },

    async remove(path) {
      const { error } = await client.storage.from('rh-documentos').remove([path]);
      if (error) throw error;
    },

    async transition(id, from, to) {
      const { data, error } = await client
        .from('rh_documentos')
        .update({ storage_state: to })
        .eq('id', id)
        .eq('storage_state', from)
        .select('id')
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error(`RH_DOCUMENT_STATE_CONFLICT:${from}->${to}`);
    },

    async deleteMetadata(id, state) {
      const { data, error } = await client
        .from('rh_documentos')
        .delete()
        .eq('id', id)
        .eq('storage_state', state)
        .select('id')
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error(`RH_DOCUMENT_DELETE_CONFLICT:${state}`);
    },
  };
}

export async function completeRhDocumentUpload(
  ops: RhDocumentStorageOps,
  input: { id: string; path: string; file: File },
): Promise<void> {
  try {
    await ops.upload(input.path, input.file);
  } catch (uploadError) {
    try {
      await ops.deleteMetadata(input.id, 'PENDING_UPLOAD');
    } catch (metadataError) {
      throw combinedError('UPLOAD_FAILED_METADATA_PENDING', uploadError, metadataError);
    }
    throw uploadError;
  }

  try {
    await ops.transition(input.id, 'PENDING_UPLOAD', 'ACTIVE');
  } catch (activateError) {
    // A ativação pode ter sido gravada com a resposta perdida: compensar sem
    // conferir apagaria o arquivo de um documento já ativo. Sem conseguir
    // conferir, nada é desfeito — o registro fica PENDING_UPLOAD e o reenvio
    // (mesmo id) retoma daqui.
    let current: RhDocumentStorageState | null;
    try {
      current = await ops.state(input.id);
    } catch (stateError) {
      throw combinedError('UPLOAD_ACTIVATION_UNCONFIRMED', activateError, stateError);
    }
    if (current === 'ACTIVE') return;

    try {
      await ops.remove(input.path);
    } catch (removeError) {
      throw combinedError('UPLOAD_ACTIVATION_FAILED_OBJECT_RETAINED', activateError, removeError);
    }

    try {
      await ops.deleteMetadata(input.id, 'PENDING_UPLOAD');
    } catch (metadataError) {
      throw combinedError('UPLOAD_ACTIVATION_FAILED_METADATA_PENDING', activateError, metadataError);
    }
    throw activateError;
  }
}

export type RhDocumentRegistration = 'created' | 'resumed' | 'already_active';

/**
 * Registra o documento (metadados + arquivo) de forma repetível. O id vem
 * derivado do envio (`idDocumentoRh`), então um reenvio bate na PK e retoma de
 * onde a tentativa anterior parou em vez de criar outro documento:
 * ACTIVE → nada a fazer; PENDING_UPLOAD → sobe o arquivo e ativa.
 */
export async function registerRhDocument(
  ops: RhDocumentStorageOps,
  input: { metadata: RhDocumentInsert & { id: string }; path: string | null; file: File | null },
): Promise<RhDocumentRegistration> {
  const { id } = input.metadata;
  const inserted = await ops.insertMetadata(input.metadata);

  if (!inserted) {
    const current = await ops.state(id);
    if (current === 'ACTIVE') return 'already_active';
    if (current !== 'PENDING_UPLOAD') {
      throw new Error(`RH_DOCUMENT_STATE_CONFLICT:${current ?? 'MISSING'}`);
    }
  }

  if (input.file && input.path) {
    await completeRhDocumentUpload(ops, { id, path: input.path, file: input.file });
  }
  return inserted ? 'created' : 'resumed';
}

export async function deleteRhDocumentStorage(
  ops: RhDocumentStorageOps,
  doc: RhDocumentStorageRecord,
): Promise<void> {
  const originalState = doc.storage_state;

  if (originalState !== 'DELETING') {
    await ops.transition(doc.id, originalState, 'DELETING');
  }

  if (doc.arquivo_path) {
    try {
      await ops.remove(doc.arquivo_path);
    } catch (removeError) {
      if (originalState !== 'DELETING') {
        try {
          await ops.transition(doc.id, 'DELETING', originalState);
        } catch (rollbackError) {
          throw combinedError('DELETE_OBJECT_FAILED_STATE_PENDING', removeError, rollbackError);
        }
      }
      throw removeError;
    }
  }

  try {
    await ops.deleteMetadata(doc.id, 'DELETING');
  } catch (metadataError) {
    throw new Error(`Arquivo removido; finalize a exclusão novamente: ${message(metadataError)}`);
  }
}
