// Collector-specific pieces (Recorder, Settings, Pairing) on top of the design system.

import { Button, Banner } from "./primitives";

/** Shown on every tab after a 401: the token was revoked or is invalid. */
export function PairingLostBanner({ onPair }: { onPair: () => void }) {
  return (
    <Banner
      tone="danger"
      icon="unlink"
      title="Pairing lost"
      message="The server rejected this phone's token, so uploads are paused. Points stay queued. Pair again from Devices in the web app."
    >
      <Button label="Pair again" icon="qr" variant="tonal" tone="danger" size="sm" onPress={onPair} />
    </Banner>
  );
}
