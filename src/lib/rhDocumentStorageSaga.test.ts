import { describe, expect, it, vi } from 'vitest';
import {
  completeRhDocumentUpload,
  deleteRhDocumentStorage,
  type RhDocumentStorageOps,
} from './rhDocumentStorageSaga';

function makeOps() {
  const calls: string[] = [];
  const ops: RhDocumentStorageOps = {
    upload: vi.fn(async () => { calls.push('upload'); }),
    remove: vi.fn(async () => { calls.push('remove'); }),
    transition: vi.fn(async (_id, from, to) => { calls.push(`transition:${from}->${to}`); }),
    deleteMetadata: vi.fn(async (_id, state) => { calls.push(`delete:${state}`); }),
  };
  return { ops, calls };
}

const file = new File(['synthetic'], 'synthetic.txt', { type: 'text/plain' });

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
      'remove',
      'delete:PENDING_UPLOAD',
    ]);
  });

  it('keeps an explicit pending state when object compensation fails', async () => {
    const { ops } = makeOps();
    vi.mocked(ops.transition).mockRejectedValueOnce(new Error('activation failed'));
    vi.mocked(ops.remove).mockRejectedValueOnce(new Error('remove failed'));

    await expect(completeRhDocumentUpload(ops, { id: 'doc', path: 'company/doc.txt', file }))
      .rejects.toThrow('UPLOAD_ACTIVATION_FAILED_OBJECT_RETAINED');
    expect(ops.deleteMetadata).not.toHaveBeenCalled();
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
