declare module "crystals-kyber" {
  export function KeyGen768(): Promise<[Uint8Array, Uint8Array]>;
  export function Encrypt768(publicKey: Uint8Array): Promise<[Uint8Array, Uint8Array]>;
  export function Decrypt768(ciphertext: Uint8Array, privateKey: Uint8Array): Promise<Uint8Array>;
}
