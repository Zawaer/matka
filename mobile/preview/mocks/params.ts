// Preview switches from the page URL (see preview/README.md).
export const params =
  typeof location !== "undefined" ? new URLSearchParams(location.search) : new URLSearchParams();
export const flag = (k: string) => params.get(k) === "1";
