import { compile } from '@mdx-js/mdx';
import remarkGfm from 'remark-gfm';
import { MAX_SOURCE_LENGTH } from './example';
import type { FieldRange } from './fields';

// Deliberately permit presentation, not author-supplied JavaScript or HTML.
const components: Record<string, string[]> = {
  Contract: ['title', 'network', 'status'],
  Field: ['label', 'value', 'placeholder'],
  Callout: ['title'],
  Menu: ['label'],
  MenuItem: ['label', 'href'],
  Tabs: ['label'],
  Tab: ['label'],
};
interface Node {
  type: string;
  name?: string;
  value?: unknown;
  url?: string;
  attributes?: Node[];
  children?: Node[];
  position?: {
    start: { line: number; column: number; offset: number };
    end: { offset: number };
  };
}
function restrictedMdx(fields: FieldRange[]) {
  return (tree: unknown) => {
    const visit = (node: Node) => {
      const fail = (message: string): never => {
        const at = node.position?.start;
        throw new Error(
          `${at ? `Line ${at.line}:${at.column} — ` : ''}${message}`,
        );
      };
      if (
        ['mdxjsEsm', 'mdxFlowExpression', 'mdxTextExpression'].includes(
          node.type,
        )
      ) {
        fail(
          'JavaScript expressions and imports are not supported. Use Markdown and the provided contract components.',
        );
      }
      if (node.type === 'image' || node.type === 'imageReference')
        fail('Images are not supported in this first version.');
      if (node.type === 'link' || node.type === 'definition') {
        if (!/^(https?:\/\/|mailto:|#)/i.test(node.url || ''))
          fail(
            'Links must use https, http, mailto, or a local heading anchor.',
          );
      }
      if (
        node.type === 'mdxJsxFlowElement' ||
        node.type === 'mdxJsxTextElement'
      ) {
        if (!node.name || !Object.hasOwn(components, node.name))
          fail(
            'Use only the documented contract components. Raw HTML is disabled.',
          );
        const allowed = components[node.name!];
        for (const attr of node.attributes || []) {
          if (
            attr.type !== 'mdxJsxAttribute' ||
            !allowed.includes(attr.name || '') ||
            typeof attr.value !== 'string'
          ) {
            fail(
              'Components accept only their documented, quoted text properties.',
            );
          }
        }
        if (node.name === 'MenuItem') {
          const href = node.attributes?.find(
            (attr) => attr.name === 'href',
          )?.value;
          if (
            typeof href !== 'string' ||
            !/^(https?:\/\/|mailto:|#)/i.test(href)
          )
            fail(
              'MenuItem href must use https, http, mailto, or a local anchor.',
            );
        }
        if (node.name === 'Field') {
          const value = node.attributes?.find((attr) => attr.name === 'value');
          if (!value?.position)
            fail(
              'Field requires a quoted value property, for example value="".',
            );
          const id = String(fields.length);
          fields.push({
            id,
            from: value!.position!.start.offset,
            to: value!.position!.end.offset,
          });
          node.attributes!.push({
            type: 'mdxJsxAttribute',
            name: 'fieldId',
            value: id,
          });
        }
      }
      node.children?.forEach(visit);
    };
    visit(tree as Node);
  };
}
export async function compileDocument(source: string) {
  const fields: FieldRange[] = [];
  if (source.length > MAX_SOURCE_LENGTH)
    throw new Error(
      'This document is too large. The editor supports up to 100,000 characters.',
    );
  const result = await compile(source, {
    outputFormat: 'function-body',
    development: false,
    remarkPlugins: [remarkGfm, () => restrictedMdx(fields)],
  });
  return { code: String(result), fields };
}

export async function compileSource(source: string): Promise<string> {
  return (await compileDocument(source)).code;
}
