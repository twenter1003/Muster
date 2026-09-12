import { useParams } from 'react-router-dom';
import { Page } from './pages';

export function ProjectOverviewPage() {
  const { id } = useParams<{ id: string }>();
  return <Page title={`프로젝트 ${id ?? ''}`} />;
}
