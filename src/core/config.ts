import type { WireConfig } from '../interfaces/core-interfaces.js';
import { generateMergedHeaders } from '../utils/generator/generate-merged-headers.js';

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
    headers: generateMergedHeaders(config.headers),
  };
};

/**
 * Updates the existing configuration.
 *
 * @param config - A partial configuration object to update.
 * @throws {Error} if called before `initWire`.
 */
export const updateWireConfig = (config: Partial<WireConfig>): void => {
  if (!globalWireConfig) {
    throw new Error('Wire not initialized. Call initWire() first.');
  }

  globalWireConfig = {
    ...globalWireConfig,
    ...config,
    headers: generateMergedHeaders(globalWireConfig.headers, config.headers),
    interceptors: {
      ...globalWireConfig.interceptors,
      ...config.interceptors,
    },
  };
};

/**
 * Retrieves the current global configuration state.
 *
 * @returns The current `WireConfig`.
 * @throws {Error} if called before `initWire`.
 */
export const getWireConfig = (): WireConfig => {
  if (!globalWireConfig) {
    throw new Error('Wire not initialized. Call initWire() first.');
  }
  return globalWireConfig;
};
