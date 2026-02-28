import React from 'react';
import { createPortal } from 'react-dom';

type PortalAlign = 'left' | 'right';
type PortalRole = 'dialog' | 'menu';

type PortalMenuProps = {
  open: boolean;
  anchorRef: React.RefObject<HTMLElement>;
  popoverRef: React.RefObject<HTMLDivElement>;
  className?: string;
  role?: PortalRole;
  align?: PortalAlign;
  ariaLabel?: string;
  constrainHeightToViewport?: boolean;
  viewportMargin?: number;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  children: React.ReactNode;
};

export function PlusIcon(props: React.SVGProps<SVGSVGElement>): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false" {...props}>
      <path
        d="M12 5v14M5 12h14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ArrowUpIcon(props: React.SVGProps<SVGSVGElement>): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false" {...props}>
      <path
        d="M12 19V5m0 0l-7 7m7-7l7 7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ArrowDownIcon(props: React.SVGProps<SVGSVGElement>): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false" {...props}>
      <path
        d="M12 5v14m0 0l-7-7m7 7l7-7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function StopIcon(props: React.SVGProps<SVGSVGElement>): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false" {...props}>
      <rect x="7" y="7" width="10" height="10" rx="2.2" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export function ImageIcon(props: React.SVGProps<SVGSVGElement>): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false" {...props}>
      <rect x="3" y="5" width="18" height="14" rx="2.2" stroke="currentColor" strokeWidth="2" />
      <circle cx="8.5" cy="10" r="1.5" fill="currentColor" />
      <path
        d="M21 16l-5.2-5.2a1 1 0 0 0-1.4 0L8.2 17 6 14.8a1 1 0 0 0-1.4 0L3 16.4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function GearIcon(props: React.SVGProps<SVGSVGElement>): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false" {...props}>
      <path
        d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M19.4 12a7.5 7.5 0 0 0-.1-1l2-1.6-1.9-3.2-2.4 1a8 8 0 0 0-1.8-1l-.4-2.5H9.2l-.4 2.5a8 8 0 0 0-1.8 1l-2.4-1-1.9 3.2 2 1.6a7.5 7.5 0 0 0 0 2l-2 1.6 1.9 3.2 2.4-1a8 8 0 0 0 1.8 1l.4 2.5h5.6l.4-2.5a8 8 0 0 0 1.8-1l2.4 1 1.9-3.2-2-1.6c.1-.3.1-.7.1-1Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ChipIcon(props: React.SVGProps<SVGSVGElement>): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false" {...props}>
      <path
        d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <rect
        x="7"
        y="7"
        width="10"
        height="10"
        rx="2.5"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  );
}

export function GaugeIcon(props: React.SVGProps<SVGSVGElement>): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false" {...props}>
      <path
        d="M5 16a7 7 0 1 1 14 0"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M12 13l3.5-3.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M5 16h14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ReasoningEffortIcon(
  props: React.SVGProps<SVGSVGElement> & { activeBars: number; isConfig?: boolean }
): JSX.Element {
  const { activeBars, isConfig = false, ...svgProps } = props;
  if (isConfig && activeBars <= 0) {
    return <GaugeIcon {...svgProps} />;
  }
  const bars = [
    { x: 6, top: 14 },
    { x: 10, top: 10 },
    { x: 14, top: 6 },
    { x: 18, top: 2 }
  ];
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false" {...svgProps}>
      {bars.map((bar, idx) => (
        <path
          key={idx}
          d={`M${bar.x} 20V${bar.top}`}
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
          opacity={idx < activeBars ? 1 : 0.25}
        />
      ))}
    </svg>
  );
}

export function BatteryIcon(
  props: React.SVGProps<SVGSVGElement> & { level?: number | null }
): JSX.Element {
  const { level, ...svgProps } = props;
  const clamped =
    typeof level === 'number' && Number.isFinite(level) ? Math.min(1, Math.max(0, level)) : null;
  const innerWidth = 14;
  const fillWidth = clamped == null ? 0 : Math.max(0, Math.round(innerWidth * clamped));
  const dashed = clamped == null;
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false" {...svgProps}>
      <rect
        x="2"
        y="7"
        width="18"
        height="10"
        rx="2.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeDasharray={dashed ? '4 2' : undefined}
      />
      <rect x="21" y="10" width="2" height="4" rx="1" fill="currentColor" opacity={0.85} />
      {fillWidth > 0 && (
        <rect
          x="4"
          y="9"
          width={fillWidth}
          height="6"
          rx="1.4"
          fill="currentColor"
          opacity={0.9}
        />
      )}
    </svg>
  );
}

