import apiClient from './client';
import { QuestionnaireDocument, ExcelImportResponse } from '../../types/api';

export const questionnairesApi = {
  getQuestionnaires: async (agentId?: string): Promise<QuestionnaireDocument[]> => {
    const res = await apiClient.get<any>('/questionnaires', {
      params: agentId ? { agent_id: agentId } : undefined,
    });
    if (Array.isArray(res.data)) return res.data;
    if (res.data && Array.isArray(res.data.questionnaires)) return res.data.questionnaires;
    return [];
  },

  getQuestionnaire: async (id: string): Promise<QuestionnaireDocument> => {
    const res = await apiClient.get<QuestionnaireDocument>(`/questionnaires/${id}`);
    return res.data;
  },

  createQuestionnaire: async (payload: Partial<QuestionnaireDocument>): Promise<QuestionnaireDocument> => {
    const res = await apiClient.post<QuestionnaireDocument>('/questionnaires', payload);
    return res.data;
  },

  updateQuestionnaire: async (id: string, payload: Partial<QuestionnaireDocument>): Promise<QuestionnaireDocument> => {
    const res = await apiClient.put<QuestionnaireDocument>(`/questionnaires/${id}`, payload);
    return res.data;
  },

  publishQuestionnaire: async (id: string, notes?: string): Promise<QuestionnaireDocument> => {
    const res = await apiClient.post<QuestionnaireDocument>(`/questionnaires/${id}/publish`, { notes });
    return res.data;
  },

  duplicateQuestionnaire: async (id: string): Promise<QuestionnaireDocument> => {
    const res = await apiClient.post<QuestionnaireDocument>(`/questionnaires/${id}/duplicate`);
    return res.data;
  },

  assignQuestionnaire: async (agentId: string, questionnaireId: string): Promise<{ success: boolean; message?: string }> => {
    const res = await apiClient.post('/questionnaires/assign', {
      agent_id: agentId,
      questionnaire_id: questionnaireId,
    });
    return res.data;
  },

  importDocx: async (file: File, agentId?: string): Promise<QuestionnaireDocument> => {
    const formData = new FormData();
    formData.append('file', file);
    if (agentId) formData.append('agent_id', agentId);
    const res = await apiClient.post<QuestionnaireDocument>('/questionnaires/import-docx', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return res.data;
  },

  importExcel: async (
    file: File,
    options?: { agentId?: string; title?: string; saveToDb?: boolean }
  ): Promise<ExcelImportResponse> => {
    const formData = new FormData();
    formData.append('file', file);
    if (options?.agentId) formData.append('agent_id', options.agentId);
    if (options?.title) formData.append('title', options.title);
    if (options?.saveToDb) formData.append('save_to_db', 'true');
    const res = await apiClient.post<ExcelImportResponse>('/questionnaires/import-excel', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return res.data;
  },

  downloadTemplate: async (): Promise<void> => {
    const res = await apiClient.get('/questionnaires/excel-template', {
      responseType: 'blob',
    });
    const blob = new Blob([res.data], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'Questionnaire_Template.xlsx';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },

  deleteQuestionnaire: async (id: string): Promise<{ success: boolean; message?: string }> => {
    const res = await apiClient.delete(`/questionnaires/${id}`);
    return res.data;
  },

  batchDeleteQuestionnaires: async (ids: string[]): Promise<{ success: boolean; deleted_count: number }> => {
    const res = await apiClient.post('/questionnaires/batch-delete', { ids });
    return res.data;
  },
};
