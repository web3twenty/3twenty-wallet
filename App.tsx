
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
  fetchTransactions
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
  const BROWSER_ITEMS_PER_PAGE = 6;

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
        await new Promise(r => setTimeout(r, 200));
      } catch (e) {
        console.error(`Error fetching balance for ${token.symbol}`, e);
      }
    }
    setTokens(updatedTokens);
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
    // Navigate to dedicated reset view instead of window.confirm
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
    setSeedVerifyIndices([0, 5, 11]); // simplified for brevity
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
       const newW = { id: Date.now().toString(), name: `Imp ${wallets.length}`, ...w };
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
  const isAuthView = [ViewState.DASHBOARD, ViewState.SEND, ViewState.RECEIVE, ViewState.SWAP, ViewState.BROWSER, ViewState.WALLET_DETAILS, ViewState.IMPORT_TOKEN, ViewState.ADD_NETWORK, ViewState.TRANSACTIONS].includes(view);

  if (!isAuthView) {
     // RESET WALLET VIEW
     if (view === ViewState.RESET_WALLET) return (
       <div className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden font-sans">
          <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
             <div className="absolute top-[50%] left-[50%] w-[80%] h-[80%] -translate-x-1/2 -translate-y-1/2 bg-red-600/10 rounded-full blur-[120px]"></div>
          </div>
          <Card className="max-w-md w-full relative z-10 border-red-900/40 shadow-2xl bg-slate-900/90 backdrop-blur-2xl p-8 ring-1 ring-red-500/20">
             <div className="flex flex-col items-center text-center mb-6">
                <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mb-4 border border-red-500/20">
                   <svg className="w-10 h-10 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                </div>
                <h1 className="text-2xl font-bold text-white mb-2">Reset Wallet?</h1>
                <p className="text-slate-400 text-sm leading-relaxed">
                   This action will <strong>permanently delete</strong> the wallet stored on this browser. 
                   <br/><br/>
                   If you have forgotten your password, this is the only way to regain access. You <strong>MUST</strong> have your 12-word Secret Recovery Phrase to restore your funds.
                </p>
             </div>
             <div className="flex flex-col gap-3">
                <Button onClick={handleConfirmReset} className="w-full bg-red-600 hover:bg-red-700 text-white border-red-500 py-4 font-bold shadow-lg shadow-red-900/20" size="lg">
                   Yes, Delete & Reset
                </Button>
                <Button onClick={() => setView(ViewState.UNLOCK)} variant="secondary" className="w-full py-3" size="lg">
                   Cancel
                </Button>
             </div>
          </Card>
       </div>
     );

     // UNLOCK VIEW
     if (view === ViewState.UNLOCK) return (
        <div className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden font-sans">
           {/* Background Effects */}
           <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
              <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] bg-blue-600/10 rounded-full blur-[120px] animate-pulse"></div>
              <div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] bg-purple-600/10 rounded-full blur-[120px] animate-pulse"></div>
           </div>

          <Card className="max-w-md w-full relative z-10 border-slate-700/40 shadow-2xl bg-slate-900/70 backdrop-blur-2xl p-10 ring-1 ring-white/10">
             {/* Back Button */}
             <div className="absolute top-5 left-5">
                <button onClick={() => setView(ViewState.LANDING)} className="text-slate-500 hover:text-white flex items-center gap-1 text-xs font-bold uppercase tracking-wider transition-colors group">
                   <svg className="w-4 h-4 group-hover:-translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg>
                   Back
                </button>
             </div>

             <div className="flex flex-col items-center mb-10 mt-2">
               <div className="w-24 h-24 bg-gradient-to-br from-slate-800 to-slate-900 rounded-3xl flex items-center justify-center mb-6 shadow-xl border border-slate-700/50">
                 <img src={HEADER_LOGO_URL} className="h-14 w-auto object-contain drop-shadow-md" alt="Logo" />
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
                 <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                 {statusMessage.text}
               </div>
             )}
          </Card>
        </div>
     );

     if (view === ViewState.LANDING) {
        return (
          <div className="min-h-screen flex flex-col font-sans">
             {/* Landing Nav */}
             <div className="max-w-7xl mx-auto w-full p-6 flex justify-between items-center z-20 relative">
                <div className="flex items-center gap-3">
                   <img src={HEADER_LOGO_URL} className="h-10 w-auto" />
                   <span className="font-bold text-xl tracking-tight hidden sm:block">3Twenty Wallet</span>
                </div>
                <div className="flex gap-4">
                  <Button variant="ghost" onClick={() => setView(ViewState.UNLOCK)}>Login</Button>
                  <Button onClick={() => setView(ViewState.SETUP_PASSWORD)}>Get Started</Button>
                </div>
             </div>
             
             {/* Hero */}
             <div className="flex-1 flex flex-col items-center justify-center px-6 relative overflow-hidden pb-20 pt-10">
                 {/* Decorative Mesh */}
                 <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    <div className="absolute top-[20%] left-[20%] w-96 h-96 bg-blue-600/20 rounded-full blur-[128px] animate-pulse"></div>
                    <div className="absolute bottom-[20%] right-[20%] w-96 h-96 bg-emerald-500/10 rounded-full blur-[128px] animate-pulse delay-1000"></div>
                 </div>

                <div className="relative z-10 text-center max-w-4xl mx-auto">
                   <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-900/30 border border-blue-500/30 text-blue-300 text-sm font-medium mb-8 backdrop-blur-md animate-in slide-in-from-bottom-5 fade-in duration-700">
                      <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse"></span>
                      Now with AI Assistant & Swap
                   </div>
                   <h1 className="text-5xl md:text-7xl font-extrabold mb-8 leading-tight tracking-tight text-white drop-shadow-sm animate-in slide-in-from-bottom-5 fade-in duration-700 delay-100">
                      Your Gateway to <br/> 
                      <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-purple-400 to-emerald-400">Decentralized Finance</span>
                   </h1>
                   <p className="text-slate-400 mb-10 max-w-2xl mx-auto text-lg md:text-xl leading-relaxed animate-in slide-in-from-bottom-5 fade-in duration-700 delay-200">
                      Secure, non-custodial, and AI-powered. Manage your assets across Binance Smart Chain, Ethereum, and Polygon with confidence.
                   </p>
                   <div className="flex flex-col sm:flex-row gap-4 justify-center animate-in slide-in-from-bottom-5 fade-in duration-700 delay-300">
                      <Button onClick={() => setView(ViewState.SETUP_PASSWORD)} className="px-10 py-4 text-lg shadow-blue-500/25 shadow-xl hover:scale-105 transition-transform" size="lg">Create Free Wallet</Button>
                      <Button onClick={() => setView(ViewState.UNLOCK)} variant="secondary" className="px-10 py-4 text-lg hover:scale-105 transition-transform" size="lg">Access Wallet</Button>
                   </div>
                </div>
             </div>

             {/* Features Grid */}
             <div className="bg-slate-900/50 border-t border-slate-800/50 backdrop-blur-lg relative z-10">
               <div className="max-w-7xl mx-auto w-full px-6 py-20">
                  <div className="text-center mb-16">
                     <h2 className="text-3xl font-bold mb-4">Why choose 3Twenty?</h2>
                     <p className="text-slate-400">Built for security, designed for ease of use.</p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                     <Card className="p-8 border-t-4 border-t-emerald-500 hover:-translate-y-2 transition-transform duration-300 bg-slate-800/40">
                        <div className="w-12 h-12 bg-emerald-500/10 rounded-xl flex items-center justify-center mb-4 text-emerald-400">
                           <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
                        </div>
                        <h3 className="font-bold text-lg mb-2 text-emerald-100">Self Custodial</h3>
                        <p className="text-sm text-slate-400 leading-relaxed">Your keys NEVER leave your device. Complete control over your assets.</p>
                     </Card>
                     <Card className="p-8 border-t-4 border-t-blue-500 hover:-translate-y-2 transition-transform duration-300 bg-slate-800/40">
                        <div className="w-12 h-12 bg-blue-500/10 rounded-xl flex items-center justify-center mb-4 text-blue-400">
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                        </div>
                        <h3 className="font-bold text-lg mb-2 text-blue-100">Lightning Fast</h3>
                        <p className="text-sm text-slate-400 leading-relaxed">Optimized for speed on BSC and other EVM chains. Instant interactions.</p>
                     </Card>
                     <Card className="p-8 border-t-4 border-t-purple-500 hover:-translate-y-2 transition-transform duration-300 bg-slate-800/40">
                        <div className="w-12 h-12 bg-purple-500/10 rounded-xl flex items-center justify-center mb-4 text-purple-400">
                           <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/></svg>
                        </div>
                        <h3 className="font-bold text-lg mb-2 text-purple-100">AI Assistant</h3>
                        <p className="text-sm text-slate-400 leading-relaxed">Integrated Gemini AI helps you understand transactions and concepts.</p>
                     </Card>
                     <Card className="p-8 border-t-4 border-t-orange-500 hover:-translate-y-2 transition-transform duration-300 bg-slate-800/40">
                        <div className="w-12 h-12 bg-orange-500/10 rounded-xl flex items-center justify-center mb-4 text-orange-400">
                           <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                        </div>
                        <h3 className="font-bold text-lg mb-2 text-orange-100">Multi-Chain</h3>
                        <p className="text-sm text-slate-400 leading-relaxed">One wallet for all your assets. Seamlessly switch networks.</p>
                     </Card>
                  </div>
               </div>
             </div>
             <Footer />
          </div>
        );
     }
     
     // SETUP PASSWORD VIEW
     if (view === ViewState.SETUP_PASSWORD) return (
       <div className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden font-sans">
          {/* Background Effects */}
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
       <div className="min-h-screen flex items-center justify-center p-4">
          <Card className="max-w-md w-full p-8">
            <h1 className="text-2xl font-bold mb-2">Setup Wallet</h1>
            <p className="text-slate-400 text-sm mb-6">Create a new wallet or import an existing one.</p>
            
            <Button onClick={handleStartCreateWallet} className="w-full mb-6 py-3">Create New Wallet</Button>
            
            <div className="relative my-6">
               <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-slate-700"></span></div>
               <div className="relative flex justify-center text-xs uppercase font-bold tracking-wider"><span className="bg-[#101929] px-2 text-slate-500">Or Import Existing</span></div>
            </div>
            
            <input value={importInput} onChange={e=>setImportInput(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-4 mb-4 text-sm focus:border-blue-500 outline-none transition" placeholder="Paste Private Key or Mnemonic" />
            <Button onClick={handleImportWallet} variant="secondary" className="w-full py-3" disabled={!importInput}>Import Wallet</Button>
          </Card>
       </div>
     );
     // Seed Backup
     if (view === ViewState.SEED_BACKUP && tempWallet) return (
        <div className="min-h-screen flex items-center justify-center p-4">
           <Card className="max-w-md w-full p-8">
              <h1 className="text-xl font-bold mb-4">Backup Seed Phrase</h1>
              <div className="bg-red-500/10 border border-red-500/20 p-3 rounded-lg flex gap-3 mb-6">
                 <svg className="w-5 h-5 text-red-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                 <p className="text-xs text-red-300 leading-relaxed">Write these 12 words down in order. If you lose them, your funds are lost forever. Do not share them with anyone.</p>
              </div>
              
              <div className="grid grid-cols-3 gap-3 mb-8">
                 {tempWallet.mnemonic?.split(" ").map((word, i) => (
                    <div key={i} className="bg-slate-950 border border-slate-800 p-2 rounded-lg text-xs text-center font-mono text-slate-300 relative group">
                        <span className="absolute top-1 left-2 text-[8px] text-slate-600">{i+1}</span>
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
                          className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm focus:border-blue-500 outline-none"
                          onChange={(e) => {
                             const val = e.target.value.toLowerCase().trim();
                             setSeedVerifyInputs(prev => ({...prev, [idx]: val}));
                          }}
                          placeholder={`Enter word #${idx+1}`}
                       />
                    </div>
                 ))}
              </div>
              {statusMessage && <div className="text-red-400 text-sm text-center mb-4">{statusMessage.text}</div>}
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
       <header className="bg-slate-900/80 backdrop-blur-md border-b border-slate-800 sticky top-0 z-40 supports-[backdrop-filter]:bg-slate-900/60">
          <div className="max-w-7xl mx-auto px-4 py-3 flex justify-between items-center">
             {/* Logo Section */}
             <div className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition group" onClick={()=>setView(ViewState.DASHBOARD)}>
                <img src={HEADER_LOGO_URL} className="h-9 w-auto object-contain group-hover:scale-105 transition-transform" alt="Logo" />
                <span className="font-bold text-lg hidden sm:block">3Twenty</span>
             </div>
             
             {/* Center Nav (Desktop) */}
             <div className="hidden md:flex gap-1 bg-slate-800/50 p-1.5 rounded-xl border border-slate-700/50">
                {[
                   {v: ViewState.DASHBOARD, label: 'Wallet'}, 
                   {v: ViewState.SWAP, label: 'Swap'}, 
                   {v: ViewState.BROWSER, label: 'Browser'}, 
                   {v: ViewState.TRANSACTIONS, label: 'Activity'},
                   {v: ViewState.WALLET_DETAILS, label: 'Settings'}
                ].map(item => (
                   <button 
                      key={item.v}
                      onClick={()=>setView(item.v)} 
                      className={`px-5 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${view===item.v ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'}`}
                   >
                      {item.label}
                   </button>
                ))}
             </div>

             {/* Right Section: Network & Lock */}
             <div className="flex items-center gap-3">
                {/* Network Selector */}
                <div className="relative group z-50">
                   <button className="bg-slate-800/80 px-4 py-2 rounded-xl text-sm flex items-center gap-2 border border-slate-700 hover:border-slate-600 transition min-w-[140px] justify-between shadow-sm">
                      <div className="flex items-center gap-2">
                         <span className="w-2 h-2 rounded-full bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.5)]"></span>
                         <span className="truncate max-w-[80px] font-medium">{activeNetwork.name}</span>
                      </div>
                      <svg className="w-3 h-3 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"/></svg>
                   </button>
                   <div className="absolute top-full right-0 mt-2 w-64 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl hidden group-hover:block overflow-hidden ring-1 ring-white/5 animate-in fade-in zoom-in-95 duration-150">
                      <div className="p-3 bg-slate-950/50 border-b border-slate-800 text-xs font-bold text-slate-500 uppercase tracking-wider">Select Network</div>
                      <div className="max-h-64 overflow-y-auto">
                        {NETWORKS.map((net, i) => (
                           <div key={i} onClick={() => { setActiveNetwork(net); setView(ViewState.DASHBOARD); }} className="px-4 py-3 hover:bg-slate-800 cursor-pointer text-sm flex items-center justify-between group-item transition-colors border-b border-slate-800/50 last:border-0">
                              <span className="font-medium">{net.name}</span>
                              {activeNetwork.chainId === net.chainId && <span className="text-green-400"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"/></svg></span>}
                           </div>
                        ))}
                        {customNetworks.map((net, i) => (
                           <div key={`cust-${i}`} onClick={() => { setActiveNetwork(net); setView(ViewState.DASHBOARD); }} className="px-4 py-3 hover:bg-slate-800 cursor-pointer text-sm flex items-center justify-between transition-colors border-b border-slate-800/50 last:border-0">
                              <span>{net.name} <span className="text-xs text-slate-500 ml-1">(Custom)</span></span>
                              {activeNetwork.chainId === net.chainId && <span className="text-green-400">✓</span>}
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
                   className="bg-slate-800/80 p-2 rounded-xl text-slate-400 hover:text-red-400 hover:bg-slate-800 border border-slate-700 transition shadow-sm" 
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
                <button onClick={()=>navigateTo(ViewState.WALLET_DETAILS)} className="block w-full text-left p-3 rounded-lg hover:bg-slate-800 transition">Settings</button>
                <button onClick={handleLock} className="block w-full text-left p-3 rounded-lg hover:bg-red-900/10 text-red-400 transition font-medium">Lock Wallet</button>
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
                      {/* Abstract Shapes */}
                      <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>
                      <div className="absolute bottom-0 left-0 w-64 h-64 bg-purple-500/5 rounded-full blur-3xl -ml-16 -mb-16 pointer-events-none"></div>
                      
                      <div className="relative z-10">
                         <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-800/50 border border-slate-700/50 mb-6 backdrop-blur-sm">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                            <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">{activeNetwork.name} Mainnet</span>
                         </div>
                         
                         <h2 className="text-5xl md:text-6xl font-extrabold text-white mb-8 tracking-tight drop-shadow-sm">
                            {currentNetworkTokens.find(t=>t.isNative)?.balance || "0.00"} <span className="text-2xl md:text-3xl font-bold text-slate-400">{activeNetwork.symbol}</span>
                         </h2>
                         
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
                   <div className="flex justify-between items-center px-4 mb-3">
                      <h3 className="font-bold text-lg text-slate-200">Assets</h3>
                      <button onClick={()=>{setImportTokenAddress(""); setImportTokenPreview(null); setView(ViewState.IMPORT_TOKEN)}} className="text-blue-400 text-xs font-bold uppercase tracking-wider hover:text-blue-300 transition bg-blue-900/20 px-3 py-1.5 rounded-lg border border-blue-900/30">+ Import Token</button>
                   </div>
                   
                   <div className="space-y-3">
                      {currentNetworkTokens.map(t => (
                         <Card key={t.address} className="flex justify-between items-center p-4 hover:bg-slate-800/80 transition cursor-default group border-slate-800/60 hover:border-blue-500/20 shadow-sm" noPadding>
                            <div className="flex items-center gap-4 p-4 w-full">
                               <TokenIcon symbol={t.symbol} address={t.address} src={t.logoUrl} className="w-12 h-12 shadow-md" />
                               <div className="flex-1">
                                  <div className="flex justify-between items-start">
                                     <div>
                                        <div className="font-bold text-lg text-slate-100 group-hover:text-white transition-colors">{t.name}</div>
                                        <div className="text-xs text-slate-500 font-bold tracking-wider">{t.symbol}</div>
                                     </div>
                                     <div className="text-right">
                                        <div className="font-mono text-lg font-medium text-slate-200 tracking-tight">{parseFloat(t.balance) > 0 ? parseFloat(t.balance).toFixed(6) : "0.00"}</div>
                                        {/* Placeholder for Fiat Value if available later */}
                                        <div className="text-xs text-slate-600 hidden group-hover:block animate-in fade-in">≈ $0.00</div> 
                                     </div>
                                  </div>
                               </div>
                            </div>
                         </Card>
                      ))}
                      {currentNetworkTokens.length === 0 && <div className="text-center text-slate-500 py-12 bg-slate-900/30 rounded-2xl border border-slate-800 border-dashed">No assets found on this network.</div>}
                   </div>
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
                       <div className="bg-slate-950/50 border border-slate-700 p-4 rounded-2xl mb-2 transition focus-within:border-blue-500/50 focus-within:ring-1 focus-within:ring-blue-500/20">
                          <div className="flex justify-between text-xs mb-2 text-slate-400 font-medium">
                             <span>Pay</span>
                             <span className="cursor-pointer hover:text-blue-400 transition-colors" onClick={handleSwapMax}>Max: {swapTokenIn?.balance ? parseFloat(swapTokenIn.balance).toFixed(4) : '0'}</span>
                          </div>
                          <div className="flex items-center gap-3">
                             <input type="number" value={swapAmountIn} onChange={e=>setSwapAmountIn(e.target.value)} className="bg-transparent text-3xl font-bold w-full outline-none placeholder-slate-700 text-white" placeholder="0" />
                             <select value={swapTokenIn?.address||""} onChange={e=>setSwapTokenIn(currentNetworkTokens.find(t=>t.address===e.target.value)||null)} className="bg-slate-800 text-white rounded-xl p-2 font-bold border border-slate-700 outline-none focus:ring-2 focus:ring-blue-500 max-w-[130px] shadow-lg">
                                {currentNetworkTokens.map(t=><option key={t.address} value={t.address}>{t.symbol}</option>)}
                             </select>
                          </div>
                       </div>
                       
                       {/* Switcher */}
                       <div className="flex justify-center -my-5 relative z-20">
                          <button onClick={handleSwapSwitch} className="bg-slate-800 border-4 border-slate-900 p-2.5 rounded-xl hover:bg-slate-700 hover:rotate-180 transition duration-300 shadow-xl group">
                             <svg className="w-5 h-5 text-blue-400 group-hover:text-blue-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>
                          </button>
                       </div>
                       
                       {/* Output Token */}
                       <div className="bg-slate-950/50 border border-slate-700 p-4 rounded-2xl mt-2 mb-6 transition">
                          <div className="flex justify-between text-xs mb-2 text-slate-400 font-medium">
                             <span>Receive (Estimated)</span>
                             <span>Bal: {swapTokenOut?.balance ? parseFloat(swapTokenOut.balance).toFixed(4) : '0'}</span>
                          </div>
                          <div className="flex items-center gap-3">
                             <div className={`text-3xl font-bold w-full ${isQuoting ? 'text-slate-600 animate-pulse' : 'text-slate-300'}`}>
                                {isQuoting ? '...' : (swapAmountOut ? parseFloat(swapAmountOut).toFixed(6) : "0")}
                             </div>
                             <select value={swapTokenOut?.address||""} onChange={e=>setSwapTokenOut(currentNetworkTokens.find(t=>t.address===e.target.value)||null)} className="bg-slate-800 text-white rounded-xl p-2 font-bold border border-slate-700 outline-none focus:ring-2 focus:ring-blue-500 max-w-[130px] shadow-lg">
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
          
          {view === ViewState.WALLET_DETAILS && (
             <Card className="max-w-md mx-auto">
                <div className="flex gap-4 mb-6 items-center"><button onClick={()=>setView(ViewState.DASHBOARD)} className="p-2 hover:bg-slate-800 rounded-full transition"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg></button><h2 className="font-bold text-xl">Wallet Settings</h2></div>
                
                <div className="space-y-8">
                   <div>
                      <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 ml-1">Security</h3>
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
                         Factory Reset Wallet
                      </button>
                      <p className="text-[10px] text-slate-600 mt-2 text-center">This will wipe all data from this browser. Make sure you have your backup.</p>
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
