# GridPool Web

Static landing page for GridPool.

## Local Preview

```bash
python3 -m http.server 8080
```

Then open:

```text
http://127.0.0.1:8080/
```

## GitHub Pages

Recommended setup:

1. Create a dedicated GitHub repository for this folder.
2. Push this folder as the repository root.
3. In repository settings, enable GitHub Pages from the `main` branch root.
4. Set the custom domain to `gridpool.net`.
5. In Cloudflare, point `gridpool.net` at GitHub Pages per GitHub's Pages custom-domain instructions.
6. Enable "Enforce HTTPS" after GitHub finishes provisioning the certificate.

Cloudflare DNS records for an apex-domain GitHub Pages site:

```text
Type  Name  Value
A     @     185.199.108.153
A     @     185.199.109.153
A     @     185.199.110.153
A     @     185.199.111.153
CNAME www   gridlabs-science.github.io
```

Use the actual GitHub Pages default domain for the repository if it differs from `gridlabs-science.github.io`.

Reference: https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site

The node UIs should stay on:

- `main.gridpool.net`
- `test.gridpool.net`

This root site is informational only. It is not the DATUM endpoint and it is not a GridPool node UI.
