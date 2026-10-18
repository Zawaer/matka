# Bundled CA certificates

Release builds of the app trust the system certificate store plus every `*.crt` / `*.pem`
in this folder (see `plugins/withUserCerts.js`). Put a private CA's **root certificate**
here when your Matka server uses one, e.g. the homelab's Caddy local authority:

    docker exec caddy cat /data/caddy/pki/authorities/local/root.crt > mobile/certs/homelab-caddy-root.crt

Only public certificates belong here, never a private key. Leave the folder without
certificates for servers with public TLS (the k3s cluster).
