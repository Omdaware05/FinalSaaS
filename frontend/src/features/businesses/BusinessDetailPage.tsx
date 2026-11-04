import React, { useEffect } from 'react';
import { useParams, useNavigate, NavLink } from 'react-router-dom';
import { useBusiness } from '../../app/providers/BusinessProvider';
import { DashboardPage } from '../dashboard/DashboardPage';
import { PageHeader } from '../../components/layout/PageHeader';
import { Button } from '../../components/ui/Button';
import { ArrowLeft, Building2 } from 'lucide-react';

export const BusinessDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { businesses, selectBusiness, selectedBusiness } = useBusiness();

  useEffect(() => {
    if (id && businesses.some((b) => b.id === id)) {
      selectBusiness(id);
    }
  }, [id, businesses]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 mb-2">
        <NavLink to="/businesses">
          <Button variant="ghost" size="xs" leftIcon={<ArrowLeft className="w-3.5 h-3.5" />}>
            All Businesses
          </Button>
        </NavLink>
      </div>

      <DashboardPage />
    </div>
  );
};
