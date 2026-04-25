/**
 * SPEAQ Relay Server
 * PRD Section 4.2, 4.4
 *
 * Zero knowledge relay: server sees ONLY encrypted blobs.
 * No message storage (fire-and-forget).
 * Offline queue: max 7 days, then deleted.
 *
 * The server NEVER knows:
 * - Message content
 * - Who is talking to whom (only SPEAQ IDs, not real identities)
 * - Message length (padded to fixed blocks)
 */
export {};
