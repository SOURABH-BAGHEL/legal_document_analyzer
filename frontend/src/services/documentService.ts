import { api, toApiError } from "./api";
import type { DocumentContent, DocumentInfo, DocumentList } from "../types/api";

export interface DocumentFilters {
  q?: string;
  file_type?: string;
  status?: string;
}

export const documentService = {
  async upload(file: File, onProgress?: (percent: number) => void): Promise<DocumentInfo> {
    const form = new FormData();
    form.append("file", file);
    try {
      const { data } = await api.post<DocumentInfo>("/api/documents/upload", form, {
        onUploadProgress: (e) => {
          if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100));
        },
      });
      return data;
    } catch (err) {
      throw toApiError(err);
    }
  },

  async list(filters: DocumentFilters = {}): Promise<DocumentList> {
    const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
    try {
      return (await api.get<DocumentList>("/api/documents/", { params })).data;
    } catch (err) {
      throw toApiError(err);
    }
  },

  async get(id: string): Promise<DocumentInfo> {
    try {
      return (await api.get<DocumentInfo>(`/api/documents/${id}`)).data;
    } catch (err) {
      throw toApiError(err);
    }
  },

  async content(id: string): Promise<DocumentContent> {
    try {
      return (await api.get<DocumentContent>(`/api/documents/${id}/content`)).data;
    } catch (err) {
      throw toApiError(err);
    }
  },

  async remove(id: string): Promise<void> {
    try {
      await api.delete(`/api/documents/${id}`);
    } catch (err) {
      throw toApiError(err);
    }
  },
};
