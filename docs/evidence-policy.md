# Evidence Policy

LegxusAI accepts a narrow, public evidence reference format for the Phase 3 dispute workflow. It does not upload private browser files, create blob URLs, or proxy evidence through a centralized backend.

## Policy

- Policy version: `GITHUB_RAW_COMMIT_SHA256_V1`
- Provider: `GITHUB_RAW`
- Host: `raw.githubusercontent.com`
- Scheme: `https`
- URL form: `https://raw.githubusercontent.com/<owner>/<repository>/<lowercase-40-character-commit-sha>/<path>`
- Maximum claimant references: `3`
- Maximum respondent references: `3`
- Maximum combined references: `6`
- Maximum body size per reference: `2,000` UTF-8 bytes
- Accepted media: `text/*`, `application/json`, `application/xml`, and `application/*+json` or `application/*+xml`
- Query strings, fragments, credentials, redirects, mutable branch/blob URLs, and non-default ports are rejected.

The commit pin is provenance and reproducibility metadata, not a promise of permanent hosting. GitHub repository deletion, access changes, provider outages, or network failure can make a previously accepted reference unavailable to a validator.

## Metadata Schema

Every accepted reference is represented as `EVIDENCE_REFERENCE_V1`:

```text
{
  schema_version: "EVIDENCE_REFERENCE_V1",
  provider: "GITHUB_RAW",
  url: string,
  content_hash: lowercase SHA-256 hex string,
  mime_type: normalized media type,
  byte_size: positive integer <= 2000,
  source_id: "github:<owner>/<repository>@<commit>:<path>"
}
```

URLs and hashes must be unique within and across both parties. `source_id` is derived from the canonical URL, must be no longer than 320 characters, and is checked again by the contract. The browser and contract reject the same URL/source-ID boundaries before signing and at calldata validation.

## Verification Flow

1. The browser canonicalizes and validates the URL before making a request.
2. It retrieves the response with redirects disabled, rejects browser-visible redirects, checks status and media type, enforces the byte limit while reading, requires valid UTF-8, and rejects an empty body.
3. It computes SHA-256 and records the metadata above.
4. Immediately before the GenLayer write, the browser retrieves each reference again and requires hash, MIME, size, schema, provider, and source identifier equality.
5. `LegxusDisputeResolution.file_dispute` validates the structured metadata and rejects malformed, duplicate, unsupported, or inconsistent records.
6. During evaluation, both leader and validator independently retrieve the references inside `gl.vm.run_nondet_unsafe`, verify status, MIME, size, and SHA-256, and classify source failures explicitly before model execution.

If selected evidence cannot be reverified immediately before signing, the transaction is aborted before any wallet write. The selected references remain in the form so the user can retry or remove them. An evidence-free transaction is signed only after explicit confirmation and contains exactly `evidence=[]`.

## Failure Classes

Browser verification reports `INVALID_REFERENCE`, `DUPLICATE_REFERENCE`, `TOO_MANY_REFERENCES`, `NETWORK_ERROR`, `TIMEOUT`, `REDIRECT`, `HTTP_ERROR`, `EMPTY_RESPONSE`, `UNSUPPORTED_MEDIA`, `RESPONSE_TOO_LARGE`, `CONTENT_HASH_MISMATCH`, `CONTENT_SIZE_MISMATCH`, `CONTENT_MIME_MISMATCH`, `SOURCE_ID_MISMATCH`, `SCHEMA_MISMATCH`, or `PROVIDER_MISMATCH`. Contract-side retrieval records HTTP client/server errors, redirects, empty responses, unsupported media, oversized content, size mismatch, hash mismatch, and unavailable sources in its structured advisory result. The pinned GenVM response surface does not expose a final URL, so contract-side redirect classification is based on the returned 3xx status; browser redirect rejection is independently enforced with ordinary fetch redirect controls.

## Privacy And Retention

The URL, hash, MIME type, byte size, source identifier, and dispute context are public contract data. Do not submit confidential, personal, or access-controlled material. The hash proves what was retrieved at verification time; it does not make the source private, archive the bytes, or guarantee future availability.

## Tests

Run the deterministic browser policy suite:

```bash
npm run test:evidence
```

Run the labeled live-provider round trip separately:

```bash
RUN_EVIDENCE_NETWORK=1 npm run test:evidence
```

The live test uses a public commit-pinned GenVM documentation fixture below the 2,000-byte limit and asserts only URL, metadata shape, non-empty size, and hash format. It does not print response content. Contract metadata and failure behavior are covered by:

```bash
PYTHONPATH=/tmp/legxus-phase2-site python3 -m pytest tests/direct -v
```

Direct mode validates contract behavior in memory; it does not prove Studio or public multi-validator availability.
