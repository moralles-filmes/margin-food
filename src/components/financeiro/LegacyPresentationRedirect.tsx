import { Navigate, useLocation, useParams } from 'react-router-dom';
import { PRESENTATION_BASE_PATH } from '@/lib/presentationDetailNavigation';
import { hasPresentationParams } from '@/lib/notificationTarget';

export default function LegacyPresentationRedirect() {
  const { detail } = useParams<{ detail: string }>();
  const location = useLocation();
  const target = detail
    ? `${PRESENTATION_BASE_PATH}/${encodeURIComponent(detail)}${location.search}${location.hash}`
    : `${PRESENTATION_BASE_PATH}${location.search}${location.hash}`;

  return <Navigate to={target} replace />;
}

/**
 * `/financeiro/relatorio-socios` virou Borderô, mas os avisos de decisão e ata da
 * Apresentação Sócios foram gravados com esse caminho (`?decision=`, `?session=`).
 * Com esses parâmetros o destino é a Apresentação; sem eles, o Borderô.
 */
export function LegacyRelatorioSociosRedirect() {
  const location = useLocation();
  const base = hasPresentationParams(new URLSearchParams(location.search)) ? PRESENTATION_BASE_PATH : '/financeiro/bordero';
  return <Navigate to={`${base}${location.search}${location.hash}`} replace />;
}
