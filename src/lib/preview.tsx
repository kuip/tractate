import Menu, { type MenuItem } from '../components/Menu';
import {
  render,
  toChildArray,
  type ComponentChildren,
  type VNode,
} from 'preact';
import { useId, useState } from 'preact/hooks';
import * as runtime from 'preact/jsx-runtime';

function Tabs({
  label,
  children,
}: {
  label?: string;
  children: ComponentChildren;
}) {
  const id = useId();
  const [selected, setSelected] = useState(0);
  const tabs = toChildArray(children).filter(
    (child): child is VNode<{ label?: string }> =>
      typeof child === 'object' &&
      child !== null &&
      'props' in child &&
      'label' in child.props &&
      typeof child.props.label === 'string',
  );
  const active = selected < tabs.length ? selected : 0;
  return (
    <section class="tabs">
      <div role="tablist" aria-label={label || 'Contract sections'}>
        {tabs.map((tab, index) => (
          <button
            type="button"
            role="tab"
            id={`${id}-tab-${index}`}
            aria-controls={`${id}-panel-${index}`}
            aria-selected={active === index}
            tabIndex={active === index ? 0 : -1}
            onClick={() => setSelected(index)}
            onKeyDown={(event) => {
              const next =
                event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? tabs.length - 1
                    : event.key === 'ArrowRight'
                      ? (index + 1) % tabs.length
                      : event.key === 'ArrowLeft'
                        ? (index + tabs.length - 1) % tabs.length
                        : null;
              if (next !== null) {
                event.preventDefault();
                setSelected(next);
                document.getElementById(`${id}-tab-${next}`)?.focus();
              }
            }}
          >
            {tab.props.label}
          </button>
        ))}
      </div>
      {tabs.map((tab, index) => (
        <div
          role="tabpanel"
          id={`${id}-panel-${index}`}
          aria-labelledby={`${id}-tab-${index}`}
          hidden={active !== index}
        >
          {tab}
        </div>
      ))}
    </section>
  );
}

function contractMenuItems(children: ComponentChildren): MenuItem[] {
  return toChildArray(children).flatMap((child) => {
    if (typeof child !== 'object' || !child || !('label' in child.props))
      return [];
    const props = child.props as {
      label: string;
      href?: string;
      children?: ComponentChildren;
    };
    return [
      {
        label: props.label,
        href: props.href,
        children: props.children
          ? contractMenuItems(props.children)
          : undefined,
      },
    ];
  });
}

const components = {
  Tabs,
  Tab: ({ children }: { label: string; children: ComponentChildren }) => (
    <>{children}</>
  ),
  Menu: ({
    label,
    children,
  }: {
    label: string;
    children: ComponentChildren;
  }) => <Menu label={label} items={contractMenuItems(children)} />,
  MenuItem: () => null,
  Contract: ({
    title,
    network,
    status,
    children,
  }: {
    title: string;
    network?: string;
    status?: string;
    children: ComponentChildren;
  }) => (
    <section class="contract">
      <header>
        <span class="eyebrow">{network || 'Kayros'} / CONTRACT</span>
        <span class="badge">{status || 'Draft'}</span>
      </header>
      <h2>{title}</h2>
      <div>{children}</div>
    </section>
  ),
  Field: ({
    label,
    value,
    placeholder,
    fieldId,
  }: {
    label: string;
    value: string;
    placeholder?: string;
    fieldId: string;
  }) => (
    <label class="field">
      <span>{label}</span>
      <input
        data-field-id={fieldId}
        value={value}
        placeholder={placeholder}
        onInput={(event) => {
          parent.postMessage(
            {
              type: 'tractate:field',
              fieldId,
              value: event.currentTarget.value,
            },
            '*',
          );
        }}
      />
    </label>
  ),
  Callout: ({
    title,
    children,
  }: {
    title?: string;
    children: ComponentChildren;
  }) => (
    <aside class="callout">
      <span class="callout-mark">↗</span>
      <div>
        <strong>{title || 'Note'}</strong>
        {children}
      </div>
    </aside>
  ),
  a: ({ href, children }: { href?: string; children: ComponentChildren }) => (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
};
window.addEventListener('message', (event) => {
  if (
    event.source !== parent ||
    event.data?.type !== 'tractate:render' ||
    typeof event.data.code !== 'string'
  )
    return;
  try {
    const { default: Content } = new Function(event.data.code)(runtime) as {
      default: (props: { components: typeof components }) => VNode;
    };
    const active =
      document.activeElement instanceof HTMLInputElement
        ? document.activeElement
        : null;
    const fieldId = active?.dataset.fieldId;
    const selection = active
      ? [active.selectionStart, active.selectionEnd]
      : null;
    const scroll = [window.scrollX, window.scrollY];
    render(Content({ components }), document.getElementById('document')!);
    if (fieldId !== undefined) {
      const input = document.querySelector<HTMLInputElement>(
        `input[data-field-id="${fieldId}"]`,
      );
      input?.focus({ preventScroll: true });
      if (selection) input?.setSelectionRange(selection[0], selection[1]);
      window.scrollTo(scroll[0], scroll[1]);
    }
    parent.postMessage({ type: 'tractate:rendered', id: event.data.id }, '*');
  } catch (error) {
    parent.postMessage(
      {
        type: 'tractate:error',
        id: event.data.id,
        error: error instanceof Error ? error.message : String(error),
      },
      '*',
    );
  }
});
parent.postMessage({ type: 'tractate:ready' }, '*');
