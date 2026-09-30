import { describe, expect, it, vi } from 'vitest';
import {
  completeRhDocumentUpload,
  deleteRhDocumentStorage,
  isDuplicateObjectError,
  registerRhDocument,
  type RhDocumentStorageOps,
} from './rhDocumentStorageSaga';

function makeOps() {
  const calls: string[] = [];
  const ops: RhDocumentStorageOps = {
    insertMetadata: vi.fn(async () => { calls.push('insert'); return true; }),
    state: vi.fn(async () => { calls.push('state'); return 'PENDING_UPLOAD' as const; }),
    upload: vi.fn(async () => { calls.push('upload'); }),
    remove: vi.fn(async () => { calls.push('remove'); }),
    transition: vi.fn(async (_id, from, to) => { calls.push(`transition:${from}->${to}`); }),
    deleteMetadata: vi.fn(async (_id, state) => { calls.push(`delete:${state}`); }),
  };
  return { ops, calls };
}

const file = new File(['synthetic'], 'synthetic.txt', { type: 'text/plain' });
const metadata = { id: 'doc', colaborador_id: 'c', nome: 'ASO', uploaded_by: 'u' };

describe('RH document Storage saga', () => {
  it('uploads bytes before activating metadata', async () => {
    const { ops, calls } = makeOps();

    await completeRhDocumentUpload(ops, { id: 'doc', path: 'company/doc.txt', file });

    expect(calls).toEqual(['upload', 'transition:PENDING_UPLOAD->ACTIVE']);
  });

  it('removes pending metadata when upload fails', async () => {
    const { ops, calls } = makeOps();
    vi.mocked(ops.upload).mockImplementationOnce(async () => {
      calls.push('upload');
      throw new Error('upload failed');
    });

    await expect(completeRhDocumentUpload(ops, { id: 'doc', path: 'company/doc.txt', file }))
      .rejects.toThrow('upload failed');
    expect(calls).toEqual(['upload', 'delete:PENDING_UPLOAD']);
  });

  it('reports a recoverable pending record when upload and metadata cleanup fail', async () => {
    const { ops } = makeOps();
    vi.mocked(ops.upload).mockRejectedValueOnce(new Error('upload failed'));
    vi.mocked(ops.deleteMetadata).mockRejectedValueOnce(new Error('delete failed'));

    await expect(completeRhDocumentUpload(ops, { id: 'doc', path: 'company/doc.txt', file }))
      .rejects.toThrow('UPLOAD_FAILED_METADATA_PENDING');
  });

  it('compensates the object and metadata when activation fails', async () => {
    const { ops, calls } = makeOps();
    vi.mocked(ops.transition).mockImplementationOnce(async (_id, from, to) => {
      calls.push(`transition:${from}->${to}`);
      throw new Error('activation failed');
    });

    await expect(completeRhDocumentUpload(ops, { id: 'doc', path: 'company/doc.txt', file }))
      .rejects.toThrow('activation failed');
    expect(calls).toEqual([
      'upload',
      'transition:PENDING_UPLOAD->ACTIVE',
      'state',
      'remove',
      'delete:PENDING_UPLOAD',
    ]);
  });

  it('keeps the file when activation was saved but its response was lost', async () => {
    const { ops, calls } = makeOps();
    vi.mocked(ops.transition).mockRejectedValueOnce(new Error('network'));
    vi.mocked(ops.state).mockImplementationOnce(async () => { calls.push('state'); return 'ACTIVE'; });

    await completeRhDocumentUpload(ops, { id: 'doc', path: 'company/doc.txt', file });

    expect(ops.remove).not.toHaveBeenCalled();
    expect(ops.deleteMetadata).not.toHaveBeenCalled();
  });

  it('undoes nothing when the activation cannot be confirmed', async () => {
    const { ops } = makeOps();
    vi.mocked(ops.transition).mockRejectedValueOnce(new Error('network'));
    vi.mocked(ops.state).mockRejectedValueOnce(new Error('still offline'));

    await expect(completeRhDocumentUpload(ops, { id: 'doc', path: 'company/doc.txt', file }))
      .rejects.toThrow('UPLOAD_ACTIVATION_UNCONFIRMED');
    expect(ops.remove).not.toHaveBeenCalled();
    expect(ops.deleteMetadata).not.toHaveBeenCalled();
  });

  it('keeps an explicit pending state when object compensation fails', async () => {
    const { ops } = makeOps();
    vi.mocked(ops.transition).mockRejectedValueOnce(new Error('activation failed'));
    vi.mocked(ops.remove).mockRejectedValueOnce(new Error('remove failed'));

    await expect(completeRhDocumentUpload(ops, { id: 'doc', path: 'company/doc.txt', file }))
      .rejects.toThrow('UPLOAD_ACTIVATION_FAILED_OBJECT_RETAINED');
    expect(ops.deleteMetadata).not.toHaveBeenCalled();
  });

  it('registers metadata, uploads and activates a new document', async () => {
    const { ops, calls } = makeOps();

    const result = await registerRhDocument(ops, {
      metadata,
      path: 'company/doc.txt',
      file,
    });

    expect(result).toBe('created');
    expect(calls).toEqual(['insert', 'upload', 'transition:PENDING_UPLOAD->ACTIVE']);
  });

  it('resumes a retry whose metadata is still PENDING_UPLOAD instead of creating another document', async () => {
    const { ops, calls } = makeOps();
    vi.mocked(ops.insertMetadata).mockImplementationOnce(async () => { calls.push('insert'); return false; });

    const result = await registerRhDocument(ops, {
      metadata,
      path: 'company/doc.txt',
      file,
    });

    expect(result).toBe('resumed');
    expect(calls).toEqual(['insert', 'state', 'upload', 'transition:PENDING_UPLOAD->ACTIVE']);
  });

  it('treats a retry of an already active document as done', async () => {
    const { ops, calls } = makeOps();
    vi.mocked(ops.insertMetadata).mockImplementationOnce(async () => { calls.push('insert'); return false; });
    vi.mocked(ops.state).mockImplementationOnce(async () => { calls.push('state'); return 'ACTIVE'; });

    const result = await registerRhDocument(ops, {
      metadata,
      path: 'company/doc.txt',
      file,
    });

    expect(result).toBe('already_active');
    expect(calls).toEqual(['insert', 'state']);
  });

  it('refuses a retry that hits a document being deleted', async () => {
    const { ops } = makeOps();
    vi.mocked(ops.insertMetadata).mockResolvedValueOnce(false);
    vi.mocked(ops.state).mockResolvedValueOnce('DELETING');

    await expect(registerRhDocument(ops, {
      metadata,
      path: 'company/doc.txt',
      file,
    })).rejects.toThrow('RH_DOCUMENT_STATE_CONFLICT:DELETING');
    expect(ops.upload).not.toHaveBeenCalled();
  });

  it('recognizes the Storage duplicate-object error', () => {
    expect(isDuplicateObjectError({ statusCode: '409', message: 'The resource already exists' })).toBe(true);
    expect(isDuplicateObjectError({ status: 409 })).toBe(true);
    expect(isDuplicateObjectError({ statusCode: '403', message: 'new row violates row-level security policy' })).toBe(false);
    expect(isDuplicateObjectError(null)).toBe(false);
  });

  it('deletes an active document through DELETING', async () => {
    const { ops, calls } = makeOps();

    await deleteRhDocumentStorage(ops, {
      id: 'doc', arquivo_path: 'company/doc.txt', storage_state: 'ACTIVE',
    });

    expect(calls).toEqual(['transition:ACTIVE->DELETING', 'remove', 'delete:DELETING']);
  });

  it('reconciles a PENDING_UPLOAD document instead of reporting false success', async () => {
    const { ops, calls } = makeOps();

    await deleteRhDocumentStorage(ops, {
      id: 'doc', arquivo_path: 'company/doc.txt', storage_state: 'PENDING_UPLOAD',
    });

    expect(calls).toEqual(['transition:PENDING_UPLOAD->DELETING', 'remove', 'delete:DELETING']);
  });

  it('restores ACTIVE when object deletion fails', async () => {
    const { ops, calls } = makeOps();
    vi.mocked(ops.remove).mockImplementationOnce(async () => {
      calls.push('remove');
      throw new Error('remove failed');
    });

    await expect(deleteRhDocumentStorage(ops, {
      id: 'doc', arquivo_path: 'company/doc.txt', storage_state: 'ACTIVE',
    })).rejects.toThrow('remove failed');
    expect(calls).toEqual([
      'transition:ACTIVE->DELETING',
      'remove',
      'transition:DELETING->ACTIVE',
    ]);
  });

  it('leaves DELETING recoverable when metadata deletion fails and succeeds on retry', async () => {
    const { ops, calls } = makeOps();
    vi.mocked(ops.deleteMetadata).mockImplementationOnce(async (_id, state) => {
      calls.push(`delete:${state}`);
      throw new Error('metadata failed');
    });

    await expect(deleteRhDocumentStorage(ops, {
      id: 'doc', arquivo_path: 'company/doc.txt', storage_state: 'ACTIVE',
    })).rejects.toThrow('finalize a exclusão novamente');

    await deleteRhDocumentStorage(ops, {
      id: 'doc', arquivo_path: 'company/doc.txt', storage_state: 'DELETING',
    });

    expect(calls).toEqual([
      'transition:ACTIVE->DELETING',
      'remove',
      'delete:DELETING',
      'remove',
      'delete:DELETING',
    ]);
  });
});
