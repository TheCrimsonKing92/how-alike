"use client";

import * as React from "react";

import { cn, escapeRegExp } from "@/lib/utils";
import type glossary from "@/data/glossary.json";

export type GlossaryMap = typeof glossary;
export type GlossaryKey = keyof GlossaryMap;
type GlossaryEntry = GlossaryMap[GlossaryKey];

const HOVER_QUERY = "(hover: hover) and (pointer: fine)";

let glossaryCache: GlossaryMap | null = null;
let glossaryPromise: Promise<GlossaryMap> | null = null;

const loadGlossary = async (): Promise<GlossaryMap> => {
  if (glossaryCache) return glossaryCache;
  if (!glossaryPromise) {
    glossaryPromise = import("@/data/glossary.json").then((module) => {
      glossaryCache = module.default as GlossaryMap;
      return glossaryCache;
    });
  }
  return glossaryPromise;
};

const getHoverMediaQuery = (): MediaQueryList | null => {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return null;
  }
  return window.matchMedia(HOVER_QUERY);
};

const prefersHover = (): boolean => {
  const mediaQuery = getHoverMediaQuery();
  return mediaQuery?.matches ?? false;
};

const humanizeKey = (key: string): string =>
  key
    .split(/[_\s]+/g)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(" ");

const TERM_VARIANTS: Record<GlossaryKey, readonly string[]> = {
  zygomatic: ["zygomatic prominence", "zygomatic", "cheekbone"],
  philtrum: ["philtrum"],
  nasolabial_fold: ["nasolabial fold", "nasolabial"],
  brow_position: ["brow position", "eyebrow position"],
  brow_length: ["brow length", "eyebrow length"],
  brow_shape: ["brow shape", "eyebrow shape"],
  canthal_tilt: ["canthal tilt"],
  orbital_depth: ["orbital depth", "eye depth", "deep-set eyes"],
  interocular_distance: ["interocular distance", "eye spacing", "interpupillary distance"],
  nasal_bridge: ["nasal bridge", "bridge height"],
  nasal_tip: ["nasal tip", "tip rotation"],
  alar_width: ["alar width", "nostril width", "nose width"],
  lip_fullness: ["lip fullness", "lip volume", "lip thickness"],
  cupid_bow: ["cupid's bow", "cupid bow"],
  commissure_orientation: ["lip corner orientation", "commissure orientation", "mouth corners"],
  chin_projection: ["chin projection", "chin prominence"],
  jaw_angle: ["jaw angle", "mandibular angle"],
  mandibular_width: ["mandibular width", "jaw width"],
  facial_asymmetry: ["facial asymmetry", "asymmetry"],
  facial_length: ["facial length", "face length"],
};

type VariantEntry = { variant: string; key: GlossaryKey };

const VARIANT_ENTRIES: VariantEntry[] = Object.entries(TERM_VARIANTS).flatMap(([key, variants]) =>
  variants.map((variant) => ({ key: key as GlossaryKey, variant }))
);

VARIANT_ENTRIES.sort((a, b) => b.variant.length - a.variant.length);

const VARIANT_MAP = new Map<string, GlossaryKey>();
const PATTERN_PARTS: string[] = [];

for (const { key, variant } of VARIANT_ENTRIES) {
  const lowered = variant.toLowerCase();
  if (!VARIANT_MAP.has(lowered)) {
    VARIANT_MAP.set(lowered, key);
    PATTERN_PARTS.push(escapeRegExp(variant));
  }
}

const GLOSSARY_PATTERN = PATTERN_PARTS.join("|");

const createGlossaryRegex = () => new RegExp(`\\b(${GLOSSARY_PATTERN})\\b`, "gi");

export const annotateGlossaryText = (text?: string): React.ReactNode => {
  if (!text || !GLOSSARY_PATTERN) return text ?? null;

  const regex = createGlossaryRegex();
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;

  text.replace(regex, (match, _group, offset: number) => {
    if (offset > lastIndex) {
      nodes.push(text.slice(lastIndex, offset));
    }

    const termKey = VARIANT_MAP.get(match.toLowerCase() as string);
    if (termKey) {
      nodes.push(
        <DefinitionTooltip key={`${termKey}-${offset}`} termId={termKey}>
          {match}
        </DefinitionTooltip>
      );
    } else {
      nodes.push(match);
    }

    lastIndex = offset + match.length;
    return match;
  });

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes.length > 0 ? nodes : text;
};

