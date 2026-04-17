# SPEAQ

**Private messaging with community rewards. Source-available, privacy-first.**

SPEAQ is a next-generation messenger built on a simple principle: your conversations are yours. End-to-end encryption is the default. No logs. No servers holding your content. No data brokers.

This repository contains the SPEAQ native application (React Native, iOS and Android) together with supporting modules.

## What SPEAQ offers

- Private one-to-one and group messaging
- Encrypted voice and video calls
- Photo, voice note, document and location sharing
- Personal on-device vault for notes and files
- Community rewards programme: earn credits for active participation
- Contact discovery via QR code, no phone number upload required

## Architecture overview

- Post-quantum cryptography: ML-KEM (FIPS 203) for key exchange, ML-DSA (FIPS 204) for signatures, AES-256-GCM for symmetric encryption
- Local-first design: messages and contacts never leave your device unencrypted
- No analytics, no tracking SDKs, no advertising identifiers
- Rewards credits stored locally on device

## Related repositories

- **SPEAQ Web and PWA:** [FvBokhorst/speaq-web](https://github.com/FvBokhorst/speaq-web)

## License

SPEAQ is **source-available** under the **Polyform Noncommercial License 1.0.0**.

You can read, inspect, fork, and improve the code. You can propose changes via pull requests. You cannot sell SPEAQ, offer it as a paid service, or use it in a commercial product. See [LICENSE](./LICENSE) for full terms.

For commercial licensing inquiries, contact `legal@thespeaq.com`.

Note: this is a source-available license, not an OSI-approved open-source license. It is deliberately chosen to protect the community spirit of SPEAQ against commercial exploitation.

## Contributing

Suggestions and improvements are welcome. Please open an issue first to discuss what you would like to change. Pull requests against the `main` branch are reviewed on a best-effort basis. By contributing, you agree that your contributions are licensed under the same Polyform Noncommercial License 1.0.0.

## Privacy

SPEAQ does not collect any personal data from its users. See the full privacy policy at [thespeaq.com/privacy](https://thespeaq.com/privacy).

## Security disclosure

If you believe you have found a security vulnerability, please report it responsibly via `security@thespeaq.com`. Do not open a public issue for suspected vulnerabilities. We respond within three business days.

---

By the people. For the people.
