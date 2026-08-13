# Submission security boundary

KwikShack's founding-builder submission surface uses one existing shared secret, `KWIKSHACK_SUBMIT_KEY`. It is an invitation gate, not user authentication or proof of creator ownership.

## Production requirements

- Set a long, randomly generated `KWIKSHACK_SUBMIT_KEY`. Production build and screenshot POSTs fail closed when it is absent.
- Give the key only to invited builders through a private channel. Rotate it if it is posted publicly or a builder should lose access.
- Keep adapter-node's `BODY_SIZE_LIMIT` at least `6M`. The endpoints apply narrower limits: 1MB build JSON and 5MB screenshot files.
- Keep `UPLOADS_DIR` on the persistent mounted volume and monitor its size.

The browser form holds the key only in component memory and sends it in `x-kwikshack-key` to both POST endpoints. The companion already supports the same header.

## Enforced boundaries

- Production POSTs fail closed without the configured key.
- Build submissions and uploads have bounded, process-local IP rate limits.
- Build metadata, manifest size/counts, placement arrays, and screenshot counts are bounded.
- Manifest and top-level blueprint codes must match.
- Public submissions are create-once by share code and cannot overwrite an existing build.
- Build records can reference only generated local screenshot URLs.
- Uploads accept only signature-checked JPEG/PNG raster files up to 5MB, 4096px per edge, and 20 megapixels.
- The browser form redraws screenshots to JPEG before upload, reducing dimensions and removing ordinary image metadata.
- Uploaded files are served with `nosniff`, a sandboxed content security policy, and immutable UUID names.

## Known limits requiring an operational or architectural decision

- The shared key does not identify which builder acted and cannot support ownership, revocation per creator, or secure edits. Creator identity/authentication is required for that.
- Rate limits are in one server process and reset on restart. They do not coordinate across replicas.
- Correct per-client limiting behind Railway depends on a trustworthy client-address header/proxy configuration. Do not trust a caller-controlled forwarding header without confirming the proxy overwrites it.
- Uploads happen before the build POST, so abandoned form sessions leave orphan files. Add a referenced-file cleanup job or upload-finalization model before volume grows materially.
- Direct API uploads are validated but not re-encoded server-side, so an invited key holder can upload a valid raster that retains EXIF metadata. Server-side decoding/re-encoding would require an image-processing dependency or service.
- Submitted manifests are structurally validated, not independently resolved by the server. In particular, the current self-learning decor record mapping still trusts submitted `recordID`/`itemID` pairs.
- There is intentionally no public update/delete path. Corrections remain an operator task until authenticated ownership exists.
