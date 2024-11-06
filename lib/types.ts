export type StealthKeys = {
    spendingPublicKey: string;
    viewingPublicKey: string;
    spendingPrivateKey?: string;
    viewingPrivateKey?: string;
  };
  
  export type TokenType = 'ETH' | 'USDT' | 'USDC';
  
  export type StealthEvent = {
    schemeId: string;
    stealthAddress: string;
    caller: string;
    ephemeralPubKey: string;
    metadata: string;
    valueInEther: string;
  };