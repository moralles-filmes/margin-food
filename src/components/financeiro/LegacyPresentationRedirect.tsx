import { Navigate, useLocation, useParams } from 'react-router-dom';
import { PRESENTATION_BASE_PATH } from '@/lib/presentationDetailNavigation';

export default function LegacyPresentationRedirect() {
  const { detail } = useParams<{ detail: string }>();
  const location = useLocation();
  const target = detail
    ? `${PRESENTATION_BASE_PATH}/${encodeURIComponent(detail)}${location.search}${location.hash}`
    : `${PRESENTATION_BASE_PATH}${location.search}${location.hash}`;

  return <Navigate to={target} replace />;
}

