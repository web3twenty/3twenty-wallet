
export const BSC_RPC_URL = "https://bsc-dataseed.binance.org/";
export const CHAIN_ID = 56;

export const TOKEN_3TWENTY_ADDRESS = "0x2ffbdfa8638422bf3a5134434387b8fb5962da2c";
export const TOKEN_3TWENTY_SYMBOL = "3TWENTY";
export const TOKEN_3TWENTY_DECIMALS = 18; // Assuming 18, standard for BSC

export const ERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address to, uint amount) returns (bool)",
  "event Transfer(address indexed from, address indexed to, uint amount)"
];

// Using TrustWallet Assets for official logos
const ASSET_REPO = "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/smartchain/assets";

export const DEFAULT_TOKENS = [
  {
    address: TOKEN_3TWENTY_ADDRESS,
    symbol: "3TWENTY",
    name: "3Twenty Coin",
    decimals: 18,
    logoUrl: "" // Will fallback to generated gradient or custom URL if available later
  },
  {
    address: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
    symbol: "WBNB",
    name: "Wrapped BNB",
    decimals: 18,
    logoUrl: `${ASSET_REPO}/0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c/logo.png`
  },
  {
    address: "0x55d398326f99059fF775485246999027B3197955",
    symbol: "USDT",
    name: "Tether USD",
    decimals: 18,
    logoUrl: `${ASSET_REPO}/0x55d398326f99059fF775485246999027B3197955/logo.png`
  }
];