export interface DefinitionTooltipProps {
  termId: GlossaryKey;
  children?: React.ReactNode;
  className?: string;
}

export function DefinitionTooltip({ termId, children, className }: DefinitionTooltipProps) {
  const containerRef = React.useRef<HTMLSpanElement | null>(null);
  const [entry, setEntry] = React.useState<GlossaryEntry | null>(null);
  const [isVisible, setIsVisible] = React.useState(false);
  const [canHover, setCanHover] = React.useState(prefersHover);
  const [open, setOpen] = React.useState(false);

  const tooltipId = React.useId();

  React.useEffect(() => {
    const mediaQuery = getHoverMediaQuery();
    if (!mediaQuery) {
      setCanHover(false);
      return;
    }

    const updateHover = () => setCanHover(mediaQuery.matches);
    updateHover();

    mediaQuery.addEventListener("change", updateHover);
    return () => mediaQuery.removeEventListener("change", updateHover);
  }, []);

  React.useEffect(() => {
    const element = containerRef.current;
    if (isVisible || !element) return;

    if (typeof window === "undefined" || typeof IntersectionObserver === "undefined") {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "160px" }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [isVisible]);

  React.useEffect(() => {
    if (!isVisible) return;
    let active = true;
    loadGlossary()
      .then((map) => {
        if (!active) return;
        setEntry(map[termId] ?? null);
      })
      .catch(() => {
        if (active) setEntry(null);
      });

    return () => {
      active = false;
    };
  }, [isVisible, termId]);

  const label = entry?.term ?? humanizeKey(termId);
  const definition = entry?.definition;
  const tooltipOpen = open && Boolean(definition);

  const showOnHover = React.useCallback(() => {
    if (!canHover) return;
    setOpen(true);
  }, [canHover]);

  const hideOnHover = React.useCallback(() => {
    if (!canHover) return;
    setOpen(false);
  }, [canHover]);

  const toggleOnPress = React.useCallback(
    (event: React.MouseEvent | React.KeyboardEvent) => {
      if (canHover) return;
      event.preventDefault();
      setOpen((prev) => !prev);
    },
    [canHover]
  );

  React.useEffect(() => {
    if (!open || canHover) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open, canHover]);

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLSpanElement>) => {
      if (event.key === "Escape") {
        setOpen(false);
        return;
      }
      if (!canHover && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        setOpen((prev) => !prev);
      }
    },
    [canHover]
  );

  return (
    <span
      ref={containerRef}
      className={cn("relative inline-flex max-w-full align-baseline", className)}
      onMouseEnter={showOnHover}
      onMouseLeave={hideOnHover}
      onFocus={showOnHover}
      onBlur={hideOnHover}
      onClick={toggleOnPress}
      onKeyDown={handleKeyDown}
      role={!canHover ? "button" : undefined}
      tabIndex={!canHover ? 0 : undefined}
      aria-expanded={!canHover ? tooltipOpen : undefined}
      aria-haspopup="true"
      aria-describedby={tooltipOpen ? tooltipId : undefined}
    >
      <abbr
        className="cursor-help border-b border-dotted border-foreground/40 text-foreground no-underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        title={!canHover && definition ? definition : undefined}
      >
        {children ?? label}
      </abbr>
      {tooltipOpen ? (
        <span
          id={tooltipId}
          role="tooltip"
          className="absolute left-1/2 top-full z-40 mt-2 w-64 max-w-xs -translate-x-1/2 rounded-md border border-border bg-popover p-3 text-left text-sm shadow-lg"
        >
          <span className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {label}
          </span>
          <span className="mt-1 block text-sm leading-snug text-popover-foreground">{definition}</span>
        </span>
      ) : null}
    </span>
  );
}

export default DefinitionTooltip;
