export const showDeleteConfirm = async (
  title: string,
  onConfirm: () => Promise<void>
): Promise<void> => {
  const confirmed = window.confirm(`Are you sure you want to delete "${title}"?`);
  if (confirmed) {
    await onConfirm();
  }
};
