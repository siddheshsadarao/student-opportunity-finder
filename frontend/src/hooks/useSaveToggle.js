/**
 * Shared "save / unsave an opportunity" behaviour.
 *
 * Several pages show opportunity cards, and all of them need the same
 * bookmark logic. Putting it in a hook means the logic exists once.
 *
 * The update is OPTIMISTIC: the bookmark icon flips immediately and only
 * rolls back if the API call fails, so the interface feels instant.
 */
import { useCallback, useState } from 'react';
import { savedApi } from '../services/api';
import { useToast } from '../context/ToastContext';

export default function useSaveToggle(setOpportunities) {
  // Ids currently being saved, so we can disable just that one button.
  const [savingIds, setSavingIds] = useState(new Set());
  const toast = useToast();

  const toggleSave = useCallback(
    async (opportunity) => {
      const { id, isSaved } = opportunity;

      setSavingIds((current) => new Set(current).add(id));

      // Flip the flag straight away.
      const applyFlag = (flag) =>
        setOpportunities((current) =>
          Array.isArray(current)
            ? current.map((item) => (item.id === id ? { ...item, isSaved: flag } : item))
            : current
        );

      applyFlag(!isSaved);

      try {
        if (isSaved) {
          await savedApi.unsave(id);
          toast.success('Removed from your saved list.');
        } else {
          await savedApi.save(id);
          toast.success('Saved to your list.');
        }
      } catch (error) {
        applyFlag(isSaved); // roll back
        toast.error(error.message);
      } finally {
        setSavingIds((current) => {
          const next = new Set(current);
          next.delete(id);
          return next;
        });
      }
    },
    [setOpportunities, toast]
  );

  return { toggleSave, savingIds };
}
