import {
  requireOptionalNativeModule,
} from 'expo-modules-core';

export interface LocalDataResetModule {
  /**
   * Requests Android to clear this app's private data.
   * A successful request terminates the app process.
   */
  clearApplicationData(): Promise<boolean>;
}

export default requireOptionalNativeModule<
  LocalDataResetModule
>('LocalDataReset');
