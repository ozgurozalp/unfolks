import { TYPES } from '@extension/shared';
import sendMessage from '@src/helpers/sendMessage';

/** Asks the Instagram tab to send its recent scan events to the developer. Resolves false when it could not. */
export default async function sendLogs(detail?: string, message?: string): Promise<boolean> {
  try {
    await sendMessage({ type: TYPES.SEND_LOGS, errorDetail: detail, errorMessage: message });
    return true;
  } catch {
    return false;
  }
}
