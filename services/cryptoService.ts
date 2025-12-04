
import { ethers } from 'ethers';
import { BSC_RPC_URL, ERC20_ABI } from '../constants';
import { Token, VaultData } from '../types';

// Initialize provider
const provider = new ethers.JsonRpcProvider(BSC_RPC_URL);

// --- Vault Security (Simple Encryption for Demo) ---
// Note: In a production environment, use PBKDF2 + AES-GCM via window.crypto.subtle
// This is a simplified XOR-based obfuscation + JSON wrapper for demonstration purposes
// to ensure the app runs without external crypto libraries.

export const encryptVault = (data: VaultData, password: string): string => {
  const json = JSON.stringify(data);
  const result = [];
  for (let i = 0; i < json.length; i++) {
    const charCode = json.charCodeAt(i) ^ password.charCodeAt(i % password.length);
    result.push(String.fromCharCode(charCode));
  }
  return btoa(result.join('')); // Base64 encode
};

export const decryptVault = (encryptedData: string, password: string): VaultData => {
  try {
    const decoded = atob(encryptedData);
    const result = [];
    for (let i = 0; i < decoded.length; i++) {
      const charCode = decoded.charCodeAt(i) ^ password.charCodeAt(i % password.length);
      result.push(String.fromCharCode(charCode));
    }
    return JSON.parse(result.join(''));
  } catch (e) {
    throw new Error("Invalid password or corrupted data");
  }
};

// --- Wallet Functions ---

export const createWallet = (): { address: string; privateKey: string; mnemonic: string } => {
  const wallet = ethers.Wallet.createRandom();
  return {
    address: wallet.address,
    privateKey: wallet.privateKey,
    mnemonic: wallet.mnemonic?.phrase || "",
  };
};

export const importWalletFromMnemonic = (mnemonic: string): { address: string; privateKey: string, mnemonic: string } => {
  const wallet = ethers.Wallet.fromPhrase(mnemonic);
  return {
    address: wallet.address,
    privateKey: wallet.privateKey,
    mnemonic: mnemonic
  };
};

export const importWalletFromPrivateKey = (privateKey: string): { address: string; privateKey: string } => {
  const wallet = new ethers.Wallet(privateKey);
  return {
    address: wallet.address,
    privateKey: wallet.privateKey,
  };
};

export const getNativeBalance = async (address: string): Promise<string> => {
  try {
    const balance = await provider.getBalance(address);
    return ethers.formatEther(balance);
  } catch (error) {
    console.error("Error fetching native balance:", error);
    return "0.0";
  }
};

export const getTokenBalance = async (address: string, tokenAddress: string): Promise<{ balance: string; decimals: number; symbol: string }> => {
  try {
    const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
    const [balance, decimals, symbol] = await Promise.all([
      contract.balanceOf(address),
      contract.decimals(),
      contract.symbol(),
    ]);
    return {
      balance: ethers.formatUnits(balance, decimals),
      decimals: Number(decimals),
      symbol: symbol
    };
  } catch (error) {
    console.error(`Error fetching token balance for ${tokenAddress}:`, error);
    return { balance: "0.0", decimals: 18, symbol: "???" };
  }
};

export const getBscTokenLogoUrl = (address: string): string => {
  try {
    const checksumAddress = ethers.getAddress(address);
    return `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/smartchain/assets/${checksumAddress}/logo.png`;
  } catch (e) {
    return "";
  }
};

export const fetchTokenInfo = async (tokenAddress: string): Promise<Partial<Token> | null> => {
  try {
    const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
    const [name, symbol, decimals] = await Promise.all([
      contract.name(),
      contract.symbol(),
      contract.decimals(),
    ]);
    
    // Generate logo URL
    const logoUrl = getBscTokenLogoUrl(tokenAddress);

    return {
      address: tokenAddress,
      name,
      symbol,
      decimals: Number(decimals),
      balance: "0.0",
      logoUrl: logoUrl
    };
  } catch (error) {
    console.error("Invalid token contract:", error);
    return null;
  }
};

export const sendToken = async (
  privateKey: string,
  toAddress: string,
  tokenAddress: string,
  amount: string
): Promise<string> => {
  const wallet = new ethers.Wallet(privateKey, provider);
  const contract = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);
  
  // Get decimals to format correct amount
  const decimals = await contract.decimals();
  const amountWei = ethers.parseUnits(amount, decimals);

  const tx = await contract.transfer(toAddress, amountWei);
  await tx.wait(); // Wait for confirmation
  return tx.hash;
};

export const formatAddress = (address: string): string => {
  return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
};
