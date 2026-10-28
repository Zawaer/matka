// Plain-language versions of request errors. The raw messages
// ("Can't reach the server: fetch failed: java.net.UnknownHostException…")
// are for logs; people get what happened and what to do.

export type ErrorCopy = { title: string; body: string };

const KEPT = "Nothing is lost; your phone keeps what it recorded.";

export function describeError(raw: string | null | undefined): ErrorCopy {
  const m = raw ?? "";
  if (/rejected (this|this device's) token|\b401\b/i.test(m)) {
    return { title: "This phone isn't paired any more", body: "Pair it again from Devices on the Matka website." };
  }
  if (/^Can't reach the server|network request failed|fetch failed/i.test(m)) {
    if (/UnknownHost|resolve host|ENOTFOUND|EAI_AGAIN|No address associated/i.test(m)) {
      return {
        title: "Can't reach Matka",
        body: `Your phone couldn't find the Matka server. Check that you're online and that Tailscale or your VPN is on. ${KEPT}`,
      };
    }
    if (/time(d)? ?out|ETIMEDOUT|SocketTimeout|aborted/i.test(m)) {
      return { title: "Can't reach Matka", body: `Matka didn't answer in time. Try again in a moment. ${KEPT}` };
    }
    if (/refused|ECONNREFUSED|reset|ECONNRESET/i.test(m)) {
      return { title: "Can't reach Matka", body: `Matka isn't answering; it may be restarting. Try again in a minute. ${KEPT}` };
    }
    if (/certif|SSL|TLS|trust anchor|CertPath/i.test(m)) {
      return {
        title: "Can't reach Matka securely",
        body: `Your phone doesn't trust the server's certificate. ${KEPT}`,
      };
    }
    return { title: "Can't reach Matka", body: `Check your connection and try again. ${KEPT}` };
  }
  const status = /answered (\d{3})/.exec(m)?.[1];
  if (status) {
    const s = Number(status);
    if (s === 404) return { title: "Matka needs an update", body: "This server doesn't have what the app asked for yet." };
    if (s >= 500) return { title: "Matka is having trouble", body: `The server ran into a problem. Try again in a minute. ${KEPT}` };
    return { title: "Something went wrong", body: "The server didn't accept that request. Try again." };
  }
  if (/doesn't look like (Matka|a Matka)/i.test(m)) {
    return { title: "Unexpected answer", body: "That server doesn't look like Matka. Check the address it's paired with." };
  }
  return { title: "Something went wrong", body: `Try again in a moment. ${KEPT}` };
}

/** One short line for compact places (status rows, banners). */
export const errorLine = (raw: string | null | undefined) => {
  const c = describeError(raw);
  return c.title === "Can't reach Matka" ? c.body.split(". ")[0] + "." : c.title;
};
