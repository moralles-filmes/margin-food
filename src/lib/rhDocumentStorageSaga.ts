import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

export type RhDocumentStorageState = 'PENDING_UPLOAD' | 'ACTIVE' | 'DELETING';

export interface RhDocumentStorageRecord {
  id: string;
  arquivo_path: string | null;
  storage_state: RhDocumentStorageState;
}

export interface RhDocumentStorageOps {
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

export function createRhDocumentStorageOps(
  client: SupabaseClient<Database>,
): RhDocumentStorageOps {
  return {
    async upload(path, file) {
      const { error } = await client.storage.from('rh-documentos').upload(path, file);
      if (error) throw error;
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
