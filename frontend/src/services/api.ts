import axios, { AxiosError } from "axios";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "",
  timeout: 120_000,
});

interface ApiErrorBody {
  error?: { code?: string; message?: string; details?: { field: string; message: string }[] };
}

export class ApiError extends Error {
  constructor(
    message: string,
    public code: string,
    public status?: number,
  ) {
    super(message);
  }
}

/** Convert any thrown value into a user-friendly ApiError. */
export function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  if (axios.isAxiosError(err)) {
    const axErr = err as AxiosError<ApiErrorBody>;
    const body = axErr.response?.data?.error;
    if (body?.message) return new ApiError(body.message, body.code ?? "ERROR", axErr.response?.status);
    if (!axErr.response) {
      return new ApiError(
        "Cannot reach the server. Make sure the backend is running and try again.",
        "NETWORK_ERROR",
      );
    }
    return new ApiError(`The server returned an error (HTTP ${axErr.response.status}).`, "HTTP_ERROR", axErr.response.status);
  }
  return new ApiError(err instanceof Error ? err.message : "Something went wrong.", "UNKNOWN");
}

export function errorMessage(err: unknown): string {
  return toApiError(err).message;
}
