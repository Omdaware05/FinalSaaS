import { useQuery } from '@tanstack/react-query';
import { statsApi } from '../services/api/stats';
import { StatsResponse, QueueResponse } from '../types/api';

export function useRealTimeStats(enabled = true) {
  const statsQuery = useQuery<StatsResponse>({
    queryKey: ['stats'],
    queryFn: () => statsApi.getStats(),
    refetchInterval: enabled ? 1500 : false,
    staleTime: 1000,
    retry: 2,
  });

  const queueQuery = useQuery<QueueResponse>({
    queryKey: ['queue'],
    queryFn: statsApi.getQueue,
    refetchInterval: enabled ? 3000 : false,
    staleTime: 2000,
    retry: 2,
  });

  return {
    stats: statsQuery.data,
    queue: queueQuery.data,
    isLoading: statsQuery.isLoading || queueQuery.isLoading,
    isError: statsQuery.isError,
    error: statsQuery.error,
    refetch: () => {
      statsQuery.refetch();
      queueQuery.refetch();
    },
  };
}
