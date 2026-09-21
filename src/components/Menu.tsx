import { createPortal } from 'preact/compat';
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'preact/hooks';

export interface MenuItem {
  label: string;
  hint?: string;
  href?: string;
  action?: () => void;
  children?: MenuItem[];
}
type Level = { items: MenuItem[]; anchor: HTMLElement };

export default function Menu({
  label,
  items,
}: {
  label: string;
  items: MenuItem[];
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const [levels, setLevels] = useState<Level[]>([]);
  const close = (focus = false) => {
    setLevels([]);
    if (focus) trigger.current?.focus();
  };
  useEffect(() => {
    if (!levels.length) return;
    const outside = (event: Event) => {
      if (
        !(event.target instanceof Element) ||
        event.target
          .closest('[data-menu-owner]')
          ?.getAttribute('data-menu-owner') !== id
      )
        close();
    };
    const reset = () => close();
    const scroll = (event: Event) => {
      if (
        event.target instanceof Element &&
        event.target
          .closest('[data-menu-owner]')
          ?.getAttribute('data-menu-owner') === id
      ) {
        const depth = Number((event.target as HTMLElement).dataset.menuDepth);
        if (Number.isFinite(depth))
          setLevels((current) => current.slice(0, depth + 1));
      } else close();
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', outside);
    window.addEventListener('resize', reset);
    window.addEventListener('blur', reset);
    window.addEventListener('scroll', scroll, true);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('focusin', outside);
      window.removeEventListener('resize', reset);
      window.removeEventListener('blur', reset);
      window.removeEventListener('scroll', scroll, true);
    };
  }, [levels.length, id]);
  return (
    <>
      <button
        ref={trigger}
        class="shared-menu-trigger"
        data-menu-owner={id}
        aria-haspopup="menu"
        aria-expanded={levels.length > 0}
        aria-controls={levels.length ? `${id}-0` : undefined}
        onClick={() =>
          levels.length
            ? close()
            : setLevels([{ items, anchor: trigger.current! }])
        }
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setLevels([{ items, anchor: trigger.current! }]);
          }
        }}
      >
        {label}
        <span aria-hidden="true">⌄</span>
      </button>
      {levels.map((level, depth) =>
        createPortal(
          <Panel
            key={`${id}-${depth}`}
            id={`${id}-${depth}`}
            owner={id}
            label={
              depth
                ? level.anchor.getAttribute('data-menu-label') || label
                : label
            }
            depth={depth}
            level={level}
            active={depth === levels.length - 1}
            childAnchor={levels[depth + 1]?.anchor}
            back={() => {
              setLevels((current) => current.slice(0, depth));
              level.anchor.focus();
            }}
            open={(item, anchor) =>
              setLevels((current) => [
                ...current.slice(0, depth + 1),
                { items: item.children!, anchor },
              ])
            }
            close={close}
          />,
          document.body,
        ),
      )}
    </>
  );
}

function Panel({
  id,
  owner,
  label,
  depth,
  level,
  active,
  childAnchor,
  back,
  open,
  close,
}: {
  id: string;
  owner: string;
  label: string;
  depth: number;
  level: Level;
  active: boolean;
  childAnchor?: HTMLElement;
  back: () => void;
  open: (item: MenuItem, anchor: HTMLElement) => void;
  close: (focus?: boolean) => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: 0, top: 0, ready: false });
  useLayoutEffect(() => {
    const element = panel.current!;
    const anchor = level.anchor.getBoundingClientRect();
    const parent = level.anchor
      .closest('.shared-menu-panel')
      ?.getBoundingClientRect();
    const width = document.documentElement.clientWidth;
    const height = window.innerHeight;
    // Stack each child 20px right of its parent, resetting its vertical origin.
    // Narrow the panel at the right edge before reducing the offset.
    let left = parent ? Math.min(parent.left + 20, width - 128) : anchor.left;
    left = Math.max(8, Math.min(left, width - (parent ? 128 : 248)));
    element.style.width = `${Math.min(240, width - left - 8)}px`;
    const bounds = element.getBoundingClientRect();
    let top = parent ? parent.top : anchor.bottom + 4;
    if (
      !depth &&
      top + bounds.height > height - 8 &&
      anchor.top >= bounds.height + 8
    )
      top = anchor.top - bounds.height - 4;
    setPosition({
      left: Math.max(8, Math.min(left, width - bounds.width - 8)),
      top: Math.max(8, Math.min(top, height - bounds.height - 8)),
      ready: true,
    });
  }, [level]);
  useEffect(() => {
    if (position.ready)
      panel.current
        ?.querySelector<HTMLElement>('[role="menuitem"]')
        ?.focus({ preventScroll: true });
  }, [position]);
  return (
    <div
      ref={panel}
      id={id}
      role="menu"
      aria-label={label}
      data-menu-owner={owner}
      data-menu-depth={depth}
      class="shared-menu-panel"
      style={{
        left: position.left,
        top: position.top,
        visibility: position.ready ? 'visible' : 'hidden',
        zIndex: 1000 + depth,
      }}
      onKeyDown={(event) => {
        if (!active) return;
        const entries = Array.from(
          panel.current!.querySelectorAll<HTMLElement>('[role="menuitem"]'),
        );
        const index = entries.indexOf(document.activeElement as HTMLElement);
        let next: number | undefined;
        if (event.key === 'ArrowDown') next = (index + 1) % entries.length;
        if (event.key === 'ArrowUp')
          next = (index + entries.length - 1) % entries.length;
        if (event.key === 'Home') next = 0;
        if (event.key === 'End') next = entries.length - 1;
        if (next !== undefined) {
          event.preventDefault();
          entries[next]?.focus();
        }
        if (event.key === 'Escape' || event.key === 'ArrowLeft') {
          event.preventDefault();
          depth ? back() : close(true);
        }
        if (event.key === 'Tab') close();
        if (event.key === 'ArrowRight' && level.items[index]?.children) {
          event.preventDefault();
          open(level.items[index], entries[index]);
        }
        if (event.key.length === 1 && /\S/.test(event.key)) {
          const match = [
            ...entries.slice(index + 1),
            ...entries.slice(0, index + 1),
          ].find((entry) =>
            entry.textContent
              ?.toLowerCase()
              .startsWith(event.key.toLowerCase()),
          );
          if (match) {
            event.preventDefault();
            match.focus();
          }
        }
      }}
    >
      {depth > 0 && (
        <div class="shared-menu-title" role="presentation">
          {label}
        </div>
      )}
      {level.items.map((item) =>
        item.href && !item.children ? (
          <a
            key={item.label}
            role="menuitem"
            tabIndex={-1}
            href={item.href}
            target={item.href.startsWith('#') ? undefined : '_blank'}
            rel="noopener noreferrer"
            onClick={() => close(true)}
          >
            {item.label}
          </a>
        ) : (
          <button
            key={item.label}
            type="button"
            data-menu-label={item.label}
            role="menuitem"
            tabIndex={-1}
            aria-haspopup={item.children ? 'menu' : undefined}
            aria-expanded={
              item.children
                ? childAnchor?.getAttribute('data-menu-label') === item.label
                : undefined
            }
            onClick={(event) => {
              if (item.children) open(item, event.currentTarget);
              else {
                close(true);
                item.action?.();
              }
            }}
          >
            <span>{item.label}</span>
            <span aria-hidden="true">{item.children ? '›' : item.hint}</span>
          </button>
        ),
      )}
    </div>
  );
}
