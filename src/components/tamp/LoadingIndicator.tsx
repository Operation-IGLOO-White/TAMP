export function LoadingIndicator() {
  return <div role="status" aria-label="Loading" className="route-loading-track">
    <span className="route-loading-bar" />
    <span className="sr-only">Loading</span>
  </div>;
}