export function ContextWindowIcon(
  props: React.SVGProps<SVGSVGElement> & { level?: number | null }
): JSX.Element {
  const { level, ...svgProps } = props;
  const clamped =
    typeof level === 'number' && Number.isFinite(level) ? Math.min(1, Math.max(0, level)) : null;
  const fillRatio = clamped == null ? 0.35 : Math.max(0.05, clamped);
  const barX = 4;
  const barY = 4;
  const barW = 16;
  const barH = 16;
  const fillW = Math.round(barW * fillRatio);
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false" {...svgProps}>
      <rect
        x={barX}
        y={barY}
        width={barW}
        height={barH}
        rx="3.4"
        stroke="currentColor"
        strokeWidth="2"
      />
      <rect x={barX + 2} y={barY + 2} width={fillW} height={barH - 4} rx="1.4" fill="currentColor" opacity="0.85" />
    </svg>
  );
}

export function ShieldIcon(props: React.SVGProps<SVGSVGElement>): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false" {...props}>
      <path
        d="M12 2.8 19 5.9v6.2c0 5-3 9.2-7 9.9-4-.7-7-4.9-7-9.9V5.9l7-3.1Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CheckIcon(props: React.SVGProps<SVGSVGElement>): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false" {...props}>
      <path
        d="M20 6 9 17l-5-5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function FileIcon(props: React.SVGProps<SVGSVGElement>): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false" {...props}>
      <path
        d="M8 3h6l5 5v10.5A2.5 2.5 0 0 1 16.5 21h-9A2.5 2.5 0 0 1 5 18.5v-13A2.5 2.5 0 0 1 7.5 3H8Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M14 3v5h5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function XIcon(props: React.SVGProps<SVGSVGElement>): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false" {...props}>
      <path
        d="M18 6 6 18M6 6l12 12"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function PortalMenu(props: PortalMenuProps): JSX.Element | null {
  const {
    open,
    anchorRef,
    popoverRef,
    className,
    role = 'dialog',
    align = 'left',
    ariaLabel,
    constrainHeightToViewport = false,
    viewportMargin,
    onMouseEnter,
    onMouseLeave,
    children
  } = props;
  const [style, setStyle] = React.useState<React.CSSProperties>(() => ({
    left: 0,
    top: 0,
    visibility: 'hidden'
  }));

  React.useLayoutEffect(() => {
    if (!open) {
      return;
    }

    const update = () => {
      const anchor = anchorRef.current;
      const popover = popoverRef.current;
      if (!anchor || !popover) {
        return;
      }

      const margin = Math.max(0, Math.floor(viewportMargin ?? 8));
      const offset = 10;
      const viewportW = window.visualViewport?.width ?? window.innerWidth;
      const viewportH = window.visualViewport?.height ?? window.innerHeight;
      const viewportLeft = window.visualViewport?.offsetLeft ?? 0;
      const viewportTop = window.visualViewport?.offsetTop ?? 0;
      const bubbleEl = anchor.closest('.jp-CodexChat-message');
      let bubbleMarginY = 0;
      if (bubbleEl && bubbleEl instanceof HTMLElement) {
        const bubbleStyle = window.getComputedStyle(bubbleEl);
        const bubbleMarginTop = Number.parseFloat(bubbleStyle.marginTop) || 0;
        const bubbleMarginBottom = Number.parseFloat(bubbleStyle.marginBottom) || 0;
        bubbleMarginY = Math.max(0, Math.max(bubbleMarginTop, bubbleMarginBottom));
      }
      const viewportEdgePadding = margin + Math.round(bubbleMarginY);
      const anchorRect = anchor.getBoundingClientRect();
      const popRect = popover.getBoundingClientRect();
      const maxHeight = Math.max(80, Math.floor(viewportH - viewportEdgePadding * 2));
      const effectiveHeight = constrainHeightToViewport
        ? Math.min(popRect.height, maxHeight)
        : popRect.height;

      let left = align === 'right' ? anchorRect.right - popRect.width : anchorRect.left;
      left = clamp(left, viewportLeft + margin, Math.max(viewportLeft + margin, viewportLeft + viewportW - popRect.width - margin));

      let top = anchorRect.top - offset - effectiveHeight;
      const belowTop = anchorRect.bottom + offset;
      const minTop = viewportTop + viewportEdgePadding;
      const maxBottom = viewportTop + viewportH;
      if (top < minTop && belowTop + effectiveHeight + viewportEdgePadding <= maxBottom) {
        top = belowTop;
      }
      top = clamp(top, minTop, Math.max(minTop, maxBottom - effectiveHeight - viewportEdgePadding));

      setStyle({
        left: Math.round(left),
        top: Math.round(top),
        ...(constrainHeightToViewport
          ? {
              maxHeight: `${maxHeight}px`,
              overflowY: 'auto',
              overflowX: 'auto'
            }
          : {}),
        visibility: 'visible'
      });
    };

    const raf = window.requestAnimationFrame(update);
    const onResize = () => update();
    const onScroll = () => update();
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open, anchorRef, popoverRef, align, constrainHeightToViewport, viewportMargin]);

  if (!open) {
    return null;
  }

  return createPortal(
    <div
      ref={popoverRef}
      className={`jp-CodexMenu jp-CodexMenuPortal${className ? ` ${className}` : ''}`}
      role={role}
      aria-label={ariaLabel}
      style={style}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {children}
    </div>,
    document.body
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
