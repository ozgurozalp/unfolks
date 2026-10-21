import { toast } from 'sonner';
import i18n from '@src/i18n';

/** Copy usernames one per line and confirm with a toast. */
export default async function copyUsernames(usernames: readonly string[]) {
  if (usernames.length === 0) return;
  try {
    await navigator.clipboard.writeText(usernames.join('\n'));
    toast.success(i18n.t('copiedUsernames', { count: usernames.length }), {
      id: 'copied-usernames',
      position: 'bottom-center',
    });
  } catch (error) {
    console.error('Clipboard write failed', error);
    toast.error(i18n.t('copyFailed'), { id: 'copy-failed', position: 'bottom-center' });
  }
}
