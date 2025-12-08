
import React, { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import { ViewState, WalletAccount, Token, VaultData, Network } from './types';
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
  executeSwap
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

  // Add Network Form
  const [newNetName, setNewNetName] = useState("");
  const [newNetRpc, setNewNetRpc] = useState("");
  const [newNetChainId, setNewNetChainId] = useState("");
  const [newNetSymbol, setNewNetSymbol] = useState("");
  const [newNetExplorer, setNewNetExplorer] = useState("");

  const [authPassword, setAuthPassword] = useState(""); // For sensitive actions like exporting keys

  // Browser State
  const [browserUrl, setBrowserUrl] = useState("");

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
    if (window.confirm("Reset app?")) { localStorage.clear(); window.location.reload(); }
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
  const isAuthView = [ViewState.DASHBOARD, ViewState.SEND, ViewState.RECEIVE, ViewState.SWAP, ViewState.BROWSER, ViewState.WALLET_DETAILS, ViewState.IMPORT_TOKEN, ViewState.ADD_NETWORK].includes(view);

  if (!isAuthView) {
     // Render Setup/Landing/Unlock (simplified reuse)
     if (view === ViewState.UNLOCK) return (
        <div className="min-h-screen flex items-center justify-center p-4">
          <Card className="max-w-md w-full text-center">
             <div className="flex justify-center mb-6">
               <img src={HEADER_LOGO_URL} className="h-24 w-auto object-contain" alt="Logo" />
             </div>
             <h1 className="text-2xl font-bold mb-4">Welcome Back</h1>
             <input type="password" value={unlockPassword} onChange={e=>setUnlockPassword(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded p-3 mb-4" placeholder="Password" />
             <Button onClick={handleUnlock} className="w-full">Unlock</Button>
             <button onClick={handleResetApp} className="text-red-500 text-xs mt-4">Reset App</button>
             {statusMessage && <p className="text-red-400 mt-2">{statusMessage.text}</p>}
          </Card>
        </div>
     );
     if (view === ViewState.LANDING) {
        return (
          <div className="min-h-screen flex flex-col bg-slate-950">
             {/* Landing Nav */}
             <div className="max-w-6xl mx-auto w-full p-6 flex justify-between items-center">
                <div className="flex items-center gap-3">
                   <img src={HEADER_LOGO_URL} className="h-12 w-auto" />
                </div>
                <Button variant="ghost" onClick={() => setView(ViewState.UNLOCK)}>Login</Button>
             </div>
             
             {/* Hero */}
             <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                <h1 className="text-5xl md:text-7xl font-bold mb-6 text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400">
                   Your Gateway to <br/> Decentralized Finance
                </h1>
                <p className="text-slate-400 mb-8 max-w-lg text-lg">
                   Secure, non-custodial, and AI-powered. Experience the next generation of crypto wallets on Binance Smart Chain and beyond.
                </p>
                <Button onClick={() => setView(ViewState.SETUP_PASSWORD)} className="px-10 py-4 text-xl shadow-blue-500/20 shadow-2xl">Create Free Wallet</Button>
             </div>

             {/* Features Grid */}
             <div className="max-w-6xl mx-auto w-full p-6 pb-20">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                   {/* Security Features */}
                   <Card className="p-6 border-t-4 border-t-green-500">
                      <h3 className="font-bold text-lg mb-2 text-green-400">Self Custodial</h3>
                      <p className="text-sm text-slate-400">Your keys NEVER leave your own device! You are the only one in control!</p>
                   </Card>
                   <Card className="p-6 border-t-4 border-t-blue-500">
                      <h3 className="font-bold text-lg mb-2 text-blue-400">PIN Protection</h3>
                      <p className="text-sm text-slate-400">Secure encryption and password authorization keeps your assets SAFU!</p>
                   </Card>
                   <Card className="p-6 border-t-4 border-t-purple-500">
                      <h3 className="font-bold text-lg mb-2 text-purple-400">Own Your Data</h3>
                      <p className="text-sm text-slate-400">We value your privacy! 3Twenty Wallet does not collect personal data or analytics!</p>
                   </Card>
                   <Card className="p-6 border-t-4 border-t-orange-500">
                      <h3 className="font-bold text-lg mb-2 text-orange-400">Multi-Chain</h3>
                      <p className="text-sm text-slate-400">Native support for BSC, Ethereum, Polygon and more. Manage all assets in one place.</p>
                   </Card>
                   
                   {/* Functional Features */}
                   <Card className="p-6">
                      <h3 className="font-bold text-lg mb-2">AI Assistant</h3>
                      <p className="text-sm text-slate-400">Built-in Gemini AI to answer your crypto questions instantly.</p>
                   </Card>
                   <Card className="p-6">
                      <h3 className="font-bold text-lg mb-2">DApp Browser</h3>
                      <p className="text-sm text-slate-400">Explore DeFi, NFTs, and Games safely from within the wallet.</p>
                   </Card>
                   <Card className="p-6">
                      <h3 className="font-bold text-lg mb-2">Instant Swap</h3>
                      <p className="text-sm text-slate-400">Trade tokens instantly with the best rates from decentralized exchanges.</p>
                   </Card>
                   <Card className="p-6">
                      <h3 className="font-bold text-lg mb-2">Hardware Support</h3>
                      <p className="text-sm text-slate-400">Add an extra layer of protection for your private key (Coming Soon)!</p>
                   </Card>
                </div>
             </div>
             <Footer />
          </div>
        );
     }
     if (view === ViewState.SETUP_PASSWORD) return (
       <div className="min-h-screen flex items-center justify-center p-4">
          <Card className="max-w-md w-full">
            <h1 className="text-xl font-bold mb-4">Set Password</h1>
            <input type="password" value={setupPassword} onChange={e=>setSetupPassword(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded p-2 mb-2" placeholder="Password" />
            <input type="password" value={setupConfirm} onChange={e=>setSetupConfirm(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded p-2 mb-4" placeholder="Confirm" />
            <Button onClick={handleSetupPassword} className="w-full">Next</Button>
          </Card>
       </div>
     );
     if (view === ViewState.ONBOARDING) return (
       <div className="min-h-screen flex items-center justify-center p-4">
          <Card className="max-w-md w-full">
            <h1 className="text-xl font-bold mb-6">Setup Wallet</h1>
            <Button onClick={handleStartCreateWallet} className="w-full mb-4">Create New</Button>
            <div className="relative my-4">
               <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-slate-700"></span></div>
               <div className="relative flex justify-center text-xs uppercase"><span className="bg-slate-800 px-2 text-slate-500">Or Import</span></div>
            </div>
            <input value={importInput} onChange={e=>setImportInput(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded p-2 mb-2" placeholder="Private Key or Mnemonic" />
            <Button onClick={handleImportWallet} variant="secondary" className="w-full">Import Wallet</Button>
          </Card>
       </div>
     );
     // Seed Backup
     if (view === ViewState.SEED_BACKUP && tempWallet) return (
        <div className="min-h-screen flex items-center justify-center p-4">
           <Card className="max-w-md w-full">
              <h1 className="text-xl font-bold mb-4">Backup Seed Phrase</h1>
              <p className="text-sm text-red-400 mb-4 bg-red-900/20 p-2 rounded">Write these 12 words down. If you lose them, you lose your funds forever.</p>
              <div className="grid grid-cols-3 gap-2 mb-6">
                 {tempWallet.mnemonic?.split(" ").map((word, i) => (
                    <div key={i} className="bg-slate-900 p-2 rounded text-xs text-center"><span className="text-slate-500 mr-1">{i+1}.</span>{word}</div>
                 ))}
              </div>
              <Button onClick={handleSeedBackupConfirmed} className="w-full">I Have Saved Them</Button>
           </Card>
        </div>
     );
     // Seed Verify
     if (view === ViewState.SEED_VERIFY && tempWallet) return (
        <div className="min-h-screen flex items-center justify-center p-4">
           <Card className="max-w-md w-full">
              <h1 className="text-xl font-bold mb-4">Verify Seed</h1>
              <div className="space-y-4 mb-6">
                 {seedVerifyIndices.map(idx => (
                    <div key={idx}>
                       <label className="text-xs text-slate-400 block mb-1">Word #{idx+1}</label>
                       <input 
                          className="w-full bg-slate-900 border border-slate-700 rounded p-2"
                          onChange={(e) => {
                             const val = e.target.value.toLowerCase().trim();
                             setSeedVerifyInputs(prev => ({...prev, [idx]: val}));
                          }}
                       />
                    </div>
                 ))}
              </div>
              <Button 
                 onClick={() => {
                    const words = tempWallet.mnemonic?.split(" ") || [];
                    const isValid = seedVerifyIndices.every(idx => words[idx] === seedVerifyInputs[idx]);
                    if(isValid) handleVerifySeed();
                    else setStatusMessage({type:'error', text: 'Incorrect words. Try again.'});
                 }} 
                 className="w-full"
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
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100 font-sans">
       <header className="bg-slate-900/80 backdrop-blur-md border-b border-slate-800 sticky top-0 z-40">
          <div className="max-w-6xl mx-auto px-4 py-3 flex justify-between items-center">
             {/* Logo Section */}
             <div className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition" onClick={()=>setView(ViewState.DASHBOARD)}>
                <img src={HEADER_LOGO_URL} className="h-10 w-auto object-contain" alt="Logo" />
             </div>
             
             {/* Center Nav (Desktop) */}
             <div className="hidden md:flex gap-1 bg-slate-800/50 p-1 rounded-lg border border-slate-700/50">
                {[
                   {v: ViewState.DASHBOARD, label: 'Wallet'}, 
                   {v: ViewState.SWAP, label: 'Swap'}, 
                   {v: ViewState.BROWSER, label: 'Browser'}, 
                   {v: ViewState.WALLET_DETAILS, label: 'Settings'}
                ].map(item => (
                   <button 
                      key={item.v}
                      onClick={()=>setView(item.v)} 
                      className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${view===item.v ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
                   >
                      {item.label}
                   </button>
                ))}
             </div>

             {/* Right Section: Network & Lock */}
             <div className="flex items-center gap-3">
                {/* Network Selector */}
                <div className="relative group z-50">
                   <button className="bg-slate-800 px-3 py-1.5 rounded-lg text-sm flex items-center gap-2 border border-slate-700 hover:border-slate-600 transition min-w-[140px] justify-between">
                      <div className="flex items-center gap-2">
                         <span className="w-2 h-2 rounded-full bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.5)]"></span>
                         <span className="truncate max-w-[80px]">{activeNetwork.name}</span>
                      </div>
                      <span className="text-[10px] text-slate-500">▼</span>
                   </button>
                   <div className="absolute top-full right-0 mt-2 w-56 bg-slate-800 border border-slate-700 rounded-lg shadow-2xl hidden group-hover:block overflow-hidden">
                      <div className="p-2 text-xs font-bold text-slate-500 uppercase tracking-wider">Select Network</div>
                      {NETWORKS.map((net, i) => (
                         <div key={i} onClick={() => { setActiveNetwork(net); setView(ViewState.DASHBOARD); }} className="px-4 py-2 hover:bg-slate-700 cursor-pointer text-sm flex items-center justify-between group-item">
                            {net.name}
                            {activeNetwork.chainId === net.chainId && <span className="text-green-400">✓</span>}
                         </div>
                      ))}
                      {customNetworks.map((net, i) => (
                         <div key={`cust-${i}`} onClick={() => { setActiveNetwork(net); setView(ViewState.DASHBOARD); }} className="px-4 py-2 hover:bg-slate-700 cursor-pointer text-sm flex items-center justify-between">
                            {net.name} (Custom)
                            {activeNetwork.chainId === net.chainId && <span className="text-green-400">✓</span>}
                         </div>
                      ))}
                      <div className="h-px bg-slate-700 my-1"></div>
                      <div onClick={() => setView(ViewState.ADD_NETWORK)} className="px-4 py-3 hover:bg-slate-700 cursor-pointer text-sm text-blue-400 flex items-center gap-2">
                         <span>+</span> Add Custom Network
                      </div>
                   </div>
                </div>
                
                {/* Lock Button */}
                <button 
                   onClick={handleLock} 
                   className="bg-slate-800 p-2 rounded-lg text-slate-400 hover:text-red-400 hover:bg-slate-700 border border-slate-700 transition" 
                   title="Lock Wallet"
                >
                   <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>
                </button>
                
                {/* Mobile Menu Toggle */}
                <button onClick={()=>setIsMenuOpen(!isMenuOpen)} className="md:hidden p-2 text-slate-400">
                   <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"></path></svg>
                </button>
             </div>
          </div>
          
          {/* Mobile Menu */}
          {isMenuOpen && (
             <div className="md:hidden bg-slate-900 border-t border-slate-800 p-4 space-y-1 shadow-xl absolute w-full z-50">
                <button onClick={()=>navigateTo(ViewState.DASHBOARD)} className="block w-full text-left p-3 rounded hover:bg-slate-800">Wallet Dashboard</button>
                <button onClick={()=>navigateTo(ViewState.SWAP)} className="block w-full text-left p-3 rounded hover:bg-slate-800">Token Swap</button>
                <button onClick={()=>navigateTo(ViewState.BROWSER)} className="block w-full text-left p-3 rounded hover:bg-slate-800">DApp Browser</button>
                <button onClick={()=>navigateTo(ViewState.WALLET_DETAILS)} className="block w-full text-left p-3 rounded hover:bg-slate-800">Settings</button>
                <button onClick={handleLock} className="block w-full text-left p-3 rounded hover:bg-slate-800 text-red-400">Lock Wallet</button>
             </div>
          )}
       </header>

       <main className="flex-1 max-w-5xl mx-auto w-full p-4 lg:p-6">
          {statusMessage && (
             <div className={`p-4 mb-6 rounded-lg border flex items-center gap-3 animate-in slide-in-from-top-2 ${statusMessage.type==='error'?'bg-red-500/10 border-red-500/20 text-red-400':'bg-green-500/10 border-green-500/20 text-green-400'}`}>
                {statusMessage.type==='error' ? (
                   <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                ) : (
                   <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
                )}
                {statusMessage.text}
             </div>
          )}

          {view === ViewState.ADD_NETWORK && (
             <Card>
                <h2 className="text-xl font-bold mb-6">Add Custom Network</h2>
                <div className="space-y-4">
                   <div><label className="text-xs text-slate-500 uppercase font-bold tracking-wider">Network Name</label><input value={newNetName} onChange={e=>setNewNetName(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded p-3 mt-1 focus:border-blue-500 outline-none transition" /></div>
                   <div><label className="text-xs text-slate-500 uppercase font-bold tracking-wider">RPC URL</label><input value={newNetRpc} onChange={e=>setNewNetRpc(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded p-3 mt-1 focus:border-blue-500 outline-none transition" /></div>
                   <div><label className="text-xs text-slate-500 uppercase font-bold tracking-wider">Chain ID</label><input type="number" value={newNetChainId} onChange={e=>setNewNetChainId(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded p-3 mt-1 focus:border-blue-500 outline-none transition" /></div>
                   <div><label className="text-xs text-slate-500 uppercase font-bold tracking-wider">Currency Symbol</label><input value={newNetSymbol} onChange={e=>setNewNetSymbol(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded p-3 mt-1 focus:border-blue-500 outline-none transition" /></div>
                   <div className="flex gap-3 mt-6">
                      <Button onClick={()=>setView(ViewState.DASHBOARD)} variant="secondary" className="w-full">Cancel</Button>
                      <Button onClick={handleAddNetwork} className="w-full">Add Network</Button>
                   </div>
                </div>
             </Card>
          )}

          {view === ViewState.DASHBOARD && activeWallet && (
             <div className="animate-in fade-in space-y-6">
                <Card className="text-center py-10 relative overflow-hidden border-0">
                   {/* Gradient Background */}
                   <div className="absolute inset-0 bg-gradient-to-br from-slate-800 via-slate-900 to-black z-0"></div>
                   <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-900/40 via-transparent to-transparent z-0"></div>
                   
                   <div className="relative z-10">
                      <p className="text-slate-400 text-sm font-bold uppercase tracking-widest mb-1">{activeNetwork.name} Total Balance</p>
                      <h2 className="text-5xl md:text-6xl font-bold text-white mb-8 tracking-tight">
                         {currentNetworkTokens.find(t=>t.isNative)?.balance || "0.00"} <span className="text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 to-yellow-500 text-2xl md:text-3xl font-medium">{activeNetwork.symbol}</span>
                      </h2>
                      <div className="flex justify-center gap-4">
                         <Button onClick={()=>setView(ViewState.SEND)} className="px-8 py-3 rounded-full">Send</Button>
                         <Button onClick={()=>setView(ViewState.SWAP)} variant="secondary" className="px-8 py-3 rounded-full bg-slate-700/50 border border-slate-600 hover:bg-slate-700">Swap</Button>
                         <Button onClick={()=>setView(ViewState.RECEIVE)} variant="ghost" className="px-8 py-3 rounded-full border border-slate-700 hover:bg-slate-800">Receive</Button>
                      </div>
                   </div>
                </Card>
                
                <div className="flex justify-between items-center px-1">
                   <h3 className="font-bold text-xl text-slate-200">Assets</h3>
                   <button onClick={()=>{setImportTokenAddress(""); setImportTokenPreview(null); setView(ViewState.IMPORT_TOKEN)}} className="text-blue-400 text-sm font-medium hover:text-blue-300 transition">+ Import Token</button>
                </div>
                
                <div className="space-y-3">
                   {currentNetworkTokens.map(t => (
                      <Card key={t.address} className="flex justify-between items-center p-4 hover:bg-slate-800/80 transition cursor-default group">
                         <div className="flex items-center gap-4">
                            <TokenIcon symbol={t.symbol} address={t.address} src={t.logoUrl} className="w-12 h-12" />
                            <div>
                               <div className="font-bold text-lg text-slate-100">{t.name}</div>
                               <div className="text-xs text-slate-400 font-mono">{t.symbol}</div>
                            </div>
                         </div>
                         <div className="text-right">
                            <div className="font-mono text-lg font-medium text-slate-200">{parseFloat(t.balance) > 0 ? parseFloat(t.balance).toFixed(6) : "0.00"}</div>
                            <div className="text-xs text-slate-500 opacity-0 group-hover:opacity-100 transition">Balance</div>
                         </div>
                      </Card>
                   ))}
                   {currentNetworkTokens.length === 0 && <div className="text-center text-slate-500 py-8">No assets found on this network.</div>}
                </div>
             </div>
          )}
          
          {/* Swap View */}
          {view === ViewState.SWAP && (
             <div className="max-w-lg mx-auto">
                <Card className="border-slate-700/50 shadow-2xl">
                   <div className="flex justify-between items-center mb-6">
                      <h2 className="text-xl font-bold">Swap Tokens</h2>
                      <div className="text-xs bg-slate-800 px-2 py-1 rounded text-slate-400">{activeNetwork.name}</div>
                   </div>
                   
                   {!activeNetwork.routerAddress ? (
                      <div className="text-center py-8">
                         <div className="text-red-400 bg-red-900/20 p-4 rounded-lg mb-2">Swapping is not configured for this network.</div>
                         <p className="text-sm text-slate-500">Please switch to BSC, Ethereum, or Polygon.</p>
                      </div>
                   ) : (
                     <>
                       {/* Input Token */}
                       <div className="bg-slate-900/50 border border-slate-700 p-4 rounded-xl mb-2 transition focus-within:border-blue-500/50">
                          <div className="flex justify-between text-xs mb-2 text-slate-400">
                             <span>Pay</span>
                             <span className="cursor-pointer hover:text-blue-400" onClick={handleSwapMax}>Max: {swapTokenIn?.balance}</span>
                          </div>
                          <div className="flex items-center gap-3">
                             <input type="number" value={swapAmountIn} onChange={e=>setSwapAmountIn(e.target.value)} className="bg-transparent text-2xl font-bold w-full outline-none placeholder-slate-600" placeholder="0.0" />
                             <select value={swapTokenIn?.address||""} onChange={e=>setSwapTokenIn(currentNetworkTokens.find(t=>t.address===e.target.value)||null)} className="bg-slate-800 text-white rounded-lg p-2 font-medium border border-slate-700 outline-none focus:ring-2 focus:ring-blue-500 max-w-[120px]">
                                {currentNetworkTokens.map(t=><option key={t.address} value={t.address}>{t.symbol}</option>)}
                             </select>
                          </div>
                       </div>
                       
                       {/* Switcher */}
                       <div className="flex justify-center -my-5 relative z-10">
                          <button onClick={handleSwapSwitch} className="bg-slate-800 border-4 border-slate-950 p-2 rounded-full hover:bg-slate-700 hover:rotate-180 transition duration-300">
                             <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>
                          </button>
                       </div>
                       
                       {/* Output Token */}
                       <div className="bg-slate-900/50 border border-slate-700 p-4 rounded-xl mt-2 mb-6 transition">
                          <div className="flex justify-between text-xs mb-2 text-slate-400">
                             <span>Receive (Estimated)</span>
                             <span>Bal: {swapTokenOut?.balance}</span>
                          </div>
                          <div className="flex items-center gap-3">
                             <div className={`text-2xl font-bold w-full ${isQuoting ? 'text-slate-500 animate-pulse' : 'text-slate-300'}`}>
                                {isQuoting ? 'Fetching...' : (swapAmountOut || "0.0")}
                             </div>
                             <select value={swapTokenOut?.address||""} onChange={e=>setSwapTokenOut(currentNetworkTokens.find(t=>t.address===e.target.value)||null)} className="bg-slate-800 text-white rounded-lg p-2 font-medium border border-slate-700 outline-none focus:ring-2 focus:ring-blue-500 max-w-[120px]">
                                {currentNetworkTokens.map(t=><option key={t.address} value={t.address}>{t.symbol}</option>)}
                             </select>
                          </div>
                       </div>
                       
                       {/* Price Impact / Details */}
                       {swapAmountOut && (
                          <div className="mb-6 p-3 bg-blue-900/20 rounded-lg text-xs space-y-1">
                             <div className="flex justify-between text-slate-400"><span>Network</span><span>{activeNetwork.name}</span></div>
                             <div className="flex justify-between text-slate-400"><span>Slippage Tolerance</span><span>2%</span></div>
                          </div>
                       )}

                       {swapNeedsApproval ? (
                          <Button onClick={handleSwapApprove} className="w-full py-4 text-lg" isLoading={isLoading}>Enable {swapTokenIn?.symbol}</Button> 
                       ) : (
                          <Button onClick={handleSwapExecute} className="w-full py-4 text-lg" isLoading={isLoading} disabled={!swapAmountIn || !swapAmountOut}>Swap Now</Button>
                       )}
                     </>
                   )}
                </Card>
             </div>
          )}
          
          {/* Send View */}
          {view === ViewState.SEND && (
             <Card className="max-w-lg mx-auto">
                <div className="flex gap-4 items-center mb-6">
                   <button onClick={()=>setView(ViewState.DASHBOARD)} className="p-2 hover:bg-slate-800 rounded-full"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg></button>
                   <h2 className="font-bold text-xl">Send Asset</h2>
                </div>
                <div className="space-y-6">
                   <div>
                      <label className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-2 block">Asset</label>
                      <select className="w-full bg-slate-900 border border-slate-700 rounded-xl p-4 outline-none focus:border-blue-500 transition" onChange={e=>setSelectedTokenForSend(currentNetworkTokens.find(t=>t.address===e.target.value)||null)} value={selectedTokenForSend?.address||""}>
                         <option value="">Select Asset</option>
                         {currentNetworkTokens.map(t=><option key={t.address} value={t.address}>{t.symbol} - {parseFloat(t.balance).toFixed(4)} Available</option>)}
                      </select>
                   </div>
                   
                   <div>
                      <label className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-2 block">Recipient Address</label>
                      <input value={sendAddress} onChange={e=>setSendAddress(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-xl p-4 outline-none focus:border-blue-500 transition font-mono text-sm" placeholder="0x..." />
                   </div>
                   
                   <div>
                      <label className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-2 block">Amount</label>
                      <div className="relative">
                         <input type="number" value={sendAmount} onChange={e=>setSendAmount(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-xl p-4 outline-none focus:border-blue-500 transition pr-20" placeholder="0.0" />
                         <button onClick={handleSendMax} className="absolute right-2 top-2 bottom-2 px-3 bg-blue-900/30 text-blue-400 hover:bg-blue-900/50 rounded-lg text-xs font-bold uppercase tracking-wider">Max</button>
                      </div>
                   </div>
                   
                   <Button onClick={handleSend} className="w-full py-4 text-lg mt-4" disabled={!selectedTokenForSend || !sendAddress || !sendAmount}>Confirm Send</Button>
                </div>
             </Card>
          )}

          {/* Import Token View */}
          {view === ViewState.IMPORT_TOKEN && (
             <Card className="max-w-lg mx-auto">
                <div className="flex gap-4 items-center mb-6"><button onClick={()=>setView(ViewState.DASHBOARD)} className="p-2 hover:bg-slate-800 rounded-full"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg></button><h2 className="font-bold text-xl">Import Token</h2></div>
                <p className="text-sm text-slate-400 mb-4">Add a custom token to your {activeNetwork.name} wallet list.</p>
                <div className="flex gap-2 mb-6">
                   <input value={importTokenAddress} onChange={e=>setImportTokenAddress(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 outline-none focus:border-blue-500 font-mono text-sm" placeholder="Contract Address (0x...)" />
                   <Button onClick={handleCheckToken} isLoading={isLoading}>Check</Button>
                </div>
                {importTokenPreview && (
                   <div className="bg-slate-800/50 border border-slate-700 p-6 rounded-xl text-center animate-in zoom-in-95">
                      <div className="flex justify-center mb-3">
                         <TokenIcon symbol={importTokenPreview.symbol} address={importTokenPreview.address} className="w-16 h-16" />
                      </div>
                      <div className="font-bold text-xl mb-1">{importTokenPreview.name}</div>
                      <div className="text-slate-400 text-sm mb-6">{importTokenPreview.symbol} • {importTokenPreview.decimals} Decimals</div>
                      <Button onClick={handleConfirmImportToken} className="w-full">Add to Wallet</Button>
                   </div>
                )}
             </Card>
          )}
          
          {view === ViewState.RECEIVE && activeWallet && (
             <Card className="max-w-md mx-auto text-center py-10">
                <button onClick={()=>setView(ViewState.DASHBOARD)} className="mb-6 text-slate-400 hover:text-white flex items-center justify-center gap-1 mx-auto"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg> Back to Wallet</button>
                <h2 className="text-2xl font-bold mb-2">Receive Assets</h2>
                <p className="text-slate-400 text-sm mb-8">Scan to send {activeNetwork.name} assets</p>
                <div className="bg-white p-4 inline-block rounded-xl mb-8 shadow-2xl"><img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${activeWallet.address}`} className="w-48 h-48" /></div>
                <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl break-all font-mono text-sm text-slate-300 select-all hover:bg-slate-800 transition cursor-copy" onClick={() => {navigator.clipboard.writeText(activeWallet.address); setStatusMessage({type:'success', text:'Address Copied!'})}} title="Click to Copy">
                   {activeWallet.address}
                   <div className="text-xs text-blue-400 mt-2 font-sans uppercase font-bold tracking-wider">Click to Copy</div>
                </div>
             </Card>
          )}
          
          {view === ViewState.BROWSER && (
             <div className="animate-in fade-in">
                <div className="flex gap-4 mb-6 items-center"><button onClick={()=>setView(ViewState.DASHBOARD)} className="p-2 hover:bg-slate-800 rounded-full"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg></button><h2 className="text-2xl font-bold">DApp Browser</h2></div>
                <div className="bg-slate-800 p-2 rounded-xl flex gap-2 mb-8 border border-slate-700 focus-within:border-blue-500 transition shadow-lg">
                   <div className="flex items-center pl-3 text-slate-500"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg></div>
                   <input value={browserUrl} onChange={e=>setBrowserUrl(e.target.value)} className="bg-transparent w-full outline-none px-2 py-2 placeholder-slate-500" placeholder="Search or enter website URL" onKeyDown={e=>{if(e.key==='Enter') handleBrowserGo()}} />
                   <Button size="sm" onClick={handleBrowserGo}>Go</Button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                   {DAPP_LIST.map(d=>(
                      <Card key={d.name} className="hover:bg-slate-800 cursor-pointer transition hover:-translate-y-1 group border-slate-700/50" onClick={()=>window.open(d.url, '_blank')}>
                         <div className={`w-12 h-12 rounded-lg mb-3 bg-gradient-to-br ${d.color} shadow-lg group-hover:shadow-blue-500/20 transition`}></div>
                         <div className="font-bold text-lg">{d.name}</div>
                         <div className="text-xs text-slate-400 mb-2 uppercase tracking-wide font-bold">{d.category}</div>
                         <p className="text-xs text-slate-500 line-clamp-2">{d.description}</p>
                      </Card>
                   ))}
                </div>
             </div>
          )}
          
          {view === ViewState.WALLET_DETAILS && (
             <Card className="max-w-md mx-auto">
                <div className="flex gap-4 mb-6 items-center"><button onClick={()=>setView(ViewState.DASHBOARD)} className="p-2 hover:bg-slate-800 rounded-full"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg></button><h2 className="font-bold text-xl">Wallet Settings</h2></div>
                
                <div className="space-y-6">
                   <div>
                      <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-2">Security</h3>
                      <div className="p-4 bg-red-500/5 border border-red-500/20 rounded-xl">
                         <h3 className="text-red-400 font-bold mb-2 flex items-center gap-2"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg> Export Private Key</h3>
                         <p className="text-xs text-slate-500 mb-4">Viewing your private key is dangerous. Ensure no one is watching.</p>
                         <input type="password" value={authPassword} onChange={e=>setAuthPassword(e.target.value)} placeholder="Enter App Password" className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 mb-3 text-sm" />
                         {authPassword===password && activeWallet ? (
                            <div className="bg-slate-950 p-3 rounded-lg font-mono text-xs break-all border border-slate-800 text-yellow-500 select-all">{activeWallet.privateKey}</div>
                         ) : <div className="text-xs text-slate-600 italic">Key hidden</div>}
                      </div>
                   </div>
                   
                   <div>
                      <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-2">App Data</h3>
                      <button onClick={handleResetApp} className="w-full border border-red-900/50 text-red-500 p-3 rounded-xl hover:bg-red-900/10 transition text-sm font-bold">Factory Reset Wallet</button>
                   </div>
                </div>
             </Card>
          )}

       </main>
       <Footer />
       
       {/* Floating AI Chat Button */}
       <button onClick={()=>setShowAiChat(!showAiChat)} className="fixed bottom-6 right-6 w-14 h-14 bg-blue-600 hover:bg-blue-500 rounded-full shadow-2xl shadow-blue-900/50 flex items-center justify-center text-white z-50 transition hover:scale-105">
         <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
       </button>
       {showAiChat && (
          <div className="fixed bottom-24 right-6 w-96 max-w-[90vw] h-[500px] max-h-[70vh] bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl flex flex-col z-50 animate-in slide-in-from-bottom-10 overflow-hidden">
             <div className="p-4 border-b border-slate-800 bg-slate-800/50 flex justify-between items-center">
                <div className="font-bold flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span> Gemini AI Assistant</div>
                <button onClick={()=>setShowAiChat(false)} className="text-slate-400 hover:text-white">×</button>
             </div>
             <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-950/50">
                {chatHistory.length === 0 && <div className="text-center text-slate-500 text-sm mt-10">Ask me anything about your wallet, tokens, or DeFi!</div>}
                {chatHistory.map((m,i)=>(
                   <div key={i} className={`flex ${m.role==='user'?'justify-end':'justify-start'}`}>
                      <div className={`p-3 rounded-2xl text-sm max-w-[85%] ${m.role==='user'?'bg-blue-600 text-white rounded-br-none':'bg-slate-800 text-slate-200 rounded-bl-none'}`}>{m.text}</div>
                   </div>
                ))}
                {isAiThinking && <div className="flex justify-start"><div className="bg-slate-800 p-3 rounded-2xl rounded-bl-none text-xs italic text-slate-400 flex gap-1 items-center"><span>Thinking</span><span className="animate-bounce">.</span><span className="animate-bounce delay-100">.</span><span className="animate-bounce delay-200">.</span></div></div>}
             </div>
             <div className="p-3 border-t border-slate-800 bg-slate-900 flex gap-2">
                <input value={chatInput} onChange={e=>setChatInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter') handleAiAsk()}} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm focus:border-blue-500 outline-none transition" placeholder="Type your question..." />
                <button onClick={handleAiAsk} className="bg-blue-600 hover:bg-blue-500 text-white p-3 rounded-xl transition"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9-2-9-18-9 18 9-2zm0 0v-8" /></svg></button>
             </div>
          </div>
       )}
    </div>
  );
}
