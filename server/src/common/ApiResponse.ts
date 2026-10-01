export type ApiSuccess<T> = {
  success: true;
  data: T;
  error: null;
  requestId: string;
};

export type ApiFailure = {
  success: false;
  data: null;
  error: {
    code: string;
    message: string;
  };
  requestId: string;
};

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export function success<T>(data: T, requestId: string): ApiSuccess<T> {
  return { success: true, data, error: null, requestId };
}

export function failure(code: string, message: string, requestId: string): ApiFailure {
  return { success: false, data: null, error: { code, message }, requestId };
}
