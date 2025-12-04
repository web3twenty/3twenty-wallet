
export interface Token {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  balance: string;
  logoUrl?: string;
  isNative?: boolean;
}

export interface WalletAccount {
  id: string;
  name: string;
  address: string;
  privateKey: string;
  mnemonic?: string;
}

export interface VaultData {
  wallets: WalletAccount[];
  customTokens: Token[];
}

export enum ViewState {
  SETUP_PASSWORD = 'SETUP_PASSWORD',
  UNLOCK = 'UNLOCK',
  ONBOARDING = 'ONBOARDING',
  SEED_BACKUP = 'SEED_BACKUP',
  SEED_VERIFY = 'SEED_VERIFY',
  DASHBOARD = 'DASHBOARD',
  SEND = 'SEND',
  RECEIVE = 'RECEIVE',
  IMPORT_TOKEN = 'IMPORT_TOKEN',
  WALLET_DETAILS = 'WALLET_DETAILS',
}
