type DirtyFormsListener = (hasDirtyForms: boolean) => void;

const dirtyForms = new Map<string, true>();
const listeners = new Set<DirtyFormsListener>();

function notifyListeners() {
  const dirty = dirtyForms.size > 0;
  listeners.forEach(listener => listener(dirty));
}

export function setFormDirtyState(formId: string, isDirty: boolean) {
  if (isDirty) {
    dirtyForms.set(formId, true);
  } else {
    dirtyForms.delete(formId);
  }
  notifyListeners();
}

export function clearFormDirtyState(formId: string) {
  dirtyForms.delete(formId);
  notifyListeners();
}

export function hasDirtyForms() {
  return dirtyForms.size > 0;
}

export function subscribeDirtyForms(listener: DirtyFormsListener) {
  listeners.add(listener);
  listener(hasDirtyForms());

  return () => {
    listeners.delete(listener);
  };
}

export function __resetDirtyFormsRegistryForTests() {
  dirtyForms.clear();
  listeners.clear();
}
