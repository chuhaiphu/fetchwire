export type ApiErrorCode = 'HTTP_ERROR' | 'NETWORK_ERROR' | 'PARSE_ERROR';

export interface ApiErrorInit {
  code: ApiErrorCode;
  method: string;
  url: string;
  response?: Response;
  data?: unknown;
}

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly method: string;
  readonly url: string;
  readonly response?: Response;
  readonly data?: unknown;

  constructor(init: ApiErrorInit) {
    super(`${init.code} [${init.method}] ${init.url}`);
    this.name = 'ApiError';
    this.code = init.code;
    this.method = init.method;
    this.url = init.url;
    this.response = init.response;
    this.data = init.data;
  }

  get status(): number | undefined {
    return this.response?.status;
  }
}
