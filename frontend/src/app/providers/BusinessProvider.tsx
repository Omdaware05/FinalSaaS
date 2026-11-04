import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { businessesApi } from '../../services/api/businesses';

export interface Business {
  id: string;
  name: string;
  industry: string;
  description?: string;
  contactEmail?: string;
  contactPhone?: string;
  status: 'active' | 'inactive' | 'onboarding';
  assignedAgentIds: string[];
  createdAt: string;
  updatedAt?: string;
}

interface BusinessContextType {
  businesses: Business[];
  selectedBusinessId: string; // 'all' or specific business id
  selectedBusiness: Business | null;
  isAllBusinesses: boolean;
  isLoading: boolean;
  refreshBusinesses: () => Promise<void>;
  selectBusiness: (id: string) => void;
  addBusiness: (business: Omit<Business, 'id' | 'createdAt'>) => Promise<Business>;
  updateBusiness: (id: string, updates: Partial<Business>) => Promise<void>;
  deleteBusiness: (id: string) => Promise<void>;
  assignAgentToBusiness: (businessId: string, agentId: string) => Promise<void>;
  unassignAgentFromBusiness: (businessId: string, agentId: string) => Promise<void>;
  getBusinessForAgent: (agentId?: string | null) => Business | undefined;
}

const STORAGE_KEY_SELECTED = 'voxora_active_business_id_v1';

const BusinessContext = createContext<BusinessContextType | undefined>(undefined);

export const BusinessProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const queryClient = useQueryClient();
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [selectedBusinessId, setSelectedBusinessId] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_SELECTED);
      if (saved) return saved;
    } catch {
      // fallback
    }
    return 'all';
  });

  const refreshBusinesses = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await businessesApi.list();
      if (Array.isArray(data)) {
        const mapped: Business[] = data.map((b) => ({
          id: b.business_id,
          name: b.name,
          industry: b.industry,
          contactEmail: b.email,
          contactPhone: b.phone,
          status: b.is_active ? 'active' : 'inactive',
          assignedAgentIds: b.assigned_agent_ids || [],
          createdAt: b.created_at,
        }));
        setBusinesses(mapped);
      }
    } catch (err) {
      console.warn('[BusinessProvider] Backend fetch notice:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshBusinesses();
  }, [refreshBusinesses]);

  // Persist active selection
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_SELECTED, selectedBusinessId);
    } catch {
      // ignore
    }
  }, [selectedBusinessId]);

  const selectedBusiness =
    selectedBusinessId === 'all'
      ? null
      : businesses.find((b) => b.id === selectedBusinessId) || null;

  const isAllBusinesses = selectedBusinessId === 'all';

  const selectBusiness = (id: string) => {
    setSelectedBusinessId(id);
    try {
      localStorage.setItem(STORAGE_KEY_SELECTED, id);
    } catch {
      // ignore
    }
    // Instantly invalidate all queries so all pages refetch data for the new business
    queryClient.invalidateQueries();
  };

  const addBusiness = async (data: Omit<Business, 'id' | 'createdAt'>): Promise<Business> => {
    try {
      const doc = await businessesApi.create({
        name: data.name,
        industry: data.industry,
        email: data.contactEmail,
        phone: data.contactPhone,
      });
      const newBiz: Business = {
        id: doc.business_id,
        name: doc.name,
        industry: doc.industry,
        contactEmail: doc.email,
        contactPhone: doc.phone,
        status: doc.is_active ? 'active' : 'inactive',
        assignedAgentIds: doc.assigned_agent_ids || [],
        createdAt: doc.created_at,
      };
      setBusinesses((prev) => [newBiz, ...prev]);
      queryClient.invalidateQueries();
      return newBiz;
    } catch (err) {
      console.warn('[BusinessProvider] Backend create error, falling back locally:', err);
      const localId = `biz_${Date.now()}`;
      const newBiz: Business = {
        ...data,
        id: localId,
        createdAt: new Date().toISOString(),
      };
      setBusinesses((prev) => [newBiz, ...prev]);
      queryClient.invalidateQueries();
      return newBiz;
    }
  };

  const updateBusiness = async (id: string, updates: Partial<Business>) => {
    setBusinesses((prev) =>
      prev.map((b) => (b.id === id ? { ...b, ...updates, updatedAt: new Date().toISOString() } : b))
    );
    try {
      await businessesApi.update(id, {
        name: updates.name,
        industry: updates.industry,
        email: updates.contactEmail,
        phone: updates.contactPhone,
        is_active: updates.status === 'active',
      });
      queryClient.invalidateQueries();
    } catch (err) {
      console.warn('[BusinessProvider] Backend update error:', err);
    }
  };

  const deleteBusiness = async (id: string) => {
    setBusinesses((prev) => prev.filter((b) => b.id !== id));
    if (selectedBusinessId === id) {
      setSelectedBusinessId('all');
    }
    try {
      await businessesApi.delete(id);
      queryClient.invalidateQueries();
    } catch (err) {
      console.warn('[BusinessProvider] Backend delete error:', err);
    }
  };

  const assignAgentToBusiness = async (businessId: string, agentId: string) => {
    setBusinesses((prev) =>
      prev.map((b) => {
        if (b.id === businessId) {
          if (!b.assignedAgentIds.includes(agentId)) {
            return { ...b, assignedAgentIds: [...b.assignedAgentIds, agentId] };
          }
        }
        return b;
      })
    );
    try {
      await businessesApi.assignAgent(businessId, agentId);
      queryClient.invalidateQueries();
    } catch (err) {
      console.warn('[BusinessProvider] Backend assign error:', err);
    }
  };

  const unassignAgentFromBusiness = async (businessId: string, agentId: string) => {
    setBusinesses((prev) =>
      prev.map((b) => {
        if (b.id === businessId) {
          return {
            ...b,
            assignedAgentIds: b.assignedAgentIds.filter((id) => id !== agentId),
          };
        }
        return b;
      })
    );
    try {
      await businessesApi.unassignAgent(businessId, agentId);
      queryClient.invalidateQueries();
    } catch (err) {
      console.warn('[BusinessProvider] Backend unassign error:', err);
    }
  };

  const getBusinessForAgent = (agentId?: string | null): Business | undefined => {
    if (!agentId) return undefined;
    return businesses.find((b) => b.assignedAgentIds.includes(agentId));
  };

  return (
    <BusinessContext.Provider
      value={{
        businesses,
        selectedBusinessId,
        selectedBusiness,
        isAllBusinesses,
        isLoading,
        refreshBusinesses,
        selectBusiness,
        addBusiness,
        updateBusiness,
        deleteBusiness,
        assignAgentToBusiness,
        unassignAgentFromBusiness,
        getBusinessForAgent,
      }}
    >
      {children}
    </BusinessContext.Provider>
  );
};

export const useBusiness = () => {
  const context = useContext(BusinessContext);
  if (!context) {
    throw new Error('useBusiness must be used within a BusinessProvider');
  }
  return context;
};
