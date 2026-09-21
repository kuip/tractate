const files = import.meta.glob('/contracts/**/*.mdx', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;
export const contracts = Object.entries(files)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([path, source]) => ({
    path: path.replace('/contracts/', ''),
    name: path
      .split('/')
      .pop()!
      .replace(/\.mdx$/, ''),
    title:
      source.match(/<Contract\s+title="([^"]+)"/)?.[1] ||
      path
        .split('/')
        .pop()!
        .replace(/\.mdx$/, '')
        .replace(/-/g, ' '),
    source,
  }));
export const defaultContract =
  contracts.find(
    (contract) => contract.path === 'agreements/contribution.mdx',
  ) || contracts[0];
