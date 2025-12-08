
import { Network, Token } from './types';

export const TOKEN_3TWENTY_ADDRESS = "0x2ffbdfa8638422bf3a5134434387b8fb5962da2c";
export const TOKEN_3TWENTY_SYMBOL = "3TWENTY";
export const TOKEN_3TWENTY_DECIMALS = 18;

// Embedded SVG for 3Pay Logo (Gold Icon + Text)
export const HEADER_LOGO_URL = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyMDAgNjAiPgoJPGRlZnM+CgkJPGxpbmVhckdyYWRpZW50IGlkPSJnb2xkR3JhZCIgeDE9IjAlIiB5MT0iMCUiIHgyPSIxMDAlIiB5Mj0iMTAwJSI+CgkJCTxzdG9wIG9mZnNldD0iMCUiIHN0eWxlPSJzdG9wLWNvbG9yOiNGRkQ3MDA7IiAvPgoJCQk8c3RvcCBvZmZzZXQ9IjUwJSIgc3R5bGU9InN0b3AtY29sb3I6I0YzQzUzMDsiIC8+CgkJCTxzdG9wIG9mZnNldD0iMTAwJSIgc3R5bGU9InN0b3AtY29sb3I6I0ZGRDcwMDsiIC8+CgkJPC9saW5lYXJHcmFkaWVudD4KCTwvZGVmcz4KCTwhLS0gSWNvbiBDaXJjbGUgLS0+Cgk8Y2lyY2xlIGN4PSIzMCIgY3k9IjMwIiByPSIyNSIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJ1cmwoI2dvbGRHcmFkKSIgc3Ryb2tlLXdpZHRoPSIzIiAvPgoJPHRleHQgeD0iMzAiIHk9IjQyIiBmb250LWZhbWlseT0iYXJpYWwsIHNhbnMtc2VyaWYiIGZvbnQtd2VpZ2h0PSJib2xkIiBmb250LXNpemU9IjMyIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSJ1cmwoI2dvbGRHcmFkKSI+MzwvdGV4dD4KCTwhLS0gVGV4dCAtLT4KCTx0ZXh0IHg9IjY1IiB5PSI0MiIgZm9udC1mYW1pbHk9ImFyaWFsLCBzYW5zLXNlcmlmIiBmb250LXdlaWdodD0iYm9sZCIgZm9udC1zaXplPSIzNCIgZmlsbD0idXJsKCNnb2xkR3JhZCkiPlBheTwvdGV4dD4KPC9zdmc+";

export const NETWORKS: Network[] = [
  {
    name: "Binance Smart Chain",
    rpcUrl: "https://bsc-dataseed.binance.org/",
    chainId: 56,
    symbol: "BNB",
    explorerUrl: "https://bscscan.com",
    routerAddress: "0x10ED43C718714eb63d5aA57B78B54704E256024E" // PancakeSwap V2
  },
  {
    name: "Ethereum Mainnet",
    rpcUrl: "https://eth.llamarpc.com",
    chainId: 1,
    symbol: "ETH",
    explorerUrl: "https://etherscan.io",
    routerAddress: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D" // Uniswap V2
  },
  {
    name: "Polygon",
    rpcUrl: "https://polygon-rpc.com",
    chainId: 137,
    symbol: "MATIC",
    explorerUrl: "https://polygonscan.com",
    routerAddress: "0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff" // QuickSwap
  },
  {
    name: "Avalanche C-Chain",
    rpcUrl: "https://api.avax.network/ext/bc/C/rpc",
    chainId: 43114,
    symbol: "AVAX",
    explorerUrl: "https://snowtrace.io",
    routerAddress: "0x60aE616a2155Ee3d9A68541Ba4544862310933d4" // Trader Joe (standard router interface vary, simplified for V2 compatible)
  }
];

export const ERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address to, uint amount) returns (bool)",
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "event Transfer(address indexed from, address indexed to, uint amount)"
];

export const ROUTER_ABI = [
  "function getAmountsOut(uint amountIn, address[] memory path) public view returns (uint[] memory amounts)",
  "function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)",
  "function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory amounts)",
  "function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)"
];

// Using TrustWallet Assets for official logos
const ASSET_REPO = "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains";

export const DEFAULT_TOKENS: Token[] = [
  // BSC Tokens (Chain 56)
  {
    address: TOKEN_3TWENTY_ADDRESS,
    symbol: "3TWENTY",
    name: "3Twenty Coin",
    decimals: 18,
    logoUrl: "",
    balance: "0",
    chainId: 56
  },
  {
    address: "0x0000000000000000000000000000000000000000",
    symbol: "BNB",
    name: "Binance Coin",
    decimals: 18,
    logoUrl: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/binance/info/logo.png",
    isNative: true,
    balance: "0",
    chainId: 56
  },
  {
    address: "0x55d398326f99059fF775485246999027B3197955",
    symbol: "USDT",
    name: "Tether USD",
    decimals: 18,
    logoUrl: `${ASSET_REPO}/smartchain/assets/0x55d398326f99059fF775485246999027B3197955/logo.png`,
    balance: "0",
    chainId: 56
  },
  // ETH Tokens (Chain 1)
  {
    address: "0x0000000000000000000000000000000000000000",
    symbol: "ETH",
    name: "Ethereum",
    decimals: 18,
    logoUrl: `${ASSET_REPO}/ethereum/info/logo.png`,
    isNative: true,
    balance: "0",
    chainId: 1
  },
  // Polygon Tokens (Chain 137)
  {
    address: "0x0000000000000000000000000000000000000000",
    symbol: "MATIC",
    name: "Polygon",
    decimals: 18,
    logoUrl: `${ASSET_REPO}/polygon/info/logo.png`,
    isNative: true,
    balance: "0",
    chainId: 137
  }
];

export const TOKEN_LOGO_OVERRIDES: {[key: string]: string} = {
  // 3Twenty Coin Custom Logo
  "0x2ffbdfa8638422bf3a5134434387b8fb5962da2c": "https://i.imgur.com/8Y64vWz.png"
};

export const SOCIAL_LINKS = {
  twitter: "https://twitter.com/3twentycoin",
  telegram: "https://t.me/3twentycoin",
  discord: "https://discord.gg/3twenty",
  website: "https://3twenty.io"
};

export const DAPP_LIST = [
  {
    name: "PancakeSwap",
    description: "The #1 AMM and yield farm on Binance Smart Chain.",
    url: "https://pancakeswap.finance",
    category: "DeFi",
    color: "from-cyan-400 to-blue-500"
  },
  {
    name: "Venus Protocol",
    description: "Decentralized money market for lending and borrowing.",
    url: "https://venus.io",
    category: "Lending",
    color: "from-yellow-400 to-orange-500"
  },
  {
    name: "OpenSea BNB",
    description: "Explore, collect, and sell NFTs on BSC.",
    url: "https://opensea.io/assets/bsc",
    category: "NFT",
    color: "from-blue-500 to-indigo-600"
  },
  {
    name: "BiSwap",
    description: "DEX with the lowest transaction fees on BSC.",
    url: "https://biswap.org",
    category: "DeFi",
    color: "from-red-400 to-pink-600"
  },
  {
    name: "PinkSale",
    description: "The launchpad protocol for everyone.",
    url: "https://pinksale.finance",
    category: "Launchpad",
    color: "from-pink-400 to-rose-500"
  },
  {
    name: "Alpaca Finance",
    description: "Lending protocol allowing leveraged yield farming.",
    url: "https://alpacafinance.org",
    category: "DeFi",
    color: "from-green-400 to-emerald-600"
  }
];
