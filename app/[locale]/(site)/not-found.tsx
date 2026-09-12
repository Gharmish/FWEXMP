/**
 * The branded 404 rendered INSIDE the public shell: a not-found boundary
 * replaces its own segment's children, so without this file the catch-all
 * under (site) would surface the locale-level page with no navbar or footer.
 * The locale-level copy stays for the dashboards.
 */
export { default, generateMetadata } from '../not-found';
