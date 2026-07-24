import { useQuery } from '@tanstack/react-query';
import { staffApi } from '@/api/client';
import type { StaffMe } from '@/api/types';

// The signed-in staff member and their role grants. Replaces six byte-identical
// copies of this query (AdminPage, BoardPage, IssueDetailPanel, IssuesListPage,
// StaffLayout, TriagePage) — the key and staleTime are kept exactly as they were
// so every caller keeps sharing the one cache entry and no extra request is made.
// Returns the raw useQuery result, so `const { data: me } = useMe()` still works.
export function useMe() {
  return useQuery({
    queryKey: ['staff', 'me'],
    queryFn: async () => (await staffApi.get<StaffMe>('/staff/me')).data,
    staleTime: 5 * 60 * 1000,
  });
}
