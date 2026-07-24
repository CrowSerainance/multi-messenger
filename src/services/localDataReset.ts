import {
  Platform,
} from 'react-native';

import LocalDataResetModule from '../../modules/local-data-reset';

export function canCompletelyResetLocalData(): boolean {
  return (
    Platform.OS === 'android' &&
    LocalDataResetModule !== null
  );
}

export async function requestCompleteLocalDataReset():
Promise<void> {
  if (!canCompletelyResetLocalData()) {
    throw new Error(
      'Complete local-data reset is unavailable on this build.',
    );
  }

  const accepted =
    await LocalDataResetModule!.clearApplicationData();

  if (!accepted) {
    throw new Error(
      'Android did not accept the local-data reset request.',
    );
  }
}
