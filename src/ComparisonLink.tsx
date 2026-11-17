import { Link, type LinkProps, useOutletContext } from 'react-router';

import type { SiteOutletContext } from '@duofollow/src/useSite';

export function ComparisonLink(props: Omit<LinkProps, 'to' | 'reloadDocument'>) {
  const { openedOnComparison } = useOutletContext<SiteOutletContext>();

  return <Link {...props} to="/" reloadDocument={!openedOnComparison} />;
}
