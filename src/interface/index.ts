import { ApiError } from '../util/api-error';

export interface HttpResponse<T> {
  data?: T;
  message?: string;
  status?: number;
}

export interface WireInterceptors {
  onUnauthorized?: (error: ApiError) => void | Promise<void>;
  onForbidden?: (error: ApiError) => void | Promise<void>;
  onError?: (error: ApiError) => void | Promise<void>;
}

export interface WireConfig {
  baseUrl: string;
  headers?: HeadersInit;
  getToken: () => Promise<string | null>;
  interceptors?: WireInterceptors;
}

export interface FetchOptions {
  tags?: string[];
}

export interface MutationOptions {
  invalidatesTags?: string[];
}

export interface ExecuteMutationOptions<T> {
  onSuccess?: (data: T) => void | Promise<void>;
  onError?: (error: ApiError) => void | Promise<void>;
}
