
import { ethers } from 'ethers';
import { ERC20_ABI, ROUTER_ABI } from '../constants';
import { Token, VaultData, Network, Transaction } from '../types';

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
    
    let path = [tokenIn.address, tokenOut.address];
    
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

// Helper for fetching with enhanced retry and rate limit handling
const fetchWithRetry = async (url: string, retries = 3, delayMs = 1500): Promise<any> => {
  for (let i = 0; i < retries; i++) {
    try {
      // Add timestamp to prevent caching of previous 404/empty results
      const separator = url.includes('?') ? '&' : '?';
      const urlWithCacheBust = `${url}${separator}_t=${Date.now()}`;

      const response = await fetch(urlWithCacheBust);
      if (!response.ok) {
        throw new Error(`HTTP Error ${response.status}`);
      }
      const data = await response.json();
      
      // Explicitly handle "No transactions found" as a SUCCESS case with empty result
      if (data.status === '0' && data.message === 'No transactions found') {
        return { status: '1', result: [] };
      }

      // Check for rate limit response from Etherscan-like APIs
      // Message often: "NOTOK", Result: "Max rate limit reached"
      if (data.status === '0' && data.message === 'NOTOK' && (data.result?.toLowerCase().includes('rate limit') || data.result?.toLowerCase().includes('busy'))) {
        throw new Error('RATE_LIMIT');
      }
      
      return data;
    } catch (e: any) {
      const isRateLimit = e.message === 'RATE_LIMIT';
      // If it's the last retry, return default empty
      if (i === retries - 1) {
        console.warn(`Fetch failed after ${retries} attempts (${e.message}): ${url}`);
        return { status: '0', result: [] };
      }
      
      // Exponential backoff, longer if rate limited
      const waitTime = isRateLimit ? delayMs * 2 * (i + 1) : delayMs;
      await new Promise(r => setTimeout(r, waitTime));
    }
  }
  return { status: '0', result: [] };
};

export const fetchTransactions = async (address: string, network: Network): Promise<Transaction[]> => {
  if (!network.apiBaseUrl) return [];
  
  let allTxs: Transaction[] = [];

  // --- 1. Fetch Normal Transactions (Native Coin Transfers) ---
  try {
    const normalTxUrl = `${network.apiBaseUrl}?module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&sort=desc&page=1&offset=50`;
    const normalRes = await fetchWithRetry(normalTxUrl);

    if (normalRes.status === "1" && Array.isArray(normalRes.result)) {
      const mapped = normalRes.result.map((tx: any) => ({
        hash: tx.hash,
        from: tx.from,
        to: tx.to,
        value: tx.value,
        timeStamp: parseInt(tx.timeStamp),
        isError: tx.isError,
        gasUsed: tx.gasUsed,
        tokenSymbol: network.symbol, // Use network symbol for native txs
        tokenDecimal: 18
      }));
      allTxs = allTxs.concat(mapped);
    }
  } catch (error) {
    console.warn("Failed to fetch normal transactions. Proceeding to tokens.", error);
  }

  // CRITICAL: Significant delay to reset rate limit bucket before next call.
  // Free public APIs typically allow ~1 call per 5 seconds per IP if heavily loaded.
  await new Promise(r => setTimeout(r, 2500)); 

  // --- 2. Fetch BEP20/ERC20 Token Transfer Events ---
  try {
    const tokenTxUrl = `${network.apiBaseUrl}?module=account&action=tokentx&address=${address}&startblock=0&endblock=99999999&sort=desc&page=1&offset=50`;
    const tokenRes = await fetchWithRetry(tokenTxUrl);

    if (tokenRes.status === "1" && Array.isArray(tokenRes.result)) {
      const mapped = tokenRes.result.map((tx: any) => ({
        hash: tx.hash,
        from: tx.from,
        to: tx.to,
        value: tx.value,
        timeStamp: parseInt(tx.timeStamp),
        isError: "0", // Token events usually imply success if present in logs
        gasUsed: tx.gasUsed,
        tokenSymbol: tx.tokenSymbol,
        tokenDecimal: parseInt(tx.tokenDecimal || "18")
      }));
      allTxs = allTxs.concat(mapped);
    }
  } catch (error) {
    console.warn("Failed to fetch token transactions.", error);
  }

  // --- 3. Merge and Deduplicate ---
  try {
    // Sort combined list by timestamp descending
    // Filter duplicates using composite key (Hash + Symbol) to allow showing both Native fee/value AND Token value for same Tx
    const uniqueTxs = Array.from(new Map(allTxs.map(item => [item.hash + (item.tokenSymbol || "native"), item])).values());
    
    return uniqueTxs.sort((a, b) => b.timeStamp - a.timeStamp).slice(0, 50);
  } catch (e) {
    console.error("Error processing transactions", e);
    return [];
  }
};
