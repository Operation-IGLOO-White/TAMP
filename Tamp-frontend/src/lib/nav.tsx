"use client";

// Navigation compatibility layer for the Next.js migration. It re-implements
// the small slice of the TanStack Router API the app used (`Link` with
// `to`/`params`/`search`/`activeProps`, and `useNavigate`) on top of next/link
// and next/navigation, so the call sites did not have to change.
import NextLink from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ComponentProps, MouseEventHandler, ReactNode } from "react";

type Params = Record<string, string | number>;
type Search = Record<string, unknown>;

export function buildHref(to: string, params?: Params, search?: Search): string {
  let path = to;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      path = path.replace(`$${k}`, encodeURIComponent(String(v)));
    }
  }
  if (search) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(search)) {
      if (v === undefined || v === null || v === "") continue;
      qs.set(k, String(v));
    }
    const s = qs.toString();
    if (s) path += `?${s}`;
  }
  return path;
}

type LinkProps = Omit<ComponentProps<typeof NextLink>, "href"> & {
  to: string;
  params?: Params;
  search?: Search;
  activeOptions?: { exact?: boolean };
  activeProps?: { className?: string };
  className?: string;
  children?: ReactNode;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
};

export function Link({
  to,
  params,
  search,
  activeOptions,
  activeProps,
  className,
  ...rest
}: LinkProps) {
  const pathname = usePathname();
  const href = buildHref(to, params, search);
  const targetPath = href.split("?")[0] ?? href;

  const exact = activeOptions?.exact ?? false;
  const isActive = exact
    ? pathname === targetPath
    : pathname === targetPath || pathname.startsWith(`${targetPath}/`);

  const merged =
    isActive && activeProps?.className
      ? `${className ?? ""} ${activeProps.className}`.trim()
      : className;

  return <NextLink href={href} className={merged} {...rest} />;
}

export function useNavigate() {
  const router = useRouter();
  return (opts: { to: string; params?: Params; search?: Search; replace?: boolean }) => {
    const href = buildHref(opts.to, opts.params, opts.search);
    if (opts.replace) router.replace(href);
    else router.push(href);
  };
}
