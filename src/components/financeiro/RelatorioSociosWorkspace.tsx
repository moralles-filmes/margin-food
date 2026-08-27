import { lazy, Suspense } from 'react';
import { useParams } from 'react-router-dom';
import { BarChart3, FileBarChart } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ApresentacaoSociosSection from '@/components/financeiro/ApresentacaoSociosSection';
import { isPresentationDetailTarget } from '@/lib/presentationDetailNavigation';

const RelatorioSociosSection = lazy(() => import('@/components/financeiro/RelatorioSociosSection'));

function LegacyLoading() {
  return <Skeleton className="h-72 w-full" />;
}

export default function RelatorioSociosWorkspace() {
  const { detail } = useParams<{ detail?: string }>();
  const detailTarget = isPresentationDetailTarget(detail) ? detail : undefined;
  return (
    <Tabs defaultValue="analytics" className="space-y-4">
      <TabsList aria-label="Visões para sócios">
        <TabsTrigger value="analytics">
          <BarChart3 className="mr-2 h-4 w-4" aria-hidden="true" /> Apresentação analítica
        </TabsTrigger>
        <TabsTrigger value="legacy">
          <FileBarChart className="mr-2 h-4 w-4" aria-hidden="true" /> Relatório mensal atual
        </TabsTrigger>
      </TabsList>
      <TabsContent value="analytics">
        <ApresentacaoSociosSection detailTarget={detailTarget} invalidDetail={Boolean(detail && !detailTarget)} />
      </TabsContent>
      <TabsContent value="legacy">
        <Suspense fallback={<LegacyLoading />}>
          <RelatorioSociosSection />
        </Suspense>
      </TabsContent>
    </Tabs>
  );
}
