
export interface Token {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  balance: string;
  logoUrl?: string;
  isNative?: boolean;
  chainId?: number;
}

export interface Network {
  name: string;
  rpcUrl: string;
  chainId: number;
  symbol: string; // Native currency symbol (e.g., BNB, ETH)
  explorerUrl: string;
  routerAddress?: string; // For swapping
  apiBaseUrl?: string; // For fetching transaction history
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
  customNetworks?: Network[];
}

export interface Transaction {
  hash: string;
  from: string;
  to: string;
  value: string;
  timeStamp: number;
  isError: string;
  gasUsed: string;
  tokenSymbol?: string;
  tokenDecimal?: number;
}

export enum ViewState {
  LANDING = 'LANDING',
  SETUP_PASSWORD = 'SETUP_PASSWORD',
  UNLOCK = 'UNLOCK',
  ONBOARDING = 'ONBOARDING',
  SEED_BACKUP = 'SEED_BACKUP',
  SEED_VERIFY = 'SEED_VERIFY',
  DASHBOARD = 'DASHBOARD',
  SEND = 'SEND',
  SWAP = 'SWAP',
  RECEIVE = 'RECEIVE',
  IMPORT_TOKEN = 'IMPORT_TOKEN',
  WALLET_DETAILS = 'WALLET_DETAILS',
  BROWSER = 'BROWSER',
  ADD_NETWORK = 'ADD_NETWORK',
  TRANSACTIONS = 'TRANSACTIONS',
  RESET_WALLET = 'RESET_WALLET',
}
