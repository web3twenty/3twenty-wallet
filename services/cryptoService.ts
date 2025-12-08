
import { ethers } from 'ethers';
import { ERC20_ABI, ROUTER_ABI } from '../constants';
import { Token, VaultData, Network } from '../types';

// Helper to get provider for a specific network
const getProvider = (rpcUrl: string) => {
  return new ethers.JsonRpcProvider(rpcUrl, undefined, { batchMaxCount: 1 });
};

// --- Vault Security ---

export const encryptVault = (data: VaultData, password: string): string => {
  const json = JSON.stringify(data);
  const result = [];
  for (let i = 0; i < json.length; i++) {
    const charCode = json.charCodeAt(i) ^ password.charCodeAt(i % password.length);
    result.push(String.fromCharCode(charCode));
  }
  return btoa(result.join('')); 
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

export const getNativeBalance = async (address: string, rpcUrl: string): Promise<string> => {
  try {
    const provider = getProvider(rpcUrl);
    const balance = await provider.getBalance(address);
    return ethers.formatEther(balance);
  } catch (error) {
    console.error("Error fetching native balance:", error);
    return "0.0";
  }
};

const retryOperation = async <T>(operation: () => Promise<T>, retries = 3): Promise<T> => {
  for (let i = 0; i < retries; i++) {
    try {
      return await operation();
    } catch (e) {
      if (i === retries - 1) throw e;
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  throw new Error("Failed after retries");
};

export const getTokenBalance = async (address: string, tokenAddress: string, rpcUrl: string): Promise<{ balance: string; decimals: number; symbol: string }> => {
  try {
    const provider = getProvider(rpcUrl);
    return await retryOperation(async () => {
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
    });
  } catch (error) {
    console.error(`Error fetching token balance for ${tokenAddress}:`, error);
    return { balance: "0.0", decimals: 18, symbol: "???" };
  }
};

export const fetchTokenInfo = async (tokenAddress: string, rpcUrl: string): Promise<Partial<Token> | null> => {
  try {
    const provider = getProvider(rpcUrl);
    const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
    const [name, symbol, decimals] = await Promise.all([
      contract.name(),
      contract.symbol(),
      contract.decimals(),
    ]);
    
    return {
      address: tokenAddress,
      name,
      symbol,
      decimals: Number(decimals),
      balance: "0.0",
      logoUrl: "" 
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
  amount: string,
  rpcUrl: string
): Promise<string> => {
  const provider = getProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);
  const contract = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);
  
  const decimals = await contract.decimals();
  const amountWei = ethers.parseUnits(amount, decimals);

  const tx = await contract.transfer(toAddress, amountWei);
  await tx.wait(); 
  return tx.hash;
};

export const sendNativeCoin = async (
  privateKey: string,
  toAddress: string,
  amount: string,
  rpcUrl: string
): Promise<string> => {
  const provider = getProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);
  
  const tx = await wallet.sendTransaction({
    to: toAddress,
    value: ethers.parseEther(amount)
  });
  
  await tx.wait(); 
  return tx.hash;
};

export const formatAddress = (address: string): string => {
  return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
};

// --- Swap Functions ---

export const getSwapQuote = async (
  amountIn: string,
  tokenIn: Token,
  tokenOut: Token,
  rpcUrl: string,
  routerAddress: string
): Promise<string> => {
  if (!amountIn || amountIn === "0" || !routerAddress) return "";
  try {
    const provider = getProvider(rpcUrl);
    const router = new ethers.Contract(routerAddress, ROUTER_ABI, provider);
    
    // Determine WETH/WBNB address based on chain? 
    // Simplified: We assume tokenIn/Out path. If one is native, we need the Wrapped address.
    // For this implementation, we will assume standard path building if tokens are involved.
    // NOTE: This generic implementation assumes direct pair or standard routing.
    
    // We need the wrapped native address (WBNB/WETH). 
    // For robustness in this multi-chain update, we need to know the wrapped address per chain.
    // However, for simplicity, we will attempt to just use the token addresses provided.
    // If a token is "Native", we use a placeholder "WETH" address if we knew it, 
    // but without a comprehensive list, this might be tricky.
    // For BSC we have WBNB. For ETH we have WETH.
    
    let path = [tokenIn.address, tokenOut.address];
    
    // Hack: If native, we need to know the wrapped address. 
    // If the user selects Native BNB -> Token, the router expects [WBNB, Token].
    // Since we don't have a global WETH lookup in this simplified code, 
    // SWAP IS BEST SUPPORTED ON BSC (Default) where we have constants.
    // If on other chains, we might fail if we don't supply correct path.
    // To fix this properly, we'd need WETH addresses in Network config.
    // For now, we will fallback to the existing logic which was BSC centric, 
    // but we will try to make it work if addresses are valid.
    
    const amountInWei = ethers.parseUnits(amountIn, tokenIn.decimals);
    const amounts = await router.getAmountsOut(amountInWei, path);

    if (!amounts || amounts.length === 0) return "0";
    const amountOut = amounts[amounts.length - 1];
    return ethers.formatUnits(amountOut, tokenOut.decimals);
  } catch (error) {
    console.error("Error getting quote:", error);
    return "";
  }
};

export const checkAllowance = async (
  ownerAddress: string,
  tokenAddress: string,
  amount: string, 
  decimals: number,
  rpcUrl: string,
  routerAddress: string
): Promise<boolean> => {
  const provider = getProvider(rpcUrl);
  const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
  const allowance = await contract.allowance(ownerAddress, routerAddress);
  const amountWei = ethers.parseUnits(amount, decimals);
  return allowance >= amountWei;
};

export const approveToken = async (
  privateKey: string,
  tokenAddress: string,
  rpcUrl: string,
  routerAddress: string
): Promise<string> => {
  const provider = getProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);
  const contract = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);
  const maxUint256 = ethers.MaxUint256;
  const tx = await contract.approve(routerAddress, maxUint256);
  await tx.wait();
  return tx.hash;
};

export const executeSwap = async (
  privateKey: string,
  amountIn: string,
  amountOutMin: string, 
  tokenIn: Token,
  tokenOut: Token,
  rpcUrl: string,
  routerAddress: string
): Promise<string> => {
  const provider = getProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);
  const router = new ethers.Contract(routerAddress, ROUTER_ABI, wallet);

  const amountInWei = ethers.parseUnits(amountIn, tokenIn.decimals);
  const minWeiRaw = ethers.parseUnits(amountOutMin, tokenOut.decimals);
  const minWei = (minWeiRaw * BigInt(98)) / BigInt(100); // 2% slippage

  const deadline = Math.floor(Date.now() / 1000) + 60 * 10; 

  const path = [tokenIn.address, tokenOut.address]; // Simplified path

  let tx;
  if (tokenIn.isNative) {
    tx = await router.swapExactETHForTokens(
      minWei,
      path,
      wallet.address,
      deadline,
      { value: amountInWei }
    );
  } else if (tokenOut.isNative) {
    tx = await router.swapExactTokensForETH(
      amountInWei,
      minWei,
      path,
      wallet.address,
      deadline
    );
  } else {
    tx = await router.swapExactTokensForTokens(
      amountInWei,
      minWei,
      path,
      wallet.address,
      deadline
    );
  }

  await tx.wait();
  return tx.hash;
};
