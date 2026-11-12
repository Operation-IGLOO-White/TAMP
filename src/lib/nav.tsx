import {
  Link as RouterLink,
  useLocation,
  useNavigate as useRouterNavigate,
} from "react-router-dom";
import { useCallback } from "react";
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

type LinkProps = Omit<ComponentProps<typeof RouterLink>, "to"> & {
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
  const { pathname, search: currentSearch } = useLocation();
  const href = buildHref(to, params, search);
  const [targetPath = href, targetQuery = ""] = href.split("?");

  const exact = activeOptions?.exact ?? false;
  const targetParams = new URLSearchParams(targetQuery);
  const currentParams = new URLSearchParams(currentSearch);
  const queryMatches = targetQuery
    ? [...targetParams.entries()].every(([key, value]) => currentParams.get(key) === value)
    : !exact || currentParams.size === 0;
  const pathMatches = exact
    ? pathname === targetPath
    : pathname === targetPath || pathname.startsWith(`${targetPath}/`);
  const isActive = pathMatches && queryMatches;

  const merged =
    isActive && activeProps?.className
      ? `${className ?? ""} ${activeProps.className}`.trim()
      : className;

  return <RouterLink to={href} className={merged} {...rest} />;
}

export function useNavigate() {
  const navigate = useRouterNavigate();
  return useCallback(
    (opts: { to: string; params?: Params; search?: Search; replace?: boolean }) => {
      navigate(buildHref(opts.to, opts.params, opts.search), { replace: opts.replace ?? false });
    },
    [navigate],
  );
}
