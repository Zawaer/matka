import { describeError, errorLine } from "../error-copy";

describe("describeError", () => {
  it("never shows raw technical text", () => {
    const raw = "Can't reach the server: fetch failed: java.net.UnknownHostException: Unable to resolve host \"matka.lan\".";
    const c = describeError(raw);
    expect(c.title).toBe("Can't reach Matka");
    expect(c.body).toMatch(/Tailscale/);
    expect(c.body).not.toMatch(/java|Exception|fetch/);
  });
  it("tells timeouts, refusals and certificates apart", () => {
    expect(describeError("Can't reach the server: timeout.").body).toMatch(/in time/);
    expect(describeError("Can't reach the server: ECONNREFUSED.").body).toMatch(/restarting/);
    expect(describeError("Can't reach the server: java.security.cert.CertPathValidatorException: Trust anchor").title).toMatch(/securely/);
    expect(describeError("Can't reach the server: something odd.").body).toMatch(/connection/);
  });
  it("maps server answers", () => {
    expect(describeError("Server answered 502.").title).toBe("Matka is having trouble");
    expect(describeError("Server answered 404: not found.").title).toBe("Matka needs an update");
    expect(describeError("The server rejected this device's token (401).").title).toMatch(/paired/);
    expect(describeError(undefined).title).toBe("Something went wrong");
  });
  it("has a short line for status rows", () => {
    expect(errorLine("Can't reach the server: fetch failed: java.net.UnknownHostException")).toBe(
      "Your phone couldn't find the Matka server.",
    );
    expect(errorLine("Server answered 503.")).toBe("Matka is having trouble");
  });
});
