export const retainSmartEditSelectionIds = ({
  fallbackId,
  selectedIds,
  validIds,
}: {
  fallbackId?: string;
  selectedIds: string[];
  validIds: string[];
}): string[] => {
  const validIdSet = new Set(validIds);
  const retainedIds = selectedIds.filter((id) => validIdSet.has(id));
  return retainedIds.length > 0 || !fallbackId ? retainedIds : [fallbackId];
};

export const toggleSmartEditSelectionId = ({
  currentIds,
  orderedIds,
  targetId,
}: {
  currentIds: string[];
  orderedIds: string[];
  targetId: string;
}): string[] => {
  const currentIdSet = new Set(currentIds);
  if (currentIdSet.has(targetId) && currentIdSet.size > 1) {
    currentIdSet.delete(targetId);
  } else {
    currentIdSet.add(targetId);
  }
  return orderedIds.filter((id) => currentIdSet.has(id));
};
