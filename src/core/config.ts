import { WireConfig } from '../interface';

let globalWireConfig: WireConfig | null = null;

/**
 * Initializes the library with mandatory configurations.
 * Must be executed at the application entry point before any API calls.
 * @param config - The required configuration object including baseUrl and getToken.
 */
export const initWire = (config: WireConfig): void => {
  globalWireConfig = {
    ...config,
    headers: config.headers || {},
  };
};

/**
 * Updates the existing configuration.
 * Merges new headers with existing ones and overrides other provided fields.
 * @param config - A partial configuration object to update.
 */
export const updateWireConfig = (config: Partial<WireConfig>): void => {
  if (!globalWireConfig) {
    throw new Error('Wire not initialized. Call initWire() first.');
  }

  globalWireConfig = {
    ...globalWireConfig,
    ...config,
    headers: {
      ...globalWireConfig.headers,
      ...config.headers,
    },
  };
};

/**
 * Retrieves the current global configuration state.
 * @throws Error if the configuration state is null.
 * @returns The validated WireConfig object.
 */
export const getWireConfig = (): WireConfig => {
  if (!globalWireConfig) {
    throw new Error('Wire not initialized. Call initWire() first.');
  }
  return globalWireConfig;
};