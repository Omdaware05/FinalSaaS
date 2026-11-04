import apiClient from './client';
import { ContactDocument, CsvImportResponse } from '../../types/api';

export const contactsApi = {
  getContacts: async (params?: { agent_id?: string; limit?: number; skip?: number }): Promise<ContactDocument[]> => {
    const res = await apiClient.get<any>('/contacts', { params });
    if (Array.isArray(res.data)) return res.data;
    if (res.data && Array.isArray(res.data.contacts)) return res.data.contacts;
    return [];
  },

  createOrUpdateContact: async (payload: {
    phone_number: string;
    name?: string;
    email?: string;
    agent_id?: string;
    tenant_id?: string;
    custom_fields?: Record<string, any>;
  }): Promise<ContactDocument> => {
    const res = await apiClient.post<ContactDocument>('/contacts', payload);
    return res.data;
  },

  importCsv: async (file: File, agentId?: string): Promise<CsvImportResponse> => {
    const formData = new FormData();
    formData.append('file', file);
    if (agentId) formData.append('agent_id', agentId);
    const res = await apiClient.post<CsvImportResponse>('/contacts/import-csv', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return res.data;
  },
};
