
import React, { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import { ViewState, WalletAccount, Token, VaultData, Network, Transaction } from './types';
import { 
  createWallet, 
  importWalletFromMnemonic, 
  importWalletFromPrivateKey, 
  getTokenBalance, 
  getNativeBalance,
  sendToken, 
  sendNativeCoin,
  fetchTokenInfo, 
  formatAddress,
  encryptVault,
  decryptVault,
  getSwapQuote,
  checkAllowance,
  approveToken,
  executeSwap,
  fetchTransactions,
  fetchTokenPrices
} from './services/cryptoService';
import { askGemini } from './services/geminiService';
import { DEFAULT_TOKENS, HEADER_LOGO_URL, DAPP_LIST, NETWORKS } from './constants';
import { Button } from './components/Button';
import { Card } from './components/Card';
import { TokenIcon } from './components/TokenIcon';
import { Footer } from './components/Footer';

export default function App() {
  // --- Global State ---
  const [view, setView] = useState<ViewState>(ViewState.UNLOCK);
  const [password, setPassword] = useState<string>("");
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  
  // --- Network State ---
  const [activeNetwork, setActiveNetwork] = useState<Network>(NETWORKS[0]);
  const [customNetworks, setCustomNetworks] = useState<Network[]>([]);

  // --- Vault State ---
  const [wallets, setWallets] = useState<WalletAccount[]>([]);
  const [activeWalletId, setActiveWalletId] = useState<string | null>(null);
  const [tokens, setTokens] = useState<Token[]>(DEFAULT_TOKENS);
  
  // --- UI State ---
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editNameInput, setEditNameInput] = useState("");

  // --- Input Forms ---
  const [setupPassword, setSetupPassword] = useState("");
  const [setupConfirm, setSetupConfirm] = useState("");
  const [unlockPassword, setUnlockPassword] = useState("");

  const [importInput, setImportInput] = useState("");
  const [sendAddress, setSendAddress] = useState("");
  const [sendAmount, setSendAmount] = useState("");
  const [selectedTokenForSend, setSelectedTokenForSend] = useState<Token | null>(null);
  
  // Import Token State
  const [importTokenAddress, setImportTokenAddress] = useState("");
  const [importTokenPreview, setImportTokenPreview] = useState<Token | null>(null);

  // Swap State
  const [swapTokenIn, setSwapTokenIn] = useState<Token | null>(null);
  const [swapTokenOut, setSwapTokenOut] = useState<Token | null>(null);
  const [swapAmountIn, setSwapAmountIn] = useState("");
  const [swapAmountOut, setSwapAmountOut] = useState("");
  const [swapNeedsApproval, setSwapNeedsApproval] = useState(false);
  const [isQuoting, setIsQuoting] = useState(false);

  // Transactions State
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isFetchingTxs, setIsFetchingTxs] = useState(false);

  // Add Network Form
  const [newNetName, setNewNetName] = useState("");
  const [newNetRpc, setNewNetRpc] = useState("");
  const [newNetChainId, setNewNetChainId] = useState("");
  const [newNetSymbol, setNewNetSymbol] = useState("");
  const [newNetExplorer, setNewNetExplorer] = useState("");

  const [authPassword, setAuthPassword] = useState(""); // For sensitive actions like exporting keys

  // Browser State
  const [browserUrl, setBrowserUrl] = useState("");
  const [browserPage, setBrowserPage] = useState(1);
  const BROWSER_ITEMS_PER_PAGE = 8;

  // --- Onboarding / Seed State ---
  const [tempWallet, setTempWallet] = useState<WalletAccount | null>(null);
  const [seedVerifyIndices, setSeedVerifyIndices] = useState<number[]>([]);
  const [seedVerifyInputs, setSeedVerifyInputs] = useState<{[key: number]: string}>({});
  
  // --- AI Chat ---
  const [showAiChat, setShowAiChat] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatHistory, setChatHistory] = useState<{ role: 'user' | 'model', text: string }[]>([]);
  const [isAiThinking, setIsAiThinking] = useState(false);

  const activeWallet = wallets.find(w => w.id === activeWalletId);

  // Filter tokens by active network
  const currentNetworkTokens = tokens.filter(t => t.chainId === activeNetwork.chainId);

  // Calculate Total Balance
  const totalFiatBalance = currentNetworkTokens.reduce((acc, token) => {
    const bal = parseFloat(token.balance);
    const price = token.priceUsd || 0;
    return acc + (bal * price);
  }, 0);

  // --- Initialization ---
  useEffect(() => {
    const vault = localStorage.getItem('3twenty_vault');
    if (!vault) {
      setView(ViewState.LANDING);
    } else {
      setView(ViewState.UNLOCK);
    }
  }, []);

  // --- Persistence ---
  const saveVault = useCallback((currentWallets: WalletAccount[], currentTokens: Token[], networks: Network[], currentPassword: string) => {
    if (!currentPassword) return;
    const vaultData: VaultData = {
      wallets: currentWallets,
      // Only save custom tokens (those not in default)
      customTokens: currentTokens.filter(t => !DEFAULT_TOKENS.find(dt => dt.address === t.address && dt.chainId === t.chainId)),
      customNetworks: networks
    };
    try {
      const encrypted = encryptVault(vaultData, currentPassword);
      localStorage.setItem('3twenty_vault', encrypted);
    } catch (e) {
      console.error("Failed to save vault", e);
    }
  }, []);

  useEffect(() => {
    if (password && wallets.length > 0) {
      saveVault(wallets, tokens, customNetworks, password);
    }
  }, [wallets, tokens, customNetworks, password, saveVault]);

  // --- Balance Fetching ---
  const fetchBalances = useCallback(async () => {
    if (!activeWallet) return;
    setIsLoading(true);
    // Fetch only for current network tokens
    const relevantTokens = tokens.filter(t => t.chainId === activeNetwork.chainId);
    const updatedTokens = [...tokens];

    // 1. Fetch Balances
    for (const token of relevantTokens) {
      try {
        let bal = "0";
        if (token.isNative) {
           bal = await getNativeBalance(activeWallet.address, activeNetwork.rpcUrl);
        } else {
           const balInfo = await getTokenBalance(activeWallet.address, token.address, activeNetwork.rpcUrl);
           bal = balInfo.balance;
        }
        // Update the token in the master list
        const idx = updatedTokens.findIndex(t => t.address === token.address && t.chainId === token.chainId);
        if (idx !== -1) {
          updatedTokens[idx] = { ...updatedTokens[idx], balance: bal };
        }
        // Small delay to prevent blocking UI too much
        await new Promise(r => setTimeout(r, 50));
      } catch (e) {
        console.error(`Error fetching balance for ${token.symbol}`, e);
      }
    }
    
    // Update state with balances first
    setTokens([...updatedTokens]);

    // 2. Fetch Prices (Batch)
    try {
        const prices = await fetchTokenPrices(relevantTokens, activeNetwork);
        // Update tokens with prices
        const tokensWithPrices = updatedTokens.map(t => {
            if (t.chainId === activeNetwork.chainId && prices[t.address.toLowerCase()]) {
                return { ...t, priceUsd: prices[t.address.toLowerCase()] };
            }
            return t;
        });
        setTokens(tokensWithPrices);
    } catch (e) {
        console.warn("Price update failed", e);
    }

    setIsLoading(false);
  }, [activeWallet, tokens, activeNetwork]);

  useEffect(() => {
    if (view === ViewState.DASHBOARD && activeWallet) {
      fetchBalances();
    }
  }, [view, activeWallet, activeNetwork]); 

  // --- Transaction Fetching ---
  const loadTransactions = useCallback(async () => {
    if (activeWallet) {
      setIsFetchingTxs(true);
      const txs = await fetchTransactions(activeWallet.address, activeNetwork);
      setTransactions(txs);
      setIsFetchingTxs(false);
    }
  }, [activeWallet, activeNetwork]);

  useEffect(() => {
    if (view === ViewState.TRANSACTIONS) {
      loadTransactions();
    }
  }, [view, loadTransactions]);

  // --- Swap Logic ---
  useEffect(() => {
    if (view === ViewState.SWAP) {
       // Reset swap selection when network changes or view opens
       setSwapTokenIn(null);
       setSwapTokenOut(null);
       const native = currentNetworkTokens.find(t => t.isNative);
       if (native) setSwapTokenIn(native);
    }
  }, [view, activeNetwork]);

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (view === ViewState.SWAP && swapTokenIn && swapTokenOut && swapAmountIn && parseFloat(swapAmountIn) > 0) {
        if (!activeNetwork.routerAddress) {
          setStatusMessage({ type: 'error', text: 'Swapping not supported on this network yet.' });
          return;
        }
        setIsQuoting(true);
        setSwapNeedsApproval(false);
        try {
          const quote = await getSwapQuote(swapAmountIn, swapTokenIn, swapTokenOut, activeNetwork.rpcUrl, activeNetwork.routerAddress);
          setSwapAmountOut(quote);

          if (activeWallet && !swapTokenIn.isNative) {
             const hasAllowance = await checkAllowance(activeWallet.address, swapTokenIn.address, swapAmountIn, swapTokenIn.decimals, activeNetwork.rpcUrl, activeNetwork.routerAddress);
             setSwapNeedsApproval(!hasAllowance);
          } else {
            setSwapNeedsApproval(false);
          }
        } catch (e) {
          console.error("Swap quote error", e);
          setSwapAmountOut("");
        } finally {
          setIsQuoting(false);
        }
      } else {
        setSwapAmountOut("");
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [swapAmountIn, swapTokenIn, swapTokenOut, activeWallet, view, activeNetwork]);

  const handleSwapApprove = async () => {
    if (!activeWallet || !swapTokenIn || !activeNetwork.routerAddress) return;
    setIsLoading(true);
    setStatusMessage(null);
    try {
      await approveToken(activeWallet.privateKey, swapTokenIn.address, activeNetwork.rpcUrl, activeNetwork.routerAddress);
      setStatusMessage({ type: 'success', text: 'Approved! You can now swap.' });
      setSwapNeedsApproval(false);
    } catch (e) {
      setStatusMessage({ type: 'error', text: 'Approval failed.' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSwapExecute = async () => {
    if (!activeWallet || !swapTokenIn || !swapTokenOut || !activeNetwork.routerAddress) return;
    setIsLoading(true);
    setStatusMessage(null);
    try {
      const tx = await executeSwap(
        activeWallet.privateKey, 
        swapAmountIn, 
        swapAmountOut, 
        swapTokenIn, 
        swapTokenOut,
        activeNetwork.rpcUrl,
        activeNetwork.routerAddress
      );
      setStatusMessage({ type: 'success', text: `Swap submitted! Tx: ${formatAddress(tx)}` });
      setSwapAmountIn("");
      setSwapAmountOut("");
      setTimeout(fetchBalances, 5000);
    } catch (e) {
      console.error(e);
      setStatusMessage({ type: 'error', text: 'Swap failed. Slippage or Gas issue.' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSwapSwitch = () => {
    const temp = swapTokenIn;
    setSwapTokenIn(swapTokenOut);
    setSwapTokenOut(temp);
    setSwapAmountIn("");
    setSwapAmountOut("");
  };

  const handleSwapMax = () => {
    if (swapTokenIn) setSwapAmountIn(swapTokenIn.balance);
  };

  // --- Handlers: Security & Network ---

  const handleLock = () => {
    setPassword("");
    setView(ViewState.UNLOCK);
    setUnlockPassword("");
    setStatusMessage(null);
  };

  const handleUnlock = () => {
    const vault = localStorage.getItem('3twenty_vault');
    if (!vault) return;
    
    try {
      const data = decryptVault(vault, unlockPassword);
      setWallets(data.wallets);
      
      // Load Custom Networks
      if (data.customNetworks) {
        setCustomNetworks(data.customNetworks);
      }

      // Merge tokens
      const mergedTokens = [...DEFAULT_TOKENS];
      if (data.customTokens) {
         data.customTokens.forEach(ct => {
           if (!mergedTokens.find(t => t.address.toLowerCase() === ct.address.toLowerCase() && t.chainId === ct.chainId)) {
             mergedTokens.push(ct);
           }
         });
      }
      setTokens(mergedTokens);

      if (data.wallets.length > 0) {
        setActiveWalletId(data.wallets[0].id);
        setView(ViewState.DASHBOARD);
      } else {
        setView(ViewState.ONBOARDING);
      }
      setPassword(unlockPassword);
      setStatusMessage(null);
    } catch (e) {
      setStatusMessage({ type: 'error', text: 'Incorrect password.' });
    }
  };

  const handleAddNetwork = () => {
    if (!newNetName || !newNetRpc || !newNetChainId || !newNetSymbol) {
      setStatusMessage({ type: 'error', text: 'Please fill all fields.' });
      return;
    }
    const newNet: Network = {
      name: newNetName,
      rpcUrl: newNetRpc,
      chainId: parseInt(newNetChainId),
      symbol: newNetSymbol,
      explorerUrl: newNetExplorer
    };
    
    const updatedCustom = [...customNetworks, newNet];
    setCustomNetworks(updatedCustom);
    
    // Add default native token for this network
    const nativeToken: Token = {
      address: "0x0000000000000000000000000000000000000000",
      name: newNetSymbol,
      symbol: newNetSymbol,
      decimals: 18,
      isNative: true,
      balance: "0",
      chainId: newNet.chainId
    };
    setTokens([...tokens, nativeToken]);

    setActiveNetwork(newNet);
    setView(ViewState.DASHBOARD);
    setStatusMessage({ type: 'success', text: 'Network added!' });
  };

  // --- Handlers: Wallet Management ---

  const handleSaveWalletName = () => {
    if (!activeWallet || !editNameInput.trim()) return;
    const updatedWallets = wallets.map(w => 
      w.id === activeWallet.id ? { ...w, name: editNameInput.trim() } : w
    );
    setWallets(updatedWallets);
    setIsEditingName(false);
    setStatusMessage({ type: 'success', text: 'Wallet renamed successfully.' });
  };
  
  const handleSwitchWallet = (walletId: string) => {
    setActiveWalletId(walletId);
    setView(ViewState.DASHBOARD);
  };
  
  const handleAddNewWallet = () => {
     setImportInput("");
     setView(ViewState.ADD_WALLET_SELECT);
  };

  // --- Handlers: Other Actions ---

  const handleSend = async () => {
    if (!activeWallet || !selectedTokenForSend) return;
    setIsLoading(true);
    setStatusMessage(null);
    try {
      let txHash = "";
      if (selectedTokenForSend.isNative) {
        txHash = await sendNativeCoin(activeWallet.privateKey, sendAddress, sendAmount, activeNetwork.rpcUrl);
      } else {
        txHash = await sendToken(activeWallet.privateKey, sendAddress, selectedTokenForSend.address, sendAmount, activeNetwork.rpcUrl);
      }
      setStatusMessage({ type: 'success', text: `Sent! Tx: ${formatAddress(txHash)}` });
      setSendAddress("");
      setSendAmount("");
      setTimeout(fetchBalances, 5000);
      setTimeout(() => setView(ViewState.DASHBOARD), 2000);
    } catch (e: any) {
      console.error(e);
      setStatusMessage({ type: 'error', text: 'Transaction failed. Check balance & gas.' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCheckToken = async () => {
    if (!ethers.isAddress(importTokenAddress)) {
      setStatusMessage({ type: 'error', text: 'Invalid contract address.' });
      return;
    }

    setIsLoading(true);
    setImportTokenPreview(null);
    
    try {
      const info = await fetchTokenInfo(importTokenAddress, activeNetwork.rpcUrl);
      
      if (info && info.address) {
        const newToken: Token = {
          address: info.address!,
          symbol: info.symbol || "UNK",
          name: info.name || "Unknown Token",
          decimals: info.decimals || 18,
          balance: "0",
          logoUrl: "",
          chainId: activeNetwork.chainId
        };
        setImportTokenPreview(newToken);
        setStatusMessage(null);
      } else {
        setStatusMessage({ type: 'error', text: 'Could not fetch token info.' });
      }
    } catch (e) {
      setStatusMessage({ type: 'error', text: 'Error fetching token info.' });
    } finally {
      setIsLoading(false);
    }
  };

  // Re-used Handlers from prev:
  const handleSetupPassword = () => {
     if (setupPassword.length < 4 || setupPassword !== setupConfirm) {
       setStatusMessage({type: 'error', text: 'Password mismatch or too short.'}); return;
     }
     setPassword(setupPassword); setView(ViewState.ONBOARDING);
  };
  
  const handleResetApp = () => {
    setView(ViewState.RESET_WALLET);
  };

  const handleConfirmReset = () => {
    localStorage.removeItem('3twenty_vault');
    localStorage.clear();
    setWallets([]);
    setActiveWalletId(null);
    setPassword("");
    window.location.reload(); 
  };

  const handleStartCreateWallet = () => {
    const w = createWallet();
    setTempWallet({ id: Date.now().toString(), name: `Wallet ${wallets.length+1}`, ...w });
    setView(ViewState.SEED_BACKUP);
  };
  const handleSeedBackupConfirmed = () => {
    setSeedVerifyIndices([0, 5, 11]); 
    setSeedVerifyInputs({});
    setView(ViewState.SEED_VERIFY);
  };
  const handleVerifySeed = () => {
     if (tempWallet) {
       setWallets([...wallets, tempWallet]); setActiveWalletId(tempWallet.id); setView(ViewState.DASHBOARD);
     }
  };
  const handleImportWallet = () => {
     try {
       const w = importInput.includes(" ") ? importWalletFromMnemonic(importInput) : importWalletFromPrivateKey(importInput);
       const newW = { id: Date.now().toString(), name: `Wallet ${wallets.length+1}`, ...w };
       setWallets([...wallets, newW]); setActiveWalletId(newW.id); setView(ViewState.DASHBOARD);
     } catch(e) { setStatusMessage({type:'error', text: 'Invalid key'}); }
  };
  const handleConfirmImportToken = () => {
     if (importTokenPreview) {
       setTokens([...tokens, importTokenPreview]);
       setImportTokenAddress(""); setImportTokenPreview(null); setView(ViewState.DASHBOARD);
     }
  };
  const handleSendMax = () => selectedTokenForSend && setSendAmount(selectedTokenForSend.balance);
  const handleAiAsk = async () => {
     if(!chatInput) return;
     const p = chatInput; setChatInput(""); setChatHistory(prev=>[...prev, {role:'user', text:p}]); setIsAiThinking(true);
     const res = await askGemini(p, `Network: ${activeNetwork.name}, Wallet: ${activeWallet?.address}`);
     setChatHistory(prev=>[...prev, {role:'model', text:res}]); setIsAiThinking(false);
  };
  const handleBrowserGo = () => browserUrl && window.open(browserUrl.startsWith('http')?browserUrl:`https://${browserUrl}`, '_blank');
  const navigateTo = (v: ViewState) => { setView(v); setIsMenuOpen(false); };

  // --- RENDER ---
  const isAuthView = [ViewState.DASHBOARD, ViewState.SEND, ViewState.RECEIVE, ViewState.SWAP, ViewState.BROWSER, ViewState.WALLET_DETAILS, ViewState.IMPORT_TOKEN, ViewState.ADD_NETWORK, ViewState.TRANSACTIONS, ViewState.ADD_WALLET_SELECT].includes(view);

  if (!isAuthView) {
     if (view === ViewState.RESET_WALLET) return (
       <div className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden font-sans">
          <Card className="max-w-md w-full relative z-10 border-red-900/40 shadow-2xl bg-slate-900/90 backdrop-blur-2xl p-8 ring-1 ring-red-500/20">
             <div className="flex flex-col items-center text-center mb-6">
                <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mb-4 border border-red-500/20">
                   <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                </div>
                <h1 className="text-2xl font-bold text-white mb-2">Reset Wallet?</h1>
                <p className="text-slate-400 text-sm leading-relaxed">
                   This action will <strong>permanently delete</strong> the wallet stored on this browser. 
                   <br/><br/>
                   If you have forgotten your password, this is the only way to regain access. You <strong>MUST</strong> have your 12-word Secret Recovery Phrase to restore your funds.
                </p>
             </div>
             <div className="flex flex-col gap-3">
                <Button onClick={handleConfirmReset} className="w-full bg-red-600 hover:bg-red-700 text-white border-red-500 py-3 font-bold shadow-lg shadow-red-900/20" size="lg">
                   Yes, Delete & Reset
                </Button>
                <Button onClick={() => setView(ViewState.UNLOCK)} variant="secondary" className="w-full py-3" size="lg">
                   Cancel
                </Button>
             </div>
          </Card>
       </div>
     );

     if (view === ViewState.UNLOCK) return (
        <div className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden font-sans">
           <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
              <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] bg-blue-600/10 rounded-full blur-[120px] animate-pulse"></div>
              <div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] bg-purple-600/10 rounded-full blur-[120px] animate-pulse"></div>
           </div>

          <Card className="max-w-md w-full relative z-10 border-slate-700/40 shadow-2xl bg-slate-900/70 backdrop-blur-2xl p-10 ring-1 ring-white/10">
             <div className="absolute top-5 left-5">
                <button onClick={() => setView(ViewState.LANDING)} className="text-slate-500 hover:text-white flex items-center gap-1 text-xs font-bold uppercase tracking-wider transition-colors group">
                   <svg className="w-4 h-4 group-hover:-translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg>
                   Back
                </button>
             </div>

             <div className="flex flex-col items-center mb-10 mt-2">
               <div className="w-20 h-20 bg-gradient-to-br from-slate-800 to-slate-900 rounded-3xl flex items-center justify-center mb-6 shadow-xl border border-slate-700/50">
                 <img src={HEADER_LOGO_URL} className="h-12 w-auto object-contain drop-shadow-md" alt="Logo" />
               </div>
               <h1 className="text-3xl font-bold text-white tracking-tight">Welcome Back</h1>
               <p className="text-slate-400 text-sm mt-2 font-medium">Secure. Non-Custodial. Yours.</p>
             </div>
             
             <div className="space-y-6">
               <div>
                 <div className="relative group">
                   <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-500 group-focus-within:text-blue-400 transition-colors">
                     <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
                   </div>
                   <input 
                     type="password" 
                     value={unlockPassword} 
                     onChange={e=>setUnlockPassword(e.target.value)} 
                     onKeyDown={e => e.key === 'Enter' && handleUnlock()}
                     className="w-full bg-slate-950/50 border border-slate-700/70 rounded-xl py-4 pl-12 pr-4 text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-all shadow-inner text-lg" 
                     placeholder="Enter Vault Password" 
                     autoFocus
                   />
                 </div>
               </div>
               
               <Button onClick={handleUnlock} className="w-full py-4 text-lg font-bold shadow-lg shadow-blue-900/30 hover:shadow-blue-900/50 hover:-translate-y-0.5 transition-all bg-gradient-to-r from-blue-600 to-blue-700" size="lg">Unlock Wallet</Button>
               
               <div className="pt-6 border-t border-slate-800/50 flex flex-col items-center gap-3">
                  <button onClick={handleResetApp} className="text-slate-400 text-sm hover:text-red-400 transition-colors font-medium px-4 py-2 rounded-lg hover:bg-red-900/10 w-full border border-transparent hover:border-red-900/20">
                    Forgot Password?
                  </button>
               </div>
             </div>

             {statusMessage && (
               <div className="mt-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm text-center animate-in fade-in slide-in-from-top-1 flex items-center justify-center gap-2">
                 {statusMessage.text}
               </div>
             )}
          </Card>
        </div>
     );

     if (view === ViewState.LANDING) {
        return (
          <div className="min-h-screen flex flex-col font-sans bg-slate-950 selection:bg-blue-500/30">
             {/* Sticky Nav */}
             <nav className="fixed w-full z-50 bg-slate-950/80 backdrop-blur-md border-b border-white/5">
                <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <img src={HEADER_LOGO_URL} className="h-10 w-auto" alt="Logo" />
                        <span className="font-bold text-xl tracking-tight text-white hidden sm:block">3Twenty Wallet</span>
                    </div>
                    <div className="flex gap-4">
                        <Button variant="ghost" onClick={() => setView(ViewState.UNLOCK)} className="hidden sm:flex">Login</Button>
                        <Button onClick={() => setView(ViewState.SETUP_PASSWORD)} className="shadow-lg shadow-blue-500/20">Get Started</Button>
                    </div>
                </div>
             </nav>

             {/* Hero Section */}
             <section className="relative pt-32 pb-20 px-6 overflow-hidden flex flex-col items-center text-center">
                 {/* Background FX */}
                 <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    <div className="absolute top-[10%] left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-blue-600/10 rounded-full blur-[128px] animate-pulse"></div>
                    <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-purple-600/10 rounded-full blur-[128px]"></div>
                 </div>

                 <div className="relative z-10 max-w-4xl mx-auto">
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-900/50 border border-slate-700/50 text-blue-300 text-sm font-bold mb-8 backdrop-blur-md animate-in slide-in-from-bottom-5 fade-in duration-700 shadow-xl ring-1 ring-white/10">
                       <span className="flex h-2 w-2 relative">
                         <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                         <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                       </span>
                       Now with Gemini AI Integration
                    </div>
                    
                    <h1 className="text-5xl md:text-7xl font-extrabold mb-8 leading-[1.1] tracking-tight text-white drop-shadow-2xl animate-in slide-in-from-bottom-5 fade-in duration-700 delay-100">
                       The Intelligent <br/>
                       <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-purple-400 to-emerald-400">Crypto Wallet</span>
                    </h1>
                    
                    <p className="text-slate-400 mb-10 max-w-2xl mx-auto text-lg md:text-xl leading-relaxed animate-in slide-in-from-bottom-5 fade-in duration-700 delay-200">
                       Manage assets, swap tokens, and explore Web3 across BSC, Ethereum, and Polygon. Secure, non-custodial, and powered by AI.
                    </p>
                    
                    <div className="flex flex-col sm:flex-row gap-5 justify-center animate-in slide-in-from-bottom-5 fade-in duration-700 delay-300">
                       <Button onClick={() => setView(ViewState.SETUP_PASSWORD)} className="px-8 py-4 text-lg shadow-blue-500/25 shadow-xl hover:scale-105 transition-transform font-bold" size="lg">Create Free Wallet</Button>
                       <Button onClick={() => setView(ViewState.UNLOCK)} variant="secondary" className="px-8 py-4 text-lg hover:scale-105 transition-transform font-bold" size="lg">Access Existing</Button>
                    </div>

                    {/* Mockup / Visual Preview */}
                    <div className="mt-16 relative mx-auto max-w-3xl animate-in slide-in-from-bottom-10 fade-in duration-1000 delay-500">
                         <div className="absolute -inset-1 bg-gradient-to-r from-blue-500 to-purple-600 rounded-2xl blur opacity-20"></div>
                         <div className="relative bg-slate-900/80 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-4 shadow-2xl ring-1 ring-white/10">
                             <div className="flex items-center gap-2 mb-4 border-b border-slate-800 pb-4">
                                 <div className="flex gap-1.5">
                                     <div className="w-3 h-3 rounded-full bg-red-500/50"></div>
                                     <div className="w-3 h-3 rounded-full bg-yellow-500/50"></div>
                                     <div className="w-3 h-3 rounded-full bg-green-500/50"></div>
                                 </div>
                                 <div className="bg-slate-800 h-6 w-48 rounded-md mx-auto"></div>
                             </div>
                             <div className="grid grid-cols-3 gap-4">
                                 <div className="col-span-1 space-y-3">
                                     <div className="h-20 bg-slate-800/50 rounded-xl"></div>
                                     <div className="h-8 bg-slate-800/50 rounded-xl"></div>
                                     <div className="h-8 bg-slate-800/50 rounded-xl"></div>
                                 </div>
                                 <div className="col-span-2 space-y-3">
                                      <div className="h-40 bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl border border-slate-700/50 p-6 flex flex-col justify-center items-center">
                                          <div className="text-3xl font-bold text-white mb-2">$12,450.00</div>
                                          <div className="flex gap-2">
                                              <div className="h-8 w-24 bg-blue-600 rounded-lg"></div>
                                              <div className="h-8 w-24 bg-slate-700 rounded-lg"></div>
                                          </div>
                                      </div>
                                 </div>
                             </div>
                         </div>
                    </div>
                 </div>
             </section>

             {/* Supported Chains Strip */}
             <section className="border-y border-white/5 bg-slate-900/30 backdrop-blur-sm py-10">
                 <div className="max-w-7xl mx-auto px-6 text-center">
                     <p className="text-slate-500 text-xs font-bold uppercase tracking-[0.2em] mb-6">Native Support For Top Chains</p>
                     <div className="flex flex-wrap justify-center gap-8 md:gap-16 opacity-70 grayscale hover:grayscale-0 transition-all duration-500">
                         <div className="flex items-center gap-2 font-bold text-xl text-yellow-500"><span className="w-8 h-8 rounded-full bg-yellow-500/20 flex items-center justify-center">B</span> BSC</div>
                         <div className="flex items-center gap-2 font-bold text-xl text-blue-400"><span className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center">E</span> Ethereum</div>
                         <div className="flex items-center gap-2 font-bold text-xl text-purple-500"><span className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center">P</span> Polygon</div>
                         <div className="flex items-center gap-2 font-bold text-xl text-red-500"><span className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center">A</span> Avalanche</div>
                     </div>
                 </div>
             </section>

             {/* Bento Grid Features */}
             <section className="py-24 px-6 max-w-7xl mx-auto">
                 <div className="mb-16 text-center max-w-2xl mx-auto">
                     <h2 className="text-3xl md:text-5xl font-bold mb-6">Everything you need, <br/> in one secure place.</h2>
                     <p className="text-slate-400 text-lg">We've combined the power of a pro-level exchange with the simplicity of a mobile wallet.</p>
                 </div>
                 
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-6 auto-rows-[300px]">
                     {/* Feature 1: Large AI Card */}
                     <div className="md:col-span-2 row-span-1 md:row-span-1 rounded-3xl bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 p-8 relative overflow-hidden group hover:border-blue-500/30 transition-all shadow-2xl">
                         <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/10 rounded-full blur-3xl -mr-10 -mt-10 group-hover:bg-blue-600/20 transition-all"></div>
                         <div className="relative z-10 h-full flex flex-col justify-between">
                             <div>
                                 <div className="w-12 h-12 bg-blue-500/20 rounded-2xl flex items-center justify-center mb-4 text-blue-400">
                                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                                 </div>
                                 <h3 className="text-2xl font-bold text-white mb-2">AI-Powered Assistant</h3>
                                 <p className="text-slate-400 max-w-sm">Not sure what a transaction does? Ask our integrated Gemini AI. It analyzes contracts and explains DeFi concepts in plain English.</p>
                             </div>
                             <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50 backdrop-blur max-w-md mt-4">
                                 <div className="flex gap-3">
                                     <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-500 to-purple-500 shrink-0"></div>
                                     <div className="space-y-2 w-full">
                                         <div className="h-2 bg-slate-700 rounded w-3/4"></div>
                                         <div className="h-2 bg-slate-700 rounded w-1/2"></div>
                                     </div>
                                 </div>
                             </div>
                         </div>
                     </div>

                     {/* Feature 2: Security */}
                     <div className="md:col-span-1 rounded-3xl bg-slate-900/50 border border-slate-800 p-8 relative overflow-hidden group hover:border-emerald-500/30 transition-all">
                         <div className="absolute bottom-0 right-0 w-40 h-40 bg-emerald-500/10 rounded-full blur-3xl group-hover:bg-emerald-500/20 transition-all"></div>
                         <div className="w-12 h-12 bg-emerald-500/20 rounded-2xl flex items-center justify-center mb-4 text-emerald-400">
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
                         </div>
                         <h3 className="text-xl font-bold text-white mb-2">Non-Custodial</h3>
                         <p className="text-slate-400 text-sm leading-relaxed">Your keys, your crypto. Encrypted locally on your device. We never have access to your funds.</p>
                     </div>

                     {/* Feature 3: Swap */}
                     <div className="md:col-span-1 rounded-3xl bg-slate-900/50 border border-slate-800 p-8 relative overflow-hidden group hover:border-purple-500/30 transition-all">
                         <div className="w-12 h-12 bg-purple-500/20 rounded-2xl flex items-center justify-center mb-4 text-purple-400">
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"/></svg>
                         </div>
                         <h3 className="text-xl font-bold text-white mb-2">Instant Swaps</h3>
                         <p className="text-slate-400 text-sm leading-relaxed">Trade tokens directly from your wallet with the best rates across major DEXs.</p>
                     </div>

                     {/* Feature 4: Web3 Browser */}
                     <div className="md:col-span-2 rounded-3xl bg-slate-900/50 border border-slate-800 p-8 relative overflow-hidden group hover:border-orange-500/30 transition-all flex items-center">
                         <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20"></div>
                         <div className="relative z-10 w-full">
                             <div className="w-12 h-12 bg-orange-500/20 rounded-2xl flex items-center justify-center mb-4 text-orange-400">
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"/></svg>
                             </div>
                             <h3 className="text-2xl font-bold text-white mb-2">Web3 Browser</h3>
                             <p className="text-slate-400 max-w-lg">Connect to your favorite DApps like PancakeSwap, OpenSea, and more. A gateway to the decentralized web.</p>
                         </div>
                     </div>
                 </div>
             </section>

             {/* Final CTA */}
             <section className="py-20 px-6">
                 <div className="max-w-4xl mx-auto bg-gradient-to-r from-blue-900 to-indigo-900 rounded-[2.5rem] p-12 text-center relative overflow-hidden border border-blue-500/30 shadow-2xl">
                     <div className="absolute top-0 left-0 w-full h-full bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-10"></div>
                     <div className="relative z-10">
                         <h2 className="text-4xl md:text-5xl font-extrabold mb-6 text-white tracking-tight">Ready to take control?</h2>
                         <p className="text-blue-200 text-lg mb-10 max-w-xl mx-auto">Join thousands of users who trust 3Twenty for their DeFi journey. No sign-up required, just create a wallet and go.</p>
                         <div className="flex flex-col sm:flex-row gap-4 justify-center">
                            <Button onClick={() => setView(ViewState.SETUP_PASSWORD)} className="px-10 py-5 text-lg bg-white text-blue-900 hover:bg-blue-50 hover:text-blue-950 shadow-xl border-0 font-extrabold" size="lg">Create Free Wallet</Button>
                         </div>
                     </div>
                 </div>
             </section>

             <Footer />
          </div>
        );
     }
     
     if (view === ViewState.SETUP_PASSWORD) return (
       <div className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden font-sans">
          <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
              <div className="absolute top-[-20%] right-[-20%] w-[60%] h-[60%] bg-emerald-600/10 rounded-full blur-[100px] animate-pulse"></div>
              <div className="absolute bottom-[-20%] left-[-20%] w-[60%] h-[60%] bg-blue-600/10 rounded-full blur-[100px] animate-pulse"></div>
           </div>

          <Card className="max-w-md w-full relative z-10 border-slate-700/40 shadow-2xl bg-slate-900/80 backdrop-blur-xl p-8 ring-1 ring-white/5">
            <div className="mb-8">
               <button onClick={()=>setView(ViewState.LANDING)} className="text-slate-400 hover:text-white mb-6 flex items-center gap-2 text-xs font-bold uppercase tracking-wider transition-colors group">
                 <svg className="w-4 h-4 group-hover:-translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7"/></svg>
                 Back
               </button>
               <h1 className="text-3xl font-bold text-white mb-3">Set Master Password</h1>
               <p className="text-slate-400 text-sm leading-relaxed">
                 Protect your assets with a strong password. This password encrypts your keys directly on your device.
               </p>
            </div>

            <div className="space-y-6">
              <div>
                 <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 ml-1">New Password</label>
                 <input 
                   type="password" 
                   value={setupPassword} 
                   onChange={e=>setSetupPassword(e.target.value)} 
                   className="w-full bg-slate-950/50 border border-slate-700 rounded-xl p-4 text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all shadow-inner" 
                   placeholder="Minimum 4 characters" 
                   autoFocus
                 />
              </div>
              
              <div>
                 <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 ml-1">Confirm Password</label>
                 <div className="relative">
                    <input 
                      type="password" 
                      value={setupConfirm} 
                      onChange={e=>setSetupConfirm(e.target.value)} 
                      className={`w-full bg-slate-950/50 border rounded-xl p-4 text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 transition-all shadow-inner ${
                        setupConfirm && setupPassword !== setupConfirm 
                          ? 'border-red-500/50 focus:border-red-500 focus:ring-red-500/20' 
                          : 'border-slate-700 focus:border-blue-500 focus:ring-blue-500/50'
                      }`}
                      placeholder="Repeat password" 
                      onKeyDown={e => e.key === 'Enter' && handleSetupPassword()}
                    />
                    {setupConfirm && setupPassword === setupConfirm && (
                        <div className="absolute right-3 top-4 text-green-400 animate-in zoom-in">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"/></svg>
                        </div>
                    )}
                 </div>
                 {setupConfirm && setupPassword !== setupConfirm && (
                   <p className="text-red-400 text-xs mt-2 ml-1 flex items-center gap-1 font-medium">
                       <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
                       Passwords do not match
                   </p>
                 )}
              </div>

              <div className="bg-blue-500/10 p-4 rounded-xl border border-blue-500/20 flex gap-3 items-start">
                <svg className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                <div className="space-y-1">
                  <p className="text-xs font-bold text-blue-300">Security Tip</p>
                  <p className="text-xs text-blue-200/70 leading-relaxed">
                    We cannot recover this password. If you forget it, you will need your 12-word seed phrase to restore your wallet.
                  </p>
                </div>
              </div>

              <Button onClick={handleSetupPassword} className="w-full py-4 text-lg mt-2 shadow-lg shadow-blue-900/30 hover:shadow-blue-900/50" size="lg" disabled={!setupPassword || setupPassword.length < 4 || setupPassword !== setupConfirm}>
                Create Vault
              </Button>
            </div>
            
            {statusMessage && (
               <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm text-center animate-in fade-in">
                 {statusMessage.text}
               </div>
            )}
          </Card>
       </div>
     );

     if (view === ViewState.ONBOARDING) return (
       <div className="min-h-screen flex items-center justify-center p-4 max-w-2xl mx-auto">
          <div className="space-y-6 w-full">
            <h1 className="text-3xl font-bold text-center mb-8">Setup Your Wallet</h1>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
               <Card 
                 className="p-8 cursor-pointer hover:border-blue-500/50 hover:bg-slate-800/80 transition-all group border-slate-700/50 relative overflow-hidden" 
                 onClick={handleStartCreateWallet}
               >
                 <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-2xl -mr-16 -mt-16 group-hover:bg-blue-500/20 transition-all"></div>
                 <div className="w-12 h-12 bg-blue-500/20 rounded-2xl flex items-center justify-center mb-6 text-blue-400 group-hover:scale-110 transition-transform">
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"/></svg>
                 </div>
                 <h2 className="text-xl font-bold mb-2">Create New Wallet</h2>
                 <p className="text-slate-400 text-sm leading-relaxed">Generate a new 12-word seed phrase. Best for new users.</p>
               </Card>

               <Card 
                 className="p-8 cursor-pointer hover:border-emerald-500/50 hover:bg-slate-800/80 transition-all group border-slate-700/50 relative overflow-hidden"
                 onClick={() => {}}
               >
                 <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl -mr-16 -mt-16 group-hover:bg-emerald-500/20 transition-all"></div>
                 <div className="w-12 h-12 bg-emerald-500/20 rounded-2xl flex items-center justify-center mb-6 text-emerald-400 group-hover:scale-110 transition-transform">
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                 </div>
                 <h2 className="text-xl font-bold mb-2">Import Existing</h2>
                 <p className="text-slate-400 text-sm leading-relaxed mb-4">Restore using a seed phrase or private key.</p>
                 
                 <div className="space-y-3">
                   <input 
                      value={importInput} 
                      onChange={e=>setImportInput(e.target.value)} 
                      onClick={(e)=>e.stopPropagation()}
                      className="w-full bg-slate-950/50 border border-slate-700 rounded-xl p-3 text-sm focus:border-emerald-500 outline-none transition" 
                      placeholder="Paste Private Key or Mnemonic" 
                   />
                   <Button onClick={(e) => { e.stopPropagation(); handleImportWallet(); }} variant="secondary" className="w-full py-2" disabled={!importInput}>
                     Import
                   </Button>
                 </div>
               </Card>
            </div>
          </div>
       </div>
     );
     // Seed Backup
     if (view === ViewState.SEED_BACKUP && tempWallet) return (
        <div className="min-h-screen flex items-center justify-center p-4">
           <Card className="max-w-md w-full p-8">
              <div className="flex justify-between items-center mb-4">
                  <h1 className="text-xl font-bold">Backup Seed Phrase</h1>
                  {wallets.length > 0 && <button onClick={()=>setView(ViewState.WALLET_DETAILS)} className="text-slate-500 hover:text-white text-xs uppercase font-bold">Cancel</button>}
              </div>
              <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-xl flex gap-3 mb-6 items-start">
                 <svg className="w-5 h-5 text-red-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                 <p className="text-xs text-red-300 leading-relaxed">Write these 12 words down in order. If you lose them, your funds are lost forever. Do not share them with anyone.</p>
              </div>
              
              <div className="grid grid-cols-3 gap-3 mb-8">
                 {tempWallet.mnemonic?.split(" ").map((word, i) => (
                    <div key={i} className="bg-slate-950 border border-slate-800 p-2.5 rounded-lg text-xs text-center font-mono text-slate-300 relative group hover:border-blue-500/30 transition-colors cursor-default select-all">
                        <span className="absolute top-1 left-2 text-[8px] text-slate-600 select-none">{i+1}</span>
                        {word}
                    </div>
                 ))}
              </div>
              <Button onClick={handleSeedBackupConfirmed} className="w-full py-3">I Have Saved Them</Button>
           </Card>
        </div>
     );
     // Seed Verify
     if (view === ViewState.SEED_VERIFY && tempWallet) return (
        <div className="min-h-screen flex items-center justify-center p-4">
           <Card className="max-w-md w-full p-8">
              <h1 className="text-xl font-bold mb-4">Verify Seed</h1>
              <p className="text-sm text-slate-400 mb-6">Confirm you saved your seed phrase by entering the requested words.</p>
              <div className="space-y-4 mb-8">
                 {seedVerifyIndices.map(idx => (
                    <div key={idx}>
                       <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">Word #{idx+1}</label>
                       <input 
                          className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm focus:border-blue-500 outline-none transition"
                          onChange={(e) => {
                             const val = e.target.value.toLowerCase().trim();
                             setSeedVerifyInputs(prev => ({...prev, [idx]: val}));
                          }}
                          placeholder={`Enter word #${idx+1}`}
                       />
                    </div>
                 ))}
              </div>
              {statusMessage && <div className="text-red-400 text-sm text-center mb-4 bg-red-900/10 p-2 rounded-lg">{statusMessage.text}</div>}
              <Button 
                 onClick={() => {
                    const words = tempWallet.mnemonic?.split(" ") || [];
                    const isValid = seedVerifyIndices.every(idx => words[idx] === seedVerifyInputs[idx]);
                    if(isValid) handleVerifySeed();
                    else setStatusMessage({type:'error', text: 'Incorrect words. Please try again.'});
                 }} 
                 className="w-full py-3"
              >
                 Verify & Finish
              </Button>
           </Card>
        </div>
     );
     return null;
  }

  // Authenticated Layout
  return (
    <div className="min-h-screen flex flex-col font-sans">
       <header className="bg-slate-900/80 backdrop-blur-md border-b border-white/5 sticky top-0 z-40 supports-[backdrop-filter]:bg-slate-900/60">
          <div className="max-w-7xl mx-auto px-4 py-3 flex justify-between items-center">
             {/* Logo Section */}
             <div className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition group" onClick={()=>setView(ViewState.DASHBOARD)}>
                <img src={HEADER_LOGO_URL} className="h-9 w-auto object-contain group-hover:scale-105 transition-transform" alt="Logo" />
                <span className="font-bold text-lg hidden sm:block">3Twenty</span>
             </div>
             
             {/* Center Nav (Desktop) */}
             <div className="hidden md:flex gap-1 bg-slate-800/50 p-1 rounded-xl border border-slate-700/50">
                {[
                   {v: ViewState.DASHBOARD, label: 'Wallet'}, 
                   {v: ViewState.SWAP, label: 'Swap'}, 
                   {v: ViewState.BROWSER, label: 'Browser'}, 
                   {v: ViewState.TRANSACTIONS, label: 'Activity'},
                   {v: ViewState.WALLET_DETAILS, label: 'Manage Wallets'}
                ].map(item => (
                   <button 
                      key={item.v}
                      onClick={()=>setView(item.v)} 
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${view===item.v ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'}`}
                   >
                      {item.label}
                   </button>
                ))}
             </div>

             {/* Right Section: Network & Lock */}
             <div className="flex items-center gap-3">
                {/* Active Wallet Indicator */}
                {activeWallet && (
                    <div className="hidden lg:flex items-center gap-2 bg-slate-800/30 px-3 py-2 rounded-xl border border-slate-700/30 text-xs font-medium text-slate-300">
                        <span className="w-2 h-2 rounded-full bg-blue-400"></span>
                        {activeWallet.name}
                    </div>
                )}

                {/* Network Selector */}
                <div className="relative group z-50">
                   <button className="bg-slate-800/60 px-3 py-2 rounded-xl text-sm flex items-center gap-2 border border-slate-700/50 hover:border-slate-600 transition min-w-[120px] justify-between hover:bg-slate-800">
                      <div className="flex items-center gap-2">
                         <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]"></span>
                         <span className="truncate max-w-[80px] font-medium text-xs sm:text-sm">{activeNetwork.name.split(" ")[0]}</span>
                      </div>
                      <svg className="w-3 h-3 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"/></svg>
                   </button>
                   <div className="absolute top-full right-0 mt-2 w-64 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl hidden group-hover:block overflow-hidden ring-1 ring-white/5 animate-in fade-in zoom-in-95 duration-150">
                      <div className="p-3 bg-slate-950/50 border-b border-slate-800 text-xs font-bold text-slate-500 uppercase tracking-wider">Select Network</div>
                      <div className="max-h-64 overflow-y-auto">
                        {NETWORKS.map((net, i) => (
                           <div key={i} onClick={() => { setActiveNetwork(net); setView(ViewState.DASHBOARD); }} className="px-4 py-3 hover:bg-slate-800 cursor-pointer text-sm flex items-center justify-between group-item transition-colors border-b border-slate-800/50 last:border-0">
                              <span className="font-medium">{net.name}</span>
                              {activeNetwork.chainId === net.chainId && <span className="text-emerald-400"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"/></svg></span>}
                           </div>
                        ))}
                        {customNetworks.map((net, i) => (
                           <div key={`cust-${i}`} onClick={() => { setActiveNetwork(net); setView(ViewState.DASHBOARD); }} className="px-4 py-3 hover:bg-slate-800 cursor-pointer text-sm flex items-center justify-between transition-colors border-b border-slate-800/50 last:border-0">
                              <span>{net.name} <span className="text-xs text-slate-500 ml-1">(Custom)</span></span>
                              {activeNetwork.chainId === net.chainId && <span className="text-emerald-400">✓</span>}
                           </div>
                        ))}
                      </div>
                      <div className="p-2 bg-slate-950/30 border-t border-slate-800">
                        <button onClick={() => setView(ViewState.ADD_NETWORK)} className="w-full py-2 hover:bg-slate-800 rounded-lg cursor-pointer text-xs text-blue-400 font-bold uppercase tracking-wider flex items-center justify-center gap-1 transition-colors">
                           <span>+</span> Add Custom Network
                        </button>
                      </div>
                   </div>
                </div>
                
                {/* Lock Button */}
                <button 
                   onClick={handleLock} 
                   className="bg-slate-800/60 p-2 rounded-xl text-slate-400 hover:text-red-400 hover:bg-slate-800 border border-slate-700/50 transition" 
                   title="Lock Wallet"
                >
                   <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>
                </button>
                
                {/* Mobile Menu Toggle */}
                <button onClick={()=>setIsMenuOpen(!isMenuOpen)} className="md:hidden p-2 text-slate-400 hover:text-white">
                   <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"></path></svg>
                </button>
             </div>
          </div>
          
          {/* Mobile Menu */}
          {isMenuOpen && (
             <div className="md:hidden bg-slate-900 border-t border-slate-800 p-4 space-y-2 shadow-xl absolute w-full z-50 animate-in slide-in-from-top-2">
                <button onClick={()=>navigateTo(ViewState.DASHBOARD)} className="block w-full text-left p-3 rounded-lg hover:bg-slate-800 transition">Wallet Dashboard</button>
                <button onClick={()=>navigateTo(ViewState.SWAP)} className="block w-full text-left p-3 rounded-lg hover:bg-slate-800 transition">Token Swap</button>
                <button onClick={()=>navigateTo(ViewState.BROWSER)} className="block w-full text-left p-3 rounded-lg hover:bg-slate-800 transition">DApp Browser</button>
                <button onClick={()=>navigateTo(ViewState.TRANSACTIONS)} className="block w-full text-left p-3 rounded-lg hover:bg-slate-800 transition">History</button>
                <button onClick={()=>navigateTo(ViewState.WALLET_DETAILS)} className="block w-full text-left p-3 rounded-lg hover:bg-slate-800 transition">Manage Wallets</button>
             </div>
          )}
       </header>

       <main className="flex-1 max-w-5xl mx-auto w-full p-4 lg:p-8">
          {statusMessage && (
             <div className={`p-4 mb-6 rounded-xl border flex items-center gap-3 animate-in slide-in-from-top-2 shadow-lg backdrop-blur-sm ${statusMessage.type==='error'?'bg-red-500/10 border-red-500/20 text-red-400':'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'}`}>
                {statusMessage.type==='error' ? (
                   <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                ) : (
                   <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
                )}
                <span className="font-medium text-sm">{statusMessage.text}</span>
             </div>
          )}

          {view === ViewState.ADD_WALLET_SELECT && (
             <div className="max-w-2xl mx-auto animate-in fade-in">
                <div className="flex gap-4 mb-6 items-center">
                   <button onClick={()=>setView(ViewState.WALLET_DETAILS)} className="p-2 hover:bg-slate-800 rounded-full transition"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg></button>
                   <h2 className="text-2xl font-bold">Add Wallet</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                   <Card 
                     className="p-8 cursor-pointer hover:border-blue-500/50 hover:bg-slate-800/80 transition-all group border-slate-700/50 relative overflow-hidden" 
                     onClick={handleStartCreateWallet}
                   >
                     <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-2xl -mr-16 -mt-16 group-hover:bg-blue-500/20 transition-all"></div>
                     <div className="w-12 h-12 bg-blue-500/20 rounded-2xl flex items-center justify-center mb-6 text-blue-400 group-hover:scale-110 transition-transform">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"/></svg>
                     </div>
                     <h2 className="text-xl font-bold mb-2">Create New</h2>
                     <p className="text-slate-400 text-sm leading-relaxed">Generate a new 12-word seed phrase.</p>
                   </Card>

                   <Card 
                     className="p-8 cursor-pointer hover:border-emerald-500/50 hover:bg-slate-800/80 transition-all group border-slate-700/50 relative overflow-hidden"
                     onClick={()=>{}}
                   >
                     <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl -mr-16 -mt-16 group-hover:bg-emerald-500/20 transition-all"></div>
                     <div className="w-12 h-12 bg-emerald-500/20 rounded-2xl flex items-center justify-center mb-6 text-emerald-400 group-hover:scale-110 transition-transform">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                     </div>
                     <h2 className="text-xl font-bold mb-2">Import Existing</h2>
                     <p className="text-slate-400 text-sm leading-relaxed mb-4">Restore using a seed phrase or private key.</p>
                     
                     <div className="space-y-3">
                       <input 
                          value={importInput} 
                          onChange={e=>setImportInput(e.target.value)} 
                          onClick={(e)=>e.stopPropagation()}
                          className="w-full bg-slate-950/50 border border-slate-700 rounded-xl p-3 text-sm focus:border-emerald-500 outline-none transition" 
                          placeholder="Paste Private Key or Mnemonic" 
                       />
                       <Button onClick={(e) => { e.stopPropagation(); handleImportWallet(); }} variant="secondary" className="w-full py-2" disabled={!importInput}>
                         Import
                       </Button>
                     </div>
                   </Card>
                </div>
             </div>
          )}

          {view === ViewState.ADD_NETWORK && (
             <Card className="max-w-lg mx-auto">
                <h2 className="text-xl font-bold mb-6">Add Custom Network</h2>
                <div className="space-y-4">
                   <div><label className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-1 block">Network Name</label><input value={newNetName} onChange={e=>setNewNetName(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 focus:border-blue-500 outline-none transition" placeholder="e.g. My Custom Chain" /></div>
                   <div><label className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-1 block">RPC URL</label><input value={newNetRpc} onChange={e=>setNewNetRpc(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 focus:border-blue-500 outline-none transition" placeholder="https://..." /></div>
                   <div><label className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-1 block">Chain ID</label><input type="number" value={newNetChainId} onChange={e=>setNewNetChainId(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 focus:border-blue-500 outline-none transition" placeholder="e.g. 56" /></div>
                   <div><label className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-1 block">Currency Symbol</label><input value={newNetSymbol} onChange={e=>setNewNetSymbol(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 focus:border-blue-500 outline-none transition" placeholder="e.g. BNB" /></div>
                   <div className="flex gap-3 mt-8">
                      <Button onClick={()=>setView(ViewState.DASHBOARD)} variant="secondary" className="w-full">Cancel</Button>
                      <Button onClick={handleAddNetwork} className="w-full">Add Network</Button>
                   </div>
                </div>
             </Card>
          )}

          {view === ViewState.DASHBOARD && activeWallet && (
             <div className="animate-in fade-in space-y-8">
                {/* Balance Card */}
                <div className="relative group">
                   <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-purple-600 rounded-3xl blur opacity-30 group-hover:opacity-40 transition duration-500"></div>
                   <Card className="text-center py-12 relative overflow-hidden border-0 bg-gradient-to-br from-slate-900 to-slate-950 rounded-3xl">
                      {/* Background Pattern */}
                      <svg className="absolute inset-0 w-full h-full opacity-[0.03]" xmlns="http://www.w3.org/2000/svg">
                        <defs><pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="1"/></pattern></defs>
                        <rect width="100%" height="100%" fill="url(#grid)" />
                      </svg>
                      
                      <div className="relative z-10">
                         <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-800/50 border border-slate-700/50 mb-6 backdrop-blur-sm">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                            <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">{activeNetwork.name} Mainnet</span>
                         </div>
                         
                         <h2 className="text-5xl md:text-6xl font-extrabold text-white mb-2 tracking-tight drop-shadow-sm tabular-nums">
                            $ {totalFiatBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                         </h2>
                         <p className="text-slate-500 font-medium text-lg mb-8 flex items-center justify-center gap-2">
                             <span>{currentNetworkTokens.find(t=>t.isNative)?.balance || "0.00"}</span>
                             <span className="font-bold">{activeNetwork.symbol}</span>
                         </p>
                         
                         <div className="flex justify-center gap-4">
                            <Button onClick={()=>setView(ViewState.SEND)} className="rounded-full px-8 shadow-blue-500/20">
                               <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 10l7-7m0 0l7 7m-7-7v18"/></svg>
                               Send
                            </Button>
                            <Button onClick={()=>setView(ViewState.RECEIVE)} variant="secondary" className="rounded-full px-8 bg-slate-800/80 hover:bg-slate-700">
                               <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 14l-7 7m0 0l-7-7m7 7V3"/></svg>
                               Receive
                            </Button>
                            <Button onClick={()=>setView(ViewState.SWAP)} variant="glass" className="rounded-full px-6">
                               <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"/></svg>
                            </Button>
                         </div>
                      </div>
                   </Card>
                </div>
                
                {/* Assets List */}
                <div>
                   <div className="flex justify-between items-center px-2 mb-4">
                      <h3 className="font-bold text-lg text-slate-200">Assets</h3>
                      <button onClick={()=>{setImportTokenAddress(""); setImportTokenPreview(null); setView(ViewState.IMPORT_TOKEN)}} className="text-blue-400 text-xs font-bold uppercase tracking-wider hover:text-blue-300 transition bg-blue-500/10 px-3 py-1.5 rounded-lg border border-blue-500/20 hover:border-blue-500/40 hover:bg-blue-500/20">+ Import Token</button>
                   </div>
                   
                   <Card className="overflow-hidden" noPadding>
                     <div className="overflow-x-auto">
                       <table className="w-full">
                         <thead className="bg-slate-900/50 border-b border-slate-800">
                           <tr>
                             <th className="text-left py-3 px-6 text-xs font-bold text-slate-500 uppercase tracking-wider">Asset</th>
                             <th className="text-right py-3 px-6 text-xs font-bold text-slate-500 uppercase tracking-wider">Price</th>
                             <th className="text-right py-3 px-6 text-xs font-bold text-slate-500 uppercase tracking-wider">Balance</th>
                             <th className="text-right py-3 px-6 text-xs font-bold text-slate-500 uppercase tracking-wider">Value</th>
                           </tr>
                         </thead>
                         <tbody className="divide-y divide-slate-800/50">
                            {currentNetworkTokens.map(t => {
                              const bal = parseFloat(t.balance);
                              const price = t.priceUsd || 0;
                              const value = bal * price;
                              return (
                                <tr key={t.address} className="hover:bg-slate-800/30 transition-colors group cursor-default">
                                  <td className="py-4 px-6">
                                    <div className="flex items-center gap-3">
                                      <TokenIcon symbol={t.symbol} address={t.address} src={t.logoUrl} className="w-10 h-10 shadow-md" />
                                      <div>
                                        <div className="font-bold text-slate-200">{t.name}</div>
                                        <div className="text-xs text-slate-500 font-mono">{t.symbol}</div>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="py-4 px-6 text-right font-mono text-sm text-slate-400">
                                    {price > 0 ? `$${price.toLocaleString(undefined, {maximumFractionDigits: 6})}` : '-'}
                                  </td>
                                  <td className="py-4 px-6 text-right font-mono text-sm text-slate-200 font-medium">
                                    {bal > 0 ? bal.toFixed(6) : "0.00"}
                                  </td>
                                  <td className="py-4 px-6 text-right font-mono text-sm font-bold text-emerald-400">
                                    {value > 0 ? `$${value.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}` : '$0.00'}
                                  </td>
                                </tr>
                              );
                            })}
                         </tbody>
                       </table>
                       {currentNetworkTokens.length === 0 && <div className="text-center text-slate-500 py-12">No assets found on this network.</div>}
                     </div>
                   </Card>
                </div>
             </div>
          )}

          {/* Transactions View */}
          {view === ViewState.TRANSACTIONS && activeWallet && (
            <div className="animate-in fade-in space-y-6">
               <div className="flex justify-between items-center">
                 <div className="flex items-center gap-4">
                    <button onClick={()=>setView(ViewState.DASHBOARD)} className="p-2 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7 7-7m-7 7h18"/></svg>
                    </button>
                    <h2 className="text-2xl font-bold">Activity</h2>
                 </div>
                 <Button size="sm" variant="secondary" onClick={loadTransactions} isLoading={isFetchingTxs}>
                    Refresh
                 </Button>
               </div>
               
               <Card className="min-h-[400px] border-slate-800 bg-slate-900/40">
                  {isFetchingTxs ? (
                     <div className="flex flex-col items-center justify-center py-20 text-slate-500">
                        <svg className="animate-spin h-8 w-8 text-blue-500 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <p className="text-sm font-medium">Syncing blockchain data...</p>
                     </div>
                  ) : transactions.length === 0 ? (
                     <div className="text-center py-20 text-slate-500">
                        <div className="w-16 h-16 bg-slate-800/50 rounded-full flex items-center justify-center mx-auto mb-4">
                           <svg className="w-8 h-8 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
                        </div>
                        <h3 className="text-lg font-medium text-slate-400 mb-1">No Transactions Yet</h3>
                        <p className="text-xs text-slate-600 max-w-xs mx-auto">Transactions may take a moment to appear depending on the network speed.</p>
                     </div>
                  ) : (
                     <div className="divide-y divide-slate-800/50">
                        {transactions.map((tx) => {
                           const isSent = tx.from.toLowerCase() === activeWallet.address.toLowerCase();
                           const txTokenSymbol = tx.tokenSymbol || activeNetwork.symbol;
                           const txDecimals = tx.tokenDecimal || 18;
                           return (
                              <div key={tx.hash + (txTokenSymbol || "")} className="py-4 flex justify-between items-center group hover:bg-white/5 px-3 rounded-xl transition -mx-3">
                                 <div className="flex items-center gap-4">
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center border ${isSent ? 'border-red-500/20 bg-red-500/10 text-red-500' : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-500'}`}>
                                       {isSent ? 
                                          <svg className="w-5 h-5 transform -rotate-45" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 10l7-7m0 0l7 7m-7-7v18"/></svg> : 
                                          <svg className="w-5 h-5 transform rotate-135" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 10l7-7m0 0l7 7m-7-7v18"/></svg>
                                       }
                                    </div>
                                    <div>
                                       <div className="font-bold text-slate-200 text-sm">
                                          {isSent ? 'Sent' : 'Received'} {txTokenSymbol}
                                       </div>
                                       <div className="text-xs text-slate-500 font-mono mt-0.5">
                                          {isSent ? `To: ${formatAddress(tx.to)}` : `From: ${formatAddress(tx.from)}`}
                                       </div>
                                       <div className="text-[10px] text-slate-600 mt-0.5 font-medium uppercase tracking-wide">
                                          {new Date(tx.timeStamp * 1000).toLocaleString()}
                                       </div>
                                    </div>
                                 </div>
                                 <div className="text-right">
                                    <div className={`font-mono font-bold text-sm ${isSent ? 'text-slate-300' : 'text-emerald-400'}`}>
                                       {isSent ? '-' : '+'}{parseFloat(ethers.formatUnits(tx.value, txDecimals)).toFixed(4)}
                                    </div>
                                    <a href={`${activeNetwork.explorerUrl}/tx/${tx.hash}`} target="_blank" rel="noreferrer" className="text-[10px] text-blue-500 hover:text-blue-400 font-bold uppercase tracking-wider mt-1 inline-block opacity-0 group-hover:opacity-100 transition-opacity">
                                       Explorer ↗
                                    </a>
                                 </div>
                              </div>
                           );
                        })}
                     </div>
                  )}
               </Card>
            </div>
          )}
          
          {/* Swap View */}
          {view === ViewState.SWAP && (
             <div className="max-w-lg mx-auto">
                <Card className="border-slate-700/50 shadow-2xl p-8 relative overflow-hidden">
                   {/* Background Glow */}
                   <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>

                   <div className="flex justify-between items-center mb-6 relative z-10">
                      <h2 className="text-xl font-bold">Swap Tokens</h2>
                      <div className="text-xs bg-slate-800 px-2 py-1 rounded-md text-slate-400 border border-slate-700 font-medium">{activeNetwork.name}</div>
                   </div>
                   
                   {!activeNetwork.routerAddress ? (
                      <div className="text-center py-10">
                         <div className="text-red-400 bg-red-900/10 p-6 rounded-xl mb-4 border border-red-900/20">
                            <svg className="w-8 h-8 mx-auto mb-2 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                            Swapping is not configured for this network.
                         </div>
                         <p className="text-sm text-slate-500">Please switch to BSC, Ethereum, or Polygon to trade.</p>
                      </div>
                   ) : (
                     <div className="relative z-10">
                       {/* Input Token */}
                       <div className="bg-slate-950/60 border border-transparent hover:border-slate-700 focus-within:border-blue-500/50 focus-within:bg-slate-900 focus-within:ring-1 focus-within:ring-blue-500/20 p-4 rounded-2xl mb-2 transition-all">
                          <div className="flex justify-between text-xs mb-2 text-slate-400 font-medium">
                             <span>Pay</span>
                             <span className="cursor-pointer hover:text-blue-400 transition-colors bg-slate-800 px-2 rounded" onClick={handleSwapMax}>Max: {swapTokenIn?.balance ? parseFloat(swapTokenIn.balance).toFixed(4) : '0'}</span>
                          </div>
                          <div className="flex items-center gap-3">
                             <input type="number" value={swapAmountIn} onChange={e=>setSwapAmountIn(e.target.value)} className="bg-transparent text-3xl font-bold w-full outline-none placeholder-slate-700 text-white" placeholder="0" />
                             <select value={swapTokenIn?.address||""} onChange={e=>setSwapTokenIn(currentNetworkTokens.find(t=>t.address===e.target.value)||null)} className="bg-slate-800 text-white rounded-xl p-2 font-bold border border-slate-700 outline-none focus:ring-2 focus:ring-blue-500 max-w-[130px] shadow-lg cursor-pointer">
                                {currentNetworkTokens.map(t=><option key={t.address} value={t.address}>{t.symbol}</option>)}
                             </select>
                          </div>
                       </div>
                       
                       {/* Switcher */}
                       <div className="flex justify-center -my-5 relative z-20">
                          <button onClick={handleSwapSwitch} className="bg-slate-800 border-4 border-slate-900 p-2.5 rounded-xl hover:bg-slate-700 hover:scale-110 hover:rotate-180 transition-all duration-300 shadow-xl group">
                             <svg className="w-5 h-5 text-blue-400 group-hover:text-blue-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>
                          </button>
                       </div>
                       
                       {/* Output Token */}
                       <div className="bg-slate-950/60 border border-transparent hover:border-slate-700 focus-within:border-blue-500/50 focus-within:bg-slate-900 focus-within:ring-1 focus-within:ring-blue-500/20 p-4 rounded-2xl mt-2 mb-6 transition-all">
                          <div className="flex justify-between text-xs mb-2 text-slate-400 font-medium">
                             <span>Receive (Estimated)</span>
                             <span>Bal: {swapTokenOut?.balance ? parseFloat(swapTokenOut.balance).toFixed(4) : '0'}</span>
                          </div>
                          <div className="flex items-center gap-3">
                             <div className={`text-3xl font-bold w-full ${isQuoting ? 'text-slate-600 animate-pulse' : 'text-slate-300'}`}>
                                {isQuoting ? '...' : (swapAmountOut ? parseFloat(swapAmountOut).toFixed(6) : "0")}
                             </div>
                             <select value={swapTokenOut?.address||""} onChange={e=>setSwapTokenOut(currentNetworkTokens.find(t=>t.address===e.target.value)||null)} className="bg-slate-800 text-white rounded-xl p-2 font-bold border border-slate-700 outline-none focus:ring-2 focus:ring-blue-500 max-w-[130px] shadow-lg cursor-pointer">
                                {currentNetworkTokens.map(t=><option key={t.address} value={t.address}>{t.symbol}</option>)}
                             </select>
                          </div>
                       </div>
                       
                       {/* Price Impact / Details */}
                       {swapAmountOut && (
                          <div className="mb-6 p-4 bg-slate-800/50 rounded-xl text-xs space-y-2 border border-slate-700/50">
                             <div className="flex justify-between text-slate-400"><span>Network Fee</span><span>~ $0.05</span></div>
                             <div className="flex justify-between text-slate-400"><span>Slippage Tolerance</span><span className="text-orange-400">2%</span></div>
                          </div>
                       )}

                       {swapNeedsApproval ? (
                          <Button onClick={handleSwapApprove} className="w-full py-4 text-lg font-bold" isLoading={isLoading}>Unlock {swapTokenIn?.symbol}</Button> 
                       ) : (
                          <Button onClick={handleSwapExecute} className="w-full py-4 text-lg font-bold shadow-lg shadow-blue-500/20" isLoading={isLoading} disabled={!swapAmountIn || !swapAmountOut}>Swap Now</Button>
                       )}
                     </div>
                   )}
                </Card>
             </div>
          )}
          
          {/* Send View */}
          {view === ViewState.SEND && (
             <Card className="max-w-lg mx-auto">
                <div className="flex gap-4 items-center mb-8">
                   <button onClick={()=>setView(ViewState.DASHBOARD)} className="p-2 hover:bg-slate-800 rounded-full transition"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg></button>
                   <h2 className="font-bold text-xl">Send Asset</h2>
                </div>
                <div className="space-y-6">
                   <div>
                      <label className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-2 block ml-1">Asset</label>
                      <div className="relative">
                        <select className="w-full bg-slate-950 border border-slate-700 rounded-xl p-4 appearance-none outline-none focus:border-blue-500 transition cursor-pointer" onChange={e=>setSelectedTokenForSend(currentNetworkTokens.find(t=>t.address===e.target.value)||null)} value={selectedTokenForSend?.address||""}>
                           <option value="">Select Asset to Send</option>
                           {currentNetworkTokens.map(t=><option key={t.address} value={t.address}>{t.symbol} (Bal: {parseFloat(t.balance).toFixed(4)})</option>)}
                        </select>
                        <div className="absolute right-4 top-4 pointer-events-none text-slate-500">▼</div>
                      </div>
                   </div>
                   
                   <div>
                      <label className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-2 block ml-1">Recipient Address</label>
                      <input value={sendAddress} onChange={e=>setSendAddress(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-4 outline-none focus:border-blue-500 transition font-mono text-sm placeholder-slate-700" placeholder="0x..." />
                   </div>
                   
                   <div>
                      <label className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-2 block ml-1">Amount</label>
                      <div className="relative">
                         <input type="number" value={sendAmount} onChange={e=>setSendAmount(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-4 outline-none focus:border-blue-500 transition pr-20 text-lg font-bold placeholder-slate-700" placeholder="0.00" />
                         <button onClick={handleSendMax} className="absolute right-3 top-3 bottom-3 px-3 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors">Max</button>
                      </div>
                   </div>
                   
                   <div className="pt-4">
                     <Button onClick={handleSend} className="w-full py-4 text-lg font-bold shadow-lg shadow-blue-500/20" disabled={!selectedTokenForSend || !sendAddress || !sendAmount} size="lg">Confirm Transaction</Button>
                   </div>
                </div>
             </Card>
          )}

          {/* Import Token View */}
          {view === ViewState.IMPORT_TOKEN && (
             <Card className="max-w-lg mx-auto">
                <div className="flex gap-4 items-center mb-6"><button onClick={()=>setView(ViewState.DASHBOARD)} className="p-2 hover:bg-slate-800 rounded-full"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg></button><h2 className="font-bold text-xl">Import Token</h2></div>
                <p className="text-sm text-slate-400 mb-6 bg-slate-800/50 p-4 rounded-xl border border-slate-700/50">Add a custom token to your {activeNetwork.name} wallet list. You can find contract addresses on blockchain explorers.</p>
                <div className="flex gap-2 mb-6">
                   <input value={importTokenAddress} onChange={e=>setImportTokenAddress(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-4 outline-none focus:border-blue-500 font-mono text-sm" placeholder="Contract Address (0x...)" />
                   <Button onClick={handleCheckToken} isLoading={isLoading}>Check</Button>
                </div>
                {importTokenPreview && (
                   <div className="bg-slate-800/50 border border-slate-700 p-6 rounded-xl text-center animate-in zoom-in-95">
                      <div className="flex justify-center mb-4">
                         <TokenIcon symbol={importTokenPreview.symbol} address={importTokenPreview.address} className="w-16 h-16 shadow-lg" />
                      </div>
                      <div className="font-bold text-xl mb-1 text-white">{importTokenPreview.name}</div>
                      <div className="text-slate-400 text-sm mb-6 font-mono">{importTokenPreview.symbol} • {importTokenPreview.decimals} Decimals</div>
                      <Button onClick={handleConfirmImportToken} className="w-full">Add Token to Wallet</Button>
                   </div>
                )}
             </Card>
          )}
          
          {view === ViewState.RECEIVE && activeWallet && (
             <Card className="max-w-md mx-auto text-center py-12">
                <button onClick={()=>setView(ViewState.DASHBOARD)} className="mb-8 text-slate-400 hover:text-white flex items-center justify-center gap-1 mx-auto text-sm font-bold uppercase tracking-wider"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg> Back</button>
                <h2 className="text-2xl font-bold mb-2">Receive Assets</h2>
                <p className="text-slate-400 text-sm mb-8">Scan to send {activeNetwork.name} assets to this wallet.</p>
                
                <div className="bg-white p-3 inline-block rounded-2xl mb-8 shadow-2xl relative group">
                   <div className="absolute inset-0 bg-blue-500 rounded-2xl blur-xl opacity-20 group-hover:opacity-40 transition duration-500"></div>
                   <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${activeWallet.address}`} className="w-48 h-48 relative z-10" />
                </div>
                
                <div className="bg-slate-950 border border-slate-800 p-4 rounded-2xl break-all font-mono text-sm text-slate-300 select-all hover:bg-slate-900 transition cursor-copy group relative" onClick={() => {navigator.clipboard.writeText(activeWallet.address); setStatusMessage({type:'success', text:'Address Copied!'})}} title="Click to Copy">
                   {activeWallet.address}
                   <div className="text-[10px] text-blue-500 mt-2 font-sans uppercase font-bold tracking-wider group-hover:text-blue-400">Click address to Copy</div>
                </div>
             </Card>
          )}
          
          {view === ViewState.BROWSER && (
             <div className="animate-in fade-in">
                <div className="flex gap-4 mb-6 items-center">
                   <button onClick={()=>setView(ViewState.DASHBOARD)} className="p-2 hover:bg-slate-800 rounded-full transition"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg></button>
                   <h2 className="text-2xl font-bold">Web3 Browser</h2>
                </div>
                
                {/* Search Bar */}
                <div className="bg-slate-800/80 p-2 rounded-2xl flex gap-2 mb-8 border border-slate-700/50 focus-within:border-blue-500/50 focus-within:ring-2 focus-within:ring-blue-500/20 transition shadow-lg backdrop-blur-md sticky top-20 z-30">
                   <div className="flex items-center pl-3 text-slate-400">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                   </div>
                   <input 
                      value={browserUrl} 
                      onChange={e => {
                         setBrowserUrl(e.target.value);
                         setBrowserPage(1); // Reset page on search
                      }} 
                      className="bg-transparent w-full outline-none text-base placeholder-slate-500 py-3" 
                      placeholder="Search DApps or enter URL..." 
                      onKeyDown={e=>{if(e.key==='Enter') handleBrowserGo()}} 
                   />
                   <Button size="md" onClick={handleBrowserGo} className="rounded-xl shadow-none">Go</Button>
                </div>

                {/* Filter & Pagination Logic */}
                {(() => {
                   const filteredDapps = DAPP_LIST.filter(d => 
                      d.name.toLowerCase().includes(browserUrl.toLowerCase()) || 
                      d.description.toLowerCase().includes(browserUrl.toLowerCase())
                   );
                   const totalPages = Math.ceil(filteredDapps.length / BROWSER_ITEMS_PER_PAGE);
                   const displayedDapps = filteredDapps.slice((browserPage - 1) * BROWSER_ITEMS_PER_PAGE, browserPage * BROWSER_ITEMS_PER_PAGE);

                   return (
                      <>
                         {filteredDapps.length === 0 ? (
                            <div className="text-center py-20 text-slate-500">
                               <p>No DApps found matching "{browserUrl}"</p>
                               {browserUrl.includes('.') && <button onClick={handleBrowserGo} className="text-blue-400 underline mt-2 hover:text-blue-300">Go to URL: {browserUrl}</button>}
                            </div>
                         ) : (
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                               {displayedDapps.map((d) => (
                                  <div 
                                     key={d.name} 
                                     className="bg-slate-800/40 backdrop-blur border border-slate-700/50 rounded-2xl p-5 hover:bg-slate-800 hover:-translate-y-1 hover:border-blue-500/30 transition-all duration-300 cursor-pointer group shadow-lg flex flex-col h-full" 
                                     onClick={() => window.open(d.url, '_blank')}
                                  >
                                     <div className={`w-14 h-14 rounded-2xl mb-4 bg-gradient-to-br ${d.color} shadow-lg group-hover:shadow-blue-500/20 transition flex items-center justify-center text-white font-bold text-xl`}>
                                        {d.name.substring(0,2)}
                                     </div>
                                     <div className="flex justify-between items-start mb-1">
                                       <div className="font-bold text-lg text-slate-100 group-hover:text-white transition-colors">{d.name}</div>
                                     </div>
                                     <div className="text-[10px] text-slate-400 mb-3 uppercase tracking-wider font-bold bg-slate-950/50 inline-block px-2 py-1 rounded self-start border border-slate-800">{d.category}</div>
                                     <p className="text-xs text-slate-400 line-clamp-3 leading-relaxed flex-1">{d.description}</p>
                                     <div className="mt-4 text-xs text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity font-bold uppercase tracking-wider">Open DApp →</div>
                                  </div>
                               ))}
                            </div>
                         )}

                         {/* Pagination Controls */}
                         {totalPages > 1 && (
                            <div className="flex justify-center items-center gap-4 mt-8 pt-6 border-t border-slate-800/50">
                               <button 
                                  onClick={() => setBrowserPage(p => Math.max(1, p - 1))}
                                  disabled={browserPage === 1}
                                  className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition border border-slate-700"
                               >
                                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg>
                               </button>
                               <span className="text-sm font-medium text-slate-400">
                                  Page <span className="text-white font-bold">{browserPage}</span> of {totalPages}
                               </span>
                               <button 
                                  onClick={() => setBrowserPage(p => Math.min(totalPages, p + 1))}
                                  disabled={browserPage === totalPages}
                                  className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition border border-slate-700"
                               >
                                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
                               </button>
                            </div>
                         )}
                      </>
                   );
                })()}
             </div>
          )}
          
          {view === ViewState.WALLET_DETAILS && activeWallet && (
             <Card className="max-w-md mx-auto">
                <div className="flex gap-4 mb-6 items-center"><button onClick={()=>setView(ViewState.DASHBOARD)} className="p-2 hover:bg-slate-800 rounded-full transition"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg></button><h2 className="font-bold text-xl">Manage Wallets</h2></div>
                
                <div className="space-y-8">
                   {/* Wallet List Section */}
                   <div>
                       <div className="flex justify-between items-center mb-3 ml-1">
                           <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">My Wallets</h3>
                           <button onClick={handleAddNewWallet} className="text-xs text-blue-400 font-bold uppercase tracking-wider hover:text-blue-300">+ Add New</button>
                       </div>
                       <div className="space-y-2">
                           {wallets.map((w) => (
                               <div 
                                   key={w.id} 
                                   onClick={() => handleSwitchWallet(w.id)}
                                   className={`p-4 rounded-xl border cursor-pointer transition-all flex justify-between items-center group ${w.id === activeWalletId ? 'bg-blue-600/10 border-blue-500/50 shadow-md' : 'bg-slate-800/40 border-slate-700/50 hover:bg-slate-800 hover:border-slate-600'}`}
                               >
                                   <div className="flex items-center gap-3">
                                       <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${w.id === activeWalletId ? 'bg-blue-500 text-white' : 'bg-slate-700 text-slate-400'}`}>
                                           {w.name.substring(0,1)}
                                       </div>
                                       <div>
                                           <div className={`font-bold text-sm ${w.id === activeWalletId ? 'text-white' : 'text-slate-300'}`}>{w.name}</div>
                                           <div className="text-[10px] font-mono text-slate-500">{formatAddress(w.address)}</div>
                                       </div>
                                   </div>
                                   {w.id === activeWalletId && (
                                       <div className="text-blue-400">
                                           <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"/></svg>
                                       </div>
                                   )}
                               </div>
                           ))}
                       </div>
                   </div>

                   <hr className="border-slate-800" />

                   <div>
                      <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 ml-1">Active Wallet Settings</h3>
                      <div className="bg-slate-800/50 border border-slate-700/50 p-4 rounded-xl mb-4">
                        <label className="text-xs text-slate-500 font-bold uppercase mb-2 block">Edit Name</label>
                        <div className="flex gap-2">
                           {isEditingName ? (
                               <>
                                  <input 
                                    value={editNameInput} 
                                    onChange={e => setEditNameInput(e.target.value)} 
                                    className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500"
                                    autoFocus
                                    placeholder="Enter wallet name"
                                  />
                                  <Button size="sm" onClick={handleSaveWalletName}>Save</Button>
                                  <Button size="sm" variant="secondary" onClick={() => setIsEditingName(false)}>Cancel</Button>
                               </>
                           ) : (
                               <div className="flex justify-between items-center w-full">
                                  <span className="font-medium text-lg text-white pl-1">{activeWallet.name}</span>
                                  <button onClick={() => { setEditNameInput(activeWallet.name); setIsEditingName(true); }} className="p-2 hover:bg-slate-700 rounded-lg text-blue-400 transition-colors">
                                     <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                  </button>
                               </div>
                           )}
                        </div>
                      </div>
                      
                      <div className="p-5 bg-red-500/5 border border-red-500/20 rounded-2xl">
                         <h3 className="text-red-400 font-bold mb-2 flex items-center gap-2 text-sm"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg> Export Private Key</h3>
                         <p className="text-xs text-slate-500 mb-4 leading-relaxed">Viewing your private key is dangerous. Never share this with anyone, including support staff.</p>
                         <input type="password" value={authPassword} onChange={e=>setAuthPassword(e.target.value)} placeholder="Enter Vault Password to Decrypt" className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 mb-3 text-sm focus:border-red-500 outline-none transition" />
                         {authPassword===password && activeWallet ? (
                            <div className="bg-slate-950 p-4 rounded-xl font-mono text-xs break-all border border-slate-800 text-yellow-500 select-all shadow-inner">{activeWallet.privateKey}</div>
                         ) : <div className="text-xs text-slate-600 italic pl-1">Key is encrypted and hidden</div>}
                      </div>
                   </div>
                   
                   <div>
                      <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 ml-1">Danger Zone</h3>
                      <button onClick={handleResetApp} className="w-full border border-red-900/50 text-red-500 p-4 rounded-2xl hover:bg-red-900/10 transition text-sm font-bold flex items-center justify-center gap-2">
                         <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                         Factory Reset App
                      </button>
                      <p className="text-[10px] text-slate-600 mt-2 text-center">This will delete ALL wallets from this browser. Make sure you have backups for everything.</p>
                   </div>
                </div>
             </Card>
          )}

       </main>
       <Footer />
       
       {/* Floating AI Chat Button */}
       <button onClick={()=>setShowAiChat(!showAiChat)} className="fixed bottom-6 right-6 w-14 h-14 bg-gradient-to-tr from-blue-600 to-purple-600 hover:scale-110 rounded-full shadow-2xl shadow-purple-900/50 flex items-center justify-center text-white z-50 transition duration-300 group ring-2 ring-white/10">
         {showAiChat ? (
             <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
         ) : (
             <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
         )}
         <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-ping"></span>
         <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full"></span>
       </button>
       
       {showAiChat && (
          <div className="fixed bottom-24 right-6 w-[380px] max-w-[90vw] h-[600px] max-h-[70vh] bg-slate-900 border border-slate-700 rounded-3xl shadow-2xl flex flex-col z-50 animate-in slide-in-from-bottom-10 overflow-hidden ring-1 ring-white/10">
             <div className="p-4 border-b border-slate-800 bg-slate-900/90 backdrop-blur-md flex justify-between items-center">
                <div className="font-bold flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-500 to-purple-500 flex items-center justify-center">
                        <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                    </div>
                    <div>
                        <div className="text-sm text-white">Gemini AI</div>
                        <div className="text-[10px] text-green-400 font-medium flex items-center gap-1"><span className="w-1.5 h-1.5 bg-green-400 rounded-full"></span> Online</div>
                    </div>
                </div>
                <button onClick={()=>setShowAiChat(false)} className="text-slate-500 hover:text-white transition"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg></button>
             </div>
             <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-950/50 custom-scrollbar">
                {chatHistory.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full text-center p-6 text-slate-500 space-y-4">
                        <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center opacity-50">
                            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
                        </div>
                        <p className="text-sm">I am your crypto assistant. Ask me about your wallet, tokens, or how to use DeFi!</p>
                        <div className="flex flex-wrap justify-center gap-2">
                            <button onClick={()=>setChatInput("How do I swap tokens?")} className="text-xs bg-slate-800 px-3 py-1.5 rounded-full hover:bg-slate-700 transition">How do I swap?</button>
                            <button onClick={()=>setChatInput("Is this wallet secure?")} className="text-xs bg-slate-800 px-3 py-1.5 rounded-full hover:bg-slate-700 transition">Security info</button>
                        </div>
                    </div>
                )}
                {chatHistory.map((m,i)=>(
                   <div key={i} className={`flex ${m.role==='user'?'justify-end':'justify-start'} animate-in slide-in-from-bottom-2`}>
                      <div className={`p-3.5 rounded-2xl text-sm max-w-[85%] leading-relaxed shadow-sm ${m.role==='user'?'bg-blue-600 text-white rounded-br-none':'bg-slate-800 text-slate-200 rounded-bl-none border border-slate-700'}`}>{m.text}</div>
                   </div>
                ))}
                {isAiThinking && (
                    <div className="flex justify-start animate-in slide-in-from-bottom-2">
                        <div className="bg-slate-800 p-3 rounded-2xl rounded-bl-none text-xs text-slate-400 flex gap-1 items-center border border-slate-700">
                            <span className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce"></span>
                            <span className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce delay-100"></span>
                            <span className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce delay-200"></span>
                        </div>
                    </div>
                )}
             </div>
             <div className="p-3 border-t border-slate-800 bg-slate-900 flex gap-2">
                <input value={chatInput} onChange={e=>setChatInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter') handleAiAsk()}} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm focus:border-blue-500 outline-none transition placeholder-slate-600" placeholder="Type your question..." />
                <button onClick={handleAiAsk} className="bg-blue-600 hover:bg-blue-500 text-white p-3 rounded-xl transition shadow-lg shadow-blue-900/20 active:scale-95"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9-2-9-18-9 18 9-2zm0 0v-8" /></svg></button>
             </div>
          </div>
       )}
    </div>
  );
}
