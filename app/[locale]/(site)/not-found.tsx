import { NotFoundPage } from '@/components/layout/not-found-page';

export { generateMetadata } from '../not-found';

/** The branded 404 inside the public shell (the (site) layout owns <main>). */
export default function SiteNotFound() {
  return <NotFoundPage />;
}
