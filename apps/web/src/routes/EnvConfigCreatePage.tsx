import { useParams } from 'react-router-dom';
import { Page } from './pages';

export function EnvConfigCreatePage() {
  const { id } = useParams<{ id: string }>();
  return <Page title={`환경 구성 생성 · ${id ?? ''}`} />;
}
