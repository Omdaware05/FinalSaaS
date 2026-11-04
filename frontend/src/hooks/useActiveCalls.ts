import { useQuery } from '@tanstack/react-query';
import { statsApi } from '../services/api/stats';
import { ActiveCallsResponse } from '../types/api';

export function useActiveCalls(enabled = true) {
  const activeCallsQuery = useQuery<ActiveCallsResponse>({
    queryKey: ['active-calls'],
    queryFn: () => statsApi.getActiveCalls(),
    refetchInterval: enabled ? 1500 : false,
    staleTime: 1000,
    retry: 2,
  });

  return {
    activeCalls: activeCallsQuery.data?.calls || [],
    activeCount: activeCallsQuery.data?.active_count || 0,
    isLoading: activeCallsQuery.isLoading,
    isError: activeCallsQuery.isError,
    error: activeCallsQuery.error,
    refetch: activeCallsQuery.refetch,
  };
}
