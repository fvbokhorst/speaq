/**
 * Push service: silent push trigger + rate limiting.
 *
 * Silent push = data-only payload with no content. Service Worker on the
 * client decides what notification to show (e.g. "new message"). The relay
 * never sees or transmits the message body.
 */
export declare function configurePush(opts: {
    publicKey: string;
    privateKey: string;
    subject: string;
}): void;
export declare function isConfigured(): boolean;
export declare function triggerSilentPush(speaqId: string): Promise<void>;
