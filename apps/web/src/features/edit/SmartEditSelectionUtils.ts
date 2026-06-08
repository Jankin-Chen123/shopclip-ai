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

export const selectSmartEditSelectionRangeIdsOrUndefined = ({
  orderedIds,
  selectedIds,
  targetId,
}: {
  orderedIds: string[];
  selectedIds: string[];
  targetId: string;
}): string[] | undefined => {
  const anchorId = selectedIds[selectedIds.length - 1];
  if (!anchorId) {
    return undefined;
  }

  const anchorIndex = orderedIds.indexOf(anchorId);
  const targetIndex = orderedIds.indexOf(targetId);
  if (anchorIndex < 0 || targetIndex < 0) {
    return undefined;
  }

  const start = Math.min(anchorIndex, targetIndex);
  const end = Math.max(anchorIndex, targetIndex);
  return orderedIds.slice(start, end + 1);
};
