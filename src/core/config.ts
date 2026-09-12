import { WireConfig } from '../interface/wire';
import { mergeHeaders } from '../util/merge-headers';

let globalWireConfig: WireConfig | null = null;

/**
 * Initializes fetchwire with the required configuration.
 * Must be executed at the application entry point before any API calls.
 *
 * @param config - The configuration object, including `baseUrl` and `getToken`.
 */
export const initWire = (config: WireConfig): void => {
  globalWireConfig = {
    ...config,
    headers: mergeHeaders(config.headers),
  };
};

/**
 * Updates the existing configuration. `headers` and `interceptors` are each merged one level
 * deep; every other field is replaced outright.
 *
 * @param config - A partial configuration object to update.
 * @throws Error if called before `initWire`.
 */
export const updateWireConfig = (config: Partial<WireConfig>): void => {
  if (!globalWireConfig) {
    throw new Error('Wire not initialized. Call initWire() first.');
  }

  globalWireConfig = {
    ...globalWireConfig,
    ...config,
    headers: mergeHeaders(globalWireConfig.headers, config.headers),
    interceptors: {
      ...globalWireConfig.interceptors,
      ...config.interceptors,
    },
  };
};

/**
 * Retrieves the current global configuration state.
 *
 * @throws Error if called before `initWire`.
 * @returns The current `WireConfig`.
 */
export const getWireConfig = (): WireConfig => {
  if (!globalWireConfig) {
    throw new Error('Wire not initialized. Call initWire() first.');
  }
  return globalWireConfig;
};
